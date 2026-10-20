// Tests — fiabilité de la synchro terrain (portage de la production,
// commit 7a1b291 « fix(sync) », sur src/offline/) :
//   - items laissés 'inflight' par une fermeture d'onglet remis en file ;
//   - pas de réveil à vide pour des items en cours d'envoi ;
//   - fiche gardée _pending si un autre PATCH attend encore ;
//   - curseurs de pull (table vide, rien de neuf, création distante) ;
//   - listes annuaire / sites réconciliées réseau + local ;
//   - premier rattachement d'un appareil ancien à un club.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline, loadOfflineApi } from './helpers/offline-harness.js';
import { bindLocalDataToClub } from '../src/offline/club-scope.js';

let win;

function mockFetch(responses) {
  const calls = [];
  win.fetch = globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: (opts.method || 'GET').toUpperCase(), body: opts.body ? JSON.parse(opts.body) : null });
    const next = responses.shift();
    if (!next) throw new Error(`Aucune réponse simulée pour ${url}`);
    const { status = 200, data = null } = await next(url);
    const ok = status >= 200 && status < 300;
    return { ok, status, json: async () => ({ ok, data }) };
  };
  return calls;
}

beforeEach(() => {
  win = bootOffline();
  win.netStatus = () => ({ online: true });
});

describe('outbox — items interrompus en plein envoi', () => {
  test('recoverInflight repasse les inflight en pending (la saisie repart)', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Valbuena' });
    await win.outbox.markInflight(it.id);
    assert.equal((await win.outbox.ready()).length, 0, "invisible tant qu'inflight");

    assert.equal(await win.outbox.recoverInflight(), 1);
    const ready = await win.outbox.ready();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].payload.nom, 'Valbuena');
  });

  test('recoverInflight ne touche ni aux pending ni aux items à revoir', async () => {
    const a = await win.outbox.enqueue('diver.create', { id: 'a' });
    await win.outbox.markFailed(a.id, new Error('réseau'));
    const b = await win.outbox.enqueue('diver.create', { id: 'b' });
    await win.outbox.markReview(b.id, new Error('422'));
    const before = [await win.outbox.get(a.id), await win.outbox.get(b.id)];
    assert.equal(await win.outbox.recoverInflight(), 0);
    assert.deepEqual([await win.outbox.get(a.id), await win.outbox.get(b.id)], before);
  });

  test('nextWakeMs ignore les inflight (pas de réveil en boucle à vide)', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'a' });
    await win.outbox.markInflight(it.id);
    assert.equal(await win.outbox.nextWakeMs(), null);
  });
});

describe('sync — dive.update et saisie concurrente', () => {
  test('la fiche reste _pending si une écriture attend encore', async () => {
    const u = 'uuid-1';
    await win.offlineStore.put('dives', u, { client_uuid: u, server_id: 42, _pending: true });
    const first = await win.outbox.enqueue('dive.update', { client_uuid: u, patch: { answers: { a: 1 } } });
    await win.outbox.markInflight(first.id);
    // Saisie poursuivie pendant l'envoi : nouvel item (l'inflight n'absorbe rien).
    await win.outbox.coalesce(
      'dive.update',
      { client_uuid: u, patch: { answers: { a: 2 } } },
      (i) => i.payload.client_uuid === u,
      (p, n) => ({ client_uuid: u, patch: { ...p.patch, ...n.patch } }),
    );
    assert.equal(await win.outbox.size(), 2);

    mockFetch([async () => ({ data: { id: 42 } })]);
    await win.sync._defaultHandlers['dive.update'](first);
    assert.equal((await win.offlineStore.get('dives', u))._pending, true);
  });

  test("la fiche repasse à _pending=false quand plus rien n'attend", async () => {
    const u = 'uuid-1';
    await win.offlineStore.put('dives', u, { client_uuid: u, server_id: 42, _pending: true });
    const only = await win.outbox.enqueue('dive.update', { client_uuid: u, patch: { answers: { a: 1 } } });
    mockFetch([async () => ({ data: { id: 42 } })]);
    await win.sync._defaultHandlers['dive.update'](only);
    assert.equal((await win.offlineStore.get('dives', u))._pending, false);
  });
});

