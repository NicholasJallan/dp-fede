// Tests — conflits 409 et club quitté côté synchronisation hors-ligne.
//
// Un 409 n'est un succès (idempotence) que si le serveur le dit
// explicitement : `duplicate: true` ou code d'idempotence dédié. Tout autre
// conflit part en revue avec le message du serveur. 403 CLUB_NOT_MEMBER :
// revue + événement dp:clubNotMember (resynchronisation du club courant).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline, HARNESS_CLUB } from './helpers/offline-harness.js';
import { isIdempotentConflict } from '../src/offline/sync.js';

const CLUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CU = '44444444-4444-4444-8444-444444444444';

let win;

// fetch simulé : réponses { status, body } dans l'ordre ; en-têtes enregistrés.
function mockFetch(responses) {
  const calls = [];
  win.fetch = globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: (opts.method || 'GET').toUpperCase(), headers: opts.headers || {} });
    const next = responses.shift();
    if (!next) throw new Error(`Aucune réponse simulée pour ${url}`);
    const { status = 200, body } = next;
    const ok = status >= 200 && status < 300;
    return { ok, status, json: async () => body ?? { ok, data: null } };
  };
  return calls;
}

beforeEach(() => {
  win = bootOffline();
  win.netStatus = () => ({ online: true });
});

describe('isIdempotentConflict', () => {
  test("seuls duplicate:true ou un code d'idempotence dédié valent succès", () => {
    assert.equal(isIdempotentConflict({ status: 409, responseBody: { ok: false, duplicate: true } }), true);
    assert.equal(isIdempotentConflict({ status: 409, responseBody: { ok: false, data: { duplicate: true } } }), true);
    assert.equal(isIdempotentConflict({ status: 409, responseBody: { ok: false, code: 'ALREADY_APPLIED' } }), true);
    assert.equal(
      isIdempotentConflict({ status: 409, responseBody: { ok: false, code: 'CLIENT_UUID_CONFLICT' } }),
      false,
    );
    assert.equal(
      isIdempotentConflict({ status: 409, responseBody: { ok: false, error: 'Identifiant déjà utilisé' } }),
      false,
    );
    assert.equal(isIdempotentConflict({ status: 409 }), false);
    assert.equal(isIdempotentConflict({ status: 422, responseBody: { duplicate: true } }), false);
  });
});

describe('sync — 409', () => {
  test('409 duplicate:true → succès (rejeu idempotent)', async () => {
    await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe' });
    mockFetch([{ status: 409, body: { ok: false, error: 'déjà créé', duplicate: true } }]);
    await win.sync._drainOutbox();
    assert.equal(await win.outbox.size(), 0);
  });

  test('409 CLIENT_UUID_CONFLICT → revue avec le message du serveur', async () => {
    await win.offlineStore.put('dives', CU, { client_uuid: CU, _pending: true });
    await win.outbox.enqueue('dive.create', { client_uuid: CU, answers: {}, palanquees: [] });
    await win.outbox.enqueue('site.create', { id: 's-1', nom: 'Lac' });
    const calls = mockFetch([
      {
        status: 409,
        body: { ok: false, error: 'Identifiant client de plongée déjà utilisé', code: 'CLIENT_UUID_CONFLICT' },
      },
      { status: 201, body: { ok: true, data: { id: 's-1' } } },
    ]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 2, 'le drain continue sur les autres entités');
    const left = await win.outbox.pending();
    assert.equal(left.length, 1);
    assert.equal(left[0].kind, 'dive.create');
    assert.equal(left[0].status, 'review');
    assert.equal(left[0].lastError, 'Identifiant client de plongée déjà utilisé');
  });

  test('409 EMPTY_OVERWRITE_REFUSED sur dive.update → revue, version serveur re-tirée', async () => {
    await win.offlineStore.put('dives', CU, { client_uuid: CU, server_id: 'srv-1', _pending: true });
    await win.offlineStore.put('meta', 'sync', { dives: '2026-10-01T00:00:00' });
    await win.outbox.enqueue('dive.update', { client_uuid: CU, patch: { answers: {}, palanquees: [] } });
    mockFetch([{ status: 409, body: { ok: false, error: 'Mise à jour refusée', code: 'EMPTY_OVERWRITE_REFUSED' } }]);
    await win.sync._drainOutbox();
    const [item] = await win.outbox.pending();
    assert.equal(item.status, 'review');
    assert.equal((await win.offlineStore.get('dives', CU))._pending, false);
    assert.equal((await win.offlineStore.get('meta', 'sync')).dives, null);
  });
});

describe('sync — club quitté (403 CLUB_NOT_MEMBER)', () => {
  test("l'item part en revue et dp:clubNotMember signale le club refusé", async () => {
    win.clubId = CLUB_B;
    await win.outbox.enqueue('diver.update', { id: 'd-1', nom: 'X' });
    const events = [];
    win.addEventListener('dp:clubNotMember', (e) => events.push(e.detail));
    mockFetch([
      { status: 403, body: { ok: false, error: "Vous n'êtes pas membre de ce club", code: 'CLUB_NOT_MEMBER' } },
    ]);
    await win.sync._drainOutbox();
    const [item] = await win.outbox.pending();
    assert.equal(item.status, 'review');
    assert.deepEqual(events, [{ clubId: CLUB_B }]);
  });
});

describe('sync — pull incrémental et club', () => {
  test("/api/sync/state sans en-tête (découverte du club), listes ?since avec l'en-tête du club lié", async () => {
    const calls = mockFetch([
      {
        body: {
          ok: true,
          data: { club_id: HARNESS_CLUB, divers: { updated_at: '2026-10-01T00:00:00' }, sites: {}, dives: {} },
        },
      },
      { body: { ok: true, data: [] } },
    ]);
    await win.sync._pullIncremental();
    assert.equal(calls[0].url, '/api/sync/state');
    assert.equal('X-DP-Club' in calls[0].headers, false);
    assert.match(calls[1].url, /^\/api\/divers\?since=/);
    assert.equal(calls[1].headers['X-DP-Club'], HARNESS_CLUB);
  });
});
