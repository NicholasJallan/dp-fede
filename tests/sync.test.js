// Tests métier — sync (drain outbox + idempotence + dispatch handlers).

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { bootOffline } = require('./helpers/offline-harness');

let win;

// Helper : remplace fetch par un mock qui répond { ok, data } JSON.
function mockFetch(responses) {
  const calls = [];
  win.fetch = global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: (opts.method || 'GET').toUpperCase(), body: opts.body ? JSON.parse(opts.body) : null });
    const handler = responses.shift();
    if (!handler) throw new Error(`Aucune réponse mock pour ${url}`);
    const { status = 200, data = null, ok = true, error = null } = await handler({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ ok: ok, data, error }),
    };
  };
  return calls;
}

// netStatus stub : par défaut "online" pour exécuter le drain.
beforeEach(() => {
  win = bootOffline();
  win.netStatus = () => ({ online: true });
});

describe('sync — drainOutbox avec handlers par défaut', () => {
  test('diver.create POST /api/divers et stocke la réponse serveur', async () => {
    await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe', prenom: 'John' });

    const calls = mockFetch([
      async () => ({ data: { id: 'd-1', nom: 'Doe', prenom: 'John', server_returned: true } }),
    ]);

    await win.sync._drainOutbox();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/divers');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body.nom, 'Doe');

    // L'item est retiré de l'outbox
    assert.equal(await win.outbox.size(), 0);
    // Le store local est rafraîchi avec la réponse serveur (et _pending=false)
    const stored = await win.offlineStore.get('divers', 'd-1');
    assert.equal(stored.server_returned, true);
    assert.equal(stored._pending, false);
  });

  test('dive.create persiste server_id dans offlineStore.dives', async () => {
    const client_uuid = '11111111-1111-4111-8111-111111111111';
    // Préparer l'entrée locale (simulate offline-api.create)
    await win.offlineStore.put('dives', client_uuid, { client_uuid, site_nom: 'Lac', _pending: true, synced: false });
    await win.outbox.enqueue('dive.create', {
      client_uuid, site_nom: 'Lac', answers: {}, palanquees: [],
    });

    mockFetch([
      async () => ({ status: 201, data: { id: 'srv-42', duplicate: false } }),
    ]);

    await win.sync._drainOutbox();

    const local = await win.offlineStore.get('dives', client_uuid);
    assert.equal(local.server_id, 'srv-42');
    assert.equal(local.synced, true);
  });
});

describe('sync — gestion erreurs et idempotence', () => {
  test('erreur réseau (pas de status) → markFailed et le drain stoppe', async () => {
    await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'A' });
    await win.outbox.enqueue('diver.create', { id: 'd-2', nom: 'B' });

    const calls = mockFetch([
      async () => { throw new Error('network down'); },
    ]);

    await win.sync._drainOutbox();

    // Un seul appel tenté (le drain s'arrête à l'erreur réseau)
    assert.equal(calls.length, 1);
    // Les deux items sont toujours en outbox
    assert.equal(await win.outbox.size(), 2);
    const items = await win.outbox.pending();
    const failed = items.find(it => it.payload.id === 'd-1');
    assert.equal(failed.attempts, 1);
    assert.match(failed.lastError, /network/);
  });

  test('HTTP 409 (déjà existant) est traité comme un succès (idempotence)', async () => {
    const client_uuid = '22222222-2222-4222-8222-222222222222';
    await win.offlineStore.put('dives', client_uuid, { client_uuid, _pending: true });
    await win.outbox.enqueue('dive.create', {
      client_uuid,
      site_nom: 'X', answers: {}, palanquees: [],
    });

    mockFetch([
      async () => ({ status: 409, ok: false, error: 'duplicate' }),
    ]);

    await win.sync._drainOutbox();

    assert.equal(await win.outbox.size(), 0, 'item retiré comme s\'il avait réussi');
  });

  test('handler manquant : l\'item reste en attente sans erreur', async () => {
    await win.outbox.enqueue('dive.drive', { client_uuid: 'x' });
    mockFetch([]);
    await win.sync._drainOutbox();
    assert.equal(await win.outbox.size(), 1, 'item conservé pour traitement ultérieur');
  });

  test('registerHandler override le handler par défaut', async () => {
    let called = false;
    win.sync.registerHandler('diver.create', async () => { called = true; });
    await win.outbox.enqueue('diver.create', { id: 'd-1' });
    mockFetch([]);
    await win.sync._drainOutbox();
    assert.equal(called, true);
    assert.equal(await win.outbox.size(), 0);
  });
});