describe('sync — curseurs de pull', () => {
  test('une table vide côté serveur ne déclenche aucun pull', async () => {
    const calls = mockFetch([async () => ({ data: { divers: {}, sites: {}, dives: {} } })]);
    await win.sync._pullIncremental();
    assert.equal(calls.length, 1, 'seul /api/sync/state est appelé');
  });

  test('rien de neuf depuis le dernier passage : aucun pull', async () => {
    await win.offlineStore.put('meta', 'sync', { divers: '2026-09-04T19:00:00' });
    const calls = mockFetch([
      async () => ({ data: { divers: { updated_at: '2026-09-04T19:00:00' }, sites: {}, dives: {} } }),
    ]);
    await win.sync._pullIncremental();
    assert.equal(calls.length, 1);
  });

  test("une création d'un autre membre est tirée et fait avancer le curseur", async () => {
    await win.offlineStore.put('meta', 'sync', { divers: '2026-09-04T19:00:00' });
    const calls = mockFetch([
      async () => ({ data: { divers: { updated_at: '2026-09-04T19:11:22' }, sites: {}, dives: {} } }),
      async () => ({ data: [{ id: 'd-9', nom: 'Valbuena', prenom: 'Alain' }] }),
    ]);
    await win.sync._pullIncremental();
    assert.match(calls[1].url, /^\/api\/divers\?since=/);
    assert.equal((await win.offlineStore.get('divers', 'd-9')).nom, 'Valbuena');
    assert.equal((await win.offlineStore.get('meta', 'sync')).divers, '2026-09-04T19:11:22');
  });

  test("le pull d'une fiche modifiée ailleurs préserve son contenu local", async () => {
    const u = 'uuid-1';
    await win.offlineStore.put('dives', u, {
      client_uuid: u,
      server_id: 42,
      site_nom: 'Hendaye',
      answers: { dp_nom: 'X' },
      palanquees: [{ membres: [] }],
      synced: true,
    });
    mockFetch([
      async () => ({ data: { divers: {}, sites: {}, dives: { updated_at: '2026-09-04T19:00:00' } } }),
      async () => ({ data: [{ id: 42, client_uuid: u, site_nom: 'Hendaye, bouée 3', status: 'in_progress' }] }),
    ]);
    await win.sync._pullIncremental();
    const got = await win.offlineStore.get('dives', u);
    assert.equal(got.site_nom, 'Hendaye, bouée 3');
    assert.deepEqual(got.answers, { dp_nom: 'X' }, "la fiche n'est pas vidée par le résumé");
  });
});

