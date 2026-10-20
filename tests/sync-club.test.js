// Tests — socle club côté hors-ligne : club capturé dans l'outbox, en-tête
// X-DP-Club rejoué par la sync, périmètre club du store local.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline } from './helpers/offline-harness.js';
import { bindLocalDataToClub, purgeClubData, isInLocalScope } from '../src/offline/club-scope.js';
import { isPermanentRefusal } from '../src/offline/sync.js';
import { getCurrentClubId, setCurrentClubId, clubHeaders, isClubId } from '../src/api/club-header.js';

const CLUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let win;

// fetch simulé : enregistre méthode, URL, en-têtes et corps ; répond dans l'ordre.
function mockFetch(responses) {
  const calls = [];
  win.fetch = globalThis.fetch = async (url, opts = {}) => {
    calls.push({
      url,
      method: (opts.method || 'GET').toUpperCase(),
      headers: opts.headers || {},
      body: opts.body ? JSON.parse(opts.body) : null,
    });
    const next = responses.shift();
    if (!next) throw new Error(`Aucune réponse simulée pour ${url}`);
    const { status = 200, data = null, error = null } = typeof next === 'function' ? await next(url) : next;
    const ok = status >= 200 && status < 300;
    return { ok, status, json: async () => ({ ok, data, error }) };
  };
  return calls;
}

beforeEach(() => {
  win = bootOffline();
  win.netStatus = () => ({ online: true });
});

describe('outbox — club de la mise en file', () => {
  test('enqueue capture le club courant, figé même si le club change ensuite', async () => {
    win.clubId = CLUB_A;
    const item = await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe' });
    win.clubId = CLUB_B;
    assert.equal(item.club_id, CLUB_A);
    assert.equal((await win.outbox.get(item.id)).club_id, CLUB_A);
  });

  test('sans club connu : club_id null et item mis en revue (jamais envoyé au club courant du serveur)', async () => {
    win.clubId = null;
    const item = await win.outbox.enqueue('diver.create', { id: 'd-1' });
    assert.equal(item.club_id, null);
    assert.equal(item.status, 'review');
    assert.match(item.lastError, /club/i);
    assert.deepEqual(await win.outbox.ready(), []);
  });

  test('coalesce ne fusionne jamais deux clubs', async () => {
    win.clubId = CLUB_A;
    await win.outbox.coalesce('diver.update', { id: 'd-1', nom: 'A' }, (it) => it.payload.id === 'd-1', (a, b) => ({ ...a, ...b }));
    win.clubId = CLUB_B;
    await win.outbox.coalesce('diver.update', { id: 'd-1', nom: 'B' }, (it) => it.payload.id === 'd-1', (a, b) => ({ ...a, ...b }));
    const items = await win.outbox.pending();
    assert.equal(items.length, 2);
    assert.deepEqual(items.map(i => i.club_id).sort(), [CLUB_A, CLUB_B]);
  });

  test('coalesce fusionne dans un item du même club', async () => {
    win.clubId = CLUB_A;
    const match = (it) => it.payload.id === 'd-1';
    const merge = (a, b) => ({ ...a, ...b });
    await win.outbox.coalesce('diver.update', { id: 'd-1', nom: 'A' }, match, merge);
    await win.outbox.coalesce('diver.update', { id: 'd-1', prenom: 'Jean' }, match, merge);
    const items = await win.outbox.pending();
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].payload, { id: 'd-1', nom: 'A', prenom: 'Jean' });
  });
});

describe('sync — en-tête X-DP-Club', () => {
  test("rejoue l'écriture dans le club de sa mise en file, après un changement de club", async () => {
    win.clubId = CLUB_A;
    await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe' });
    win.clubId = CLUB_B;
    const calls = mockFetch([{ data: { id: 'd-1', nom: 'Doe' } }]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['X-DP-Club'], CLUB_A);
    assert.ok(calls[0].headers['X-CSRF-Token'] !== undefined);
    assert.equal(await win.outbox.size(), 0);
  });

  test("item sans club (ancien format) : jamais envoyé sans en-tête, mis en revue", async () => {
    win.clubId = null;
    const item = await win.outbox.enqueue('site.create', { id: 's-1', nom: 'Lac' });
    // Ancien item resté « pending » sans club (antérieur au socle club).
    await win.outbox.update(item.id, { status: 'pending', nextRetryAt: 0 });
    const calls = mockFetch([]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 0);
    assert.equal((await win.outbox.get(item.id)).status, 'review');
  });

  test('plongée : POST puis PATCH partent tous deux vers le club A', async () => {
    const cu = '11111111-1111-4111-8111-111111111111';
    win.clubId = CLUB_A;
    await bindLocalDataToClub(win.offlineStore, CLUB_A);
    await win.offlineStore.put('dives', cu, { client_uuid: cu, _pending: true });
    await win.outbox.enqueue('dive.create', { client_uuid: cu, answers: {}, palanquees: [] });
    await win.outbox.enqueue('dive.update', { client_uuid: cu, patch: { status: 'in_progress' } });
    const calls = mockFetch([{ status: 201, data: { id: 'srv-1' } }, { data: { id: 'srv-1' } }]);
    await win.sync._drainOutbox();
    assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), ['POST /api/dives', 'PATCH /api/dives/srv-1']);
    assert.ok(calls.every(c => c.headers['X-DP-Club'] === CLUB_A));
  });
});