describe('sync — offline guard', () => {
  test('si netStatus().online=false, drainOutbox ne tente aucun fetch', async () => {
    win.netStatus = () => ({ online: false });
    await win.outbox.enqueue('diver.create', { id: 'd-1' });
    const calls = mockFetch([]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 0);
    assert.equal(await win.outbox.size(), 1);
  });
});

describe('sync — pull incrémental des fiches de sécurité', () => {
  // GET /api/dives?since= ne renvoie que le résumé de la fiche (pas answers /
  // palanquees / render_state). Le pull doit donc fusionner, pas remplacer.
  const state = { divers: {}, sites: {}, dives: { updated_at: '2026-09-04T19:00:00' } };

  test('le pull d\'une fiche modifiée ailleurs préserve son contenu local', async () => {
    const u = 'uuid-1';
    await win.offlineStore.put('dives', u, {
      client_uuid: u, server_id: 42, site_nom: 'Hendaye',
      answers: { dp_nom: 'Jallan' }, palanquees: [{ membres: [] }], synced: true,
    });

    mockFetch([
      async () => ({ data: state }),
      async () => ({ data: [{ id: 42, client_uuid: u, site_nom: 'Hendaye — bouée 3', status: 'in_progress' }] }),
    ]);
    await win.sync._pullIncremental();

    const got = await win.offlineStore.get('dives', u);
    assert.equal(got.site_nom, 'Hendaye — bouée 3', 'le résumé serveur est appliqué');
    assert.equal(got.status, 'in_progress');
    assert.deepEqual(got.answers, { dp_nom: 'Jallan' }, 'la fiche n\'est pas vidée');
    assert.equal(got.palanquees.length, 1);
  });

  test('une fiche en cours de saisie (_pending) n\'est pas écrasée par le pull', async () => {
    const u = 'uuid-1';
    await win.offlineStore.put('dives', u, {
      client_uuid: u, server_id: 42, site_nom: 'Local', _pending: true,
    });
    mockFetch([
      async () => ({ data: state }),
      async () => ({ data: [{ id: 42, client_uuid: u, site_nom: 'Serveur' }] }),
    ]);
    await win.sync._pullIncremental();
    assert.equal((await win.offlineStore.get('dives', u)).site_nom, 'Local');
  });
});

describe('sync — dive.update et saisie concurrente', () => {
  test('la fiche reste _pending si une écriture attend encore', async () => {
    const u = 'uuid-1';
    await win.offlineStore.put('dives', u, { client_uuid: u, server_id: 42, _pending: true });
    const first = await win.outbox.enqueue('dive.update', { client_uuid: u, patch: { answers: { a: 1 } } });
    // L'utilisateur continue de saisir pendant l'envoi du premier patch.
    await win.outbox.markInflight(first.id);
    await win.outbox.enqueue('dive.update', { client_uuid: u, patch: { answers: { a: 2 } } });

    mockFetch([async () => ({ data: { id: 42 } })]);
    await win.sync._defaultHandlers['dive.update'](first);

    assert.equal((await win.offlineStore.get('dives', u))._pending, true,
      'sinon le pull écraserait la saisie pas encore poussée');
  });

  test('la fiche repasse à _pending=false quand la file est vide', async () => {
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
    const calls = mockFetch([
      async () => ({ data: { divers: {}, sites: {}, dives: {} } }),
    ]);
    await win.sync._pullIncremental();
    assert.equal(calls.length, 1, 'seul /api/sync/state est appelé');
  });

  test('rien de neuf depuis le dernier passage → aucun pull', async () => {
    await win.offlineStore.put('meta', 'sync', { divers: '2026-09-04T19:00:00' });
    const calls = mockFetch([
      async () => ({ data: { divers: { updated_at: '2026-09-04T19:00:00' }, sites: {}, dives: {} } }),
    ]);
    await win.sync._pullIncremental();
    assert.equal(calls.length, 1);
  });

  test('une création côté serveur est tirée et fait avancer le curseur', async () => {
    await win.offlineStore.put('meta', 'sync', { divers: '2026-09-04T19:00:00' });
    const calls = mockFetch([
      async () => ({ data: { divers: { updated_at: '2026-09-04T19:11:22' }, sites: {}, dives: {} } }),
      async () => ({ data: [{ id: 'd-9', nom: 'Valbuena', prenom: 'Alain' }] }),
    ]);
    await win.sync._pullIncremental();

    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /^\/api\/divers\?since=/);
    assert.equal((await win.offlineStore.get('divers', 'd-9')).nom, 'Valbuena');
    assert.equal((await win.offlineStore.get('meta', 'sync')).divers, '2026-09-04T19:11:22');
  });
});