describe('offline-api — listes annuaire réconciliées', () => {
  let serveur, reseauKo;
  const noms = (list) => list.map((d) => d.nom);

  beforeEach(() => {
    serveur = [{ id: 'srv-1', nom: 'Martin', prenom: 'Paul' }];
    reseauKo = false;
    const net = async () => {
      if (reseauKo) throw new Error('offline');
      return serveur.map((d) => ({ ...d }));
    };
    win.api = {
      divers: { list: net, create: async () => {}, update: async () => {}, delete: async () => {} },
      sites: { list: async () => [], create: async () => {}, update: async () => {}, delete: async () => {} },
      dives: {
        list: async () => [],
        get: async () => {},
        create: async () => {},
        update: async () => {},
        delete: async () => {},
      },
    };
    loadOfflineApi(win);
  });

  test("un plongeur créé reste visible tant qu'il n'est pas poussé", async () => {
    await win.api.divers.create({ nom: 'Valbuena', prenom: 'Alain' });
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin', 'Valbuena']);
  });

  test('une fois poussé, il vient du serveur sans doublon', async () => {
    const d = await win.api.divers.create({ nom: 'Valbuena', prenom: 'Alain' });
    serveur.push({ id: d.id, nom: 'Valbuena', prenom: 'Alain' });
    await win.offlineStore.put('divers', d.id, { ...d, _pending: false });
    const list = await win.api.divers.list();
    assert.deepEqual(noms(list), ['Martin', 'Valbuena']);
  });

  test('tri du serveur (nom, prénom) conservé', async () => {
    serveur = [
      { id: 's1', nom: 'Aubert' },
      { id: 's2', nom: 'Zola' },
    ];
    await win.api.divers.create({ nom: 'Martin', prenom: 'Paul' });
    assert.deepEqual(noms(await win.api.divers.list()), ['Aubert', 'Martin', 'Zola']);
  });

  test('un plongeur supprimé ailleurs est purgé du cache local', async () => {
    await win.offlineStore.put('divers', 'fantome', { id: 'fantome', nom: 'Supprimé', _pending: false });
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin']);
    assert.equal(await win.offlineStore.get('divers', 'fantome'), null, 'ne ressuscite pas hors ligne');
  });

  test('les modifications locales priment sur la version serveur', async () => {
    await win.api.divers.update('srv-1', { nom: 'Martin', prenom: 'Paul-Édouard' });
    assert.equal((await win.api.divers.list())[0].prenom, 'Paul-Édouard');
  });

  test('une suppression pas encore envoyée reste masquée', async () => {
    await win.api.divers.list();
    await win.api.divers.delete('srv-1');
    assert.deepEqual(noms(await win.api.divers.list()), [], 'le serveur la renvoie encore, elle reste cachée');
    reseauKo = true;
    assert.deepEqual(noms(await win.api.divers.list()), []);
  });

  test('hors ligne : la liste vient du store, sans les lignes supprimées', async () => {
    await win.api.divers.list();
    await win.api.divers.create({ nom: 'Valbuena', prenom: 'Alain' });
    await win.offlineStore.put('divers', 'x', { id: 'x', nom: 'Parti', deleted: true });
    reseauKo = true;
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin', 'Valbuena']);
  });
});

describe("club-scope — premier rattachement d'un appareil ancien", () => {
  test("lignes synchronisées retirées (espace d'origine inconnu), lignes en attente gardées", async () => {
    await win.offlineStore.put('divers', 'synced', { id: 'synced', nom: 'A' });
    await win.offlineStore.put('divers', 'pending', { id: 'pending', nom: 'B', _pending: true });
    await win.offlineStore.put('dives', 'x', { client_uuid: 'x', synced: true });
    await win.offlineStore.put('dives', 'y', { client_uuid: 'y', synced: false, _pending: true });
    await win.offlineStore.put('meta', 'sync', { divers: '2026-09-01T00:00:00' });
    await win.outbox.enqueue('diver.create', { id: 'pending', nom: 'B' });
    const events = [];
    win.addEventListener('dp:clubChanged', (e) => events.push(e.detail));

    const CLUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    assert.equal(await bindLocalDataToClub(win.offlineStore, CLUB), false);

    assert.equal(await win.offlineStore.get('divers', 'synced'), null);
    assert.ok(await win.offlineStore.get('divers', 'pending'));
    assert.equal(await win.offlineStore.get('dives', 'x'), null);
    assert.ok(await win.offlineStore.get('dives', 'y'));
    assert.equal(await win.offlineStore.get('meta', 'sync'), null, 'pull complet dans le club');
    assert.equal(await win.outbox.size(), 1, 'outbox conservée');
    assert.deepEqual(events, [], 'pas de « changement de club » annoncé');

    // Rattachement suivant au même club : plus rien n'est retiré.
    await win.offlineStore.put('divers', 'later', { id: 'later', nom: 'C' });
    await bindLocalDataToClub(win.offlineStore, CLUB);
    assert.ok(await win.offlineStore.get('divers', 'later'));
  });
});