describe('sync — périmètre club du store local', () => {
  test("la réponse d'un item d'un autre club n'entre pas dans le store local", async () => {
    win.clubId = CLUB_A;
    await bindLocalDataToClub(win.offlineStore, CLUB_A);
    await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe' });
    // L'utilisateur bascule sur le club B avant le retour du réseau.
    await bindLocalDataToClub(win.offlineStore, CLUB_B);
    mockFetch([{ data: { id: 'd-1', nom: 'Doe' } }]);
    await win.sync._drainOutbox();
    assert.equal(await win.offlineStore.get('divers', 'd-1'), null);
    assert.equal(await win.outbox.size(), 0);
  });

  test("dive.create d'un autre club : envoyée, mais pas réinjectée localement", async () => {
    const cu = '22222222-2222-4222-8222-222222222222';
    win.clubId = CLUB_A;
    await bindLocalDataToClub(win.offlineStore, CLUB_A);
    await win.outbox.enqueue('dive.create', { client_uuid: cu, answers: {}, palanquees: [] });
    await bindLocalDataToClub(win.offlineStore, CLUB_B);
    const calls = mockFetch([{ status: 201, data: { id: 'srv-9' } }]);
    await win.sync._drainOutbox();
    assert.equal(calls[0].headers['X-DP-Club'], CLUB_A);
    assert.equal(await win.offlineStore.get('dives', cu), null);
  });

  test('dive.update dont la plongée a été purgée : PATCH par client_uuid', async () => {
    const cu = '33333333-3333-4333-8333-333333333333';
    win.clubId = CLUB_A;
    await win.outbox.enqueue('dive.update', { client_uuid: cu, patch: { status: 'archived' } });
    const calls = mockFetch([{ data: { id: 'srv-3' } }]);
    await win.sync._drainOutbox();
    assert.equal(calls[0].url, `/api/dives/${cu}`);
    assert.equal(calls[0].headers['X-DP-Club'], CLUB_A);
    assert.equal(await win.outbox.size(), 0);
  });

  test('isInLocalScope : item sans club ou du club local → oui ; autre club → non', async () => {
    await bindLocalDataToClub(win.offlineStore, CLUB_A);
    assert.equal(await isInLocalScope(win.offlineStore, null), true);
    assert.equal(await isInLocalScope(win.offlineStore, CLUB_A), true);
    assert.equal(await isInLocalScope(win.offlineStore, CLUB_B), false);
  });
});

describe('club-scope — changement de club', () => {
  test('premier rattachement : aucune purge (données antérieures au socle club)', async () => {
    await win.offlineStore.put('divers', 'd-1', { id: 'd-1' });
    const changed = await bindLocalDataToClub(win.offlineStore, CLUB_A);
    assert.equal(changed, false);
    assert.ok(await win.offlineStore.get('divers', 'd-1'));
    assert.equal(await win.offlineStore.get('meta', 'club'), CLUB_A);
  });

  test('changement : purge annuaire, sites, plongées et curseurs ; outbox conservée', async () => {
    await bindLocalDataToClub(win.offlineStore, CLUB_A);
    win.clubId = CLUB_A;
    await win.offlineStore.put('divers', 'd-1', { id: 'd-1' });
    await win.offlineStore.put('sites', 's-1', { id: 's-1' });
    await win.offlineStore.put('dives', 'x', { client_uuid: 'x' });
    await win.offlineStore.put('meta', 'sync', { divers: '2026-10-01T00:00:00' });
    await win.offlineStore.put('meta', 'owner', 'u-1');
    await win.outbox.enqueue('diver.update', { id: 'd-1', nom: 'X' });
    const events = [];
    win.addEventListener('dp:clubChanged', (e) => events.push(e.detail));

    const changed = await bindLocalDataToClub(win.offlineStore, CLUB_B);

    assert.equal(changed, true);
    assert.deepEqual(await win.offlineStore.all('divers'), []);
    assert.deepEqual(await win.offlineStore.all('sites'), []);
    assert.deepEqual(await win.offlineStore.all('dives'), []);
    assert.equal(await win.offlineStore.get('meta', 'sync'), null);
    assert.equal(await win.offlineStore.get('meta', 'owner'), 'u-1');
    assert.equal(await win.offlineStore.get('meta', 'club'), CLUB_B);
    assert.equal(await win.outbox.size(), 1);
    assert.deepEqual(events, [{ from: CLUB_A, to: CLUB_B }]);
    assert.equal(getCurrentClubId(), CLUB_B);
  });

  test('purgeClubData vide aussi le pré-cache localStorage', async () => {
    localStorage.setItem('dp-cache-divers', '{"list":[]}');
    await purgeClubData(win.offlineStore);
    assert.equal(localStorage.getItem('dp-cache-divers'), null);
  });

  test('pull : un club_id différent dans /api/sync/state purge et repart de zéro', async () => {
    await bindLocalDataToClub(win.offlineStore, CLUB_A);
    await win.offlineStore.put('divers', 'old', { id: 'old', nom: 'Club A' });
    await win.offlineStore.put('meta', 'sync', { divers: '2026-10-19T00:00:00' });
    const calls = mockFetch([
      { data: { club_id: CLUB_B, divers: { updated_at: '2026-10-01T00:00:00' }, sites: {}, dives: {} } },
      { data: [{ id: 'new', nom: 'Club B' }] },
    ]);
    await win.sync._pullIncremental();
    assert.equal(calls[1].url, '/api/divers?since=1970-01-01T00%3A00%3A00');
    assert.equal(await win.offlineStore.get('divers', 'old'), null);
    assert.equal((await win.offlineStore.get('divers', 'new')).nom, 'Club B');
    assert.equal(await win.offlineStore.get('meta', 'club'), CLUB_B);
  });
});

describe('sync — refus définitifs (revue) ou transitoires', () => {
  test('403 rôle insuffisant → revue, le drain continue', async () => {
    await win.outbox.enqueue('diver.create', { id: 'd-1' });
    await win.outbox.enqueue('site.create', { id: 's-1' });
    const calls = mockFetch([
      { status: 403, error: 'Action non autorisée pour votre rôle dans le club' },
      { data: { id: 's-1' } },
    ]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 2);
    const left = await win.outbox.pending();
    assert.equal(left.length, 1);
    assert.equal(left[0].status, 'review');
  });

  test('403 CSRF → nouvel essai plus tard, le drain s\'arrête', async () => {
    await win.outbox.enqueue('diver.create', { id: 'd-1' });
    await win.outbox.enqueue('site.create', { id: 's-1' });
    const calls = mockFetch([{ status: 403, error: 'Jeton CSRF invalide' }]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 1);
    const left = await win.outbox.pending();
    assert.equal(left.find(i => i.payload.id === 'd-1').status, 'pending');
  });

  test('isPermanentRefusal', () => {
    assert.equal(isPermanentRefusal({ status: 422, message: 'x' }), true);
    assert.equal(isPermanentRefusal({ status: 404, message: 'x' }), true);
    assert.equal(isPermanentRefusal({ status: 403, message: "Vous n'êtes pas membre de ce club" }), true);
    assert.equal(isPermanentRefusal({ status: 403, message: 'Origine de la requête non autorisée' }), false);
    assert.equal(isPermanentRefusal({ status: 500, message: 'x' }), false);
    assert.equal(isPermanentRefusal(new Error('réseau')), false);
  });

  test('isPermanentRefusal privilégie le code stable du serveur', () => {
    assert.equal(isPermanentRefusal({ status: 403, message: 'x', responseBody: { code: 'CLUB_ROLE_FORBIDDEN' } }), true);
    assert.equal(isPermanentRefusal({ status: 403, message: 'x', responseBody: { code: 'CSRF_INVALID' } }), false);
  });
});

describe('club-header', () => {
  test('identifiant valide normalisé en minuscules, invalide ignoré', () => {
    assert.equal(isClubId(CLUB_A.toUpperCase()), true);
    assert.equal(isClubId('club-a'), false);
    assert.deepEqual(clubHeaders(CLUB_A.toUpperCase()), { 'X-DP-Club': CLUB_A });
    assert.deepEqual(clubHeaders('pas-un-uuid'), {});
    assert.deepEqual(clubHeaders(null), {});
  });

  test('setCurrentClubId persiste et null oublie', () => {
    setCurrentClubId(CLUB_A);
    assert.equal(getCurrentClubId(), CLUB_A);
    assert.equal(localStorage.getItem('dp-club-id'), CLUB_A);
    setCurrentClubId(null);
    assert.equal(getCurrentClubId(), null);
    assert.equal(localStorage.getItem('dp-club-id'), null);
  });
});
