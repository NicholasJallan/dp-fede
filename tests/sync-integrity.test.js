// Tests — intégrité des données de plongée lors de la sync offline.
//
// Scénario de perte de données à prévenir : une plongée préparée en ligne,
// rouverte hors-ligne, ne doit jamais apparaître vide ni écraser le serveur.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline, loadOfflineApi } from './helpers/offline-harness.js';

let win;

function mockFetch(responses) {
  const calls = [];
  win.fetch = global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: (opts.method || 'GET').toUpperCase(), body: opts.body ? JSON.parse(opts.body) : null });
    const handler = responses.shift();
    if (!handler) throw new Error(`Aucune réponse mock pour ${url}`);
    const { status = 200, data = null, ok = true, error = null } = await handler({ url, opts });
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok, data, error }) };
  };
  return calls;
}

const UUID = '33333333-3333-4333-8333-333333333333';
const FULL = {
  client_uuid: UUID,
  server_id: 'srv-1',
  synced: true,
  answers: { site_nom: 'Lac' },
  palanquees: [{ id: 'p1', membres: [] }],
  render_state: { checked: { a: true } },
};

beforeEach(() => {
  win = bootOffline();
  win.netStatus = () => ({ online: true });
});

describe('pull incrémental des plongées', () => {
  test('une ligne résumée du serveur ne remplace pas le contenu local complet', async () => {
    await win.offlineStore.put('dives', UUID, FULL);
    mockFetch([
      async () => ({ data: { dives: { updated_at: '2026-10-20T10:00:00' }, divers: {}, sites: {} } }),
      async () => ({
        data: [
          { id: 'srv-1', client_uuid: UUID, status: 'prepared', site_nom: 'Lac', updated_at: '2026-10-20T10:00:00' },
        ],
      }),
    ]);
    await win.sync._pullIncremental();
    const local = await win.offlineStore.get('dives', UUID);
    assert.deepEqual(local.answers, FULL.answers);
    assert.deepEqual(local.palanquees, FULL.palanquees);
    assert.equal(local.status, 'prepared');
  });
});

describe("outbox — fusion des mises à jour d'une même entité", () => {
  test("coalesce fusionne les patchs dans l'item en attente", async () => {
    const merge = (cur, next) => ({ ...cur, patch: { ...cur.patch, ...next.patch } });
    const match = (it) => it.payload.client_uuid === UUID;
    await win.outbox.coalesce('dive.update', { client_uuid: UUID, patch: { a: 1 } }, match, merge);
    await win.outbox.coalesce('dive.update', { client_uuid: UUID, patch: { b: 2 } }, match, merge);
    const items = await win.outbox.pending();
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].payload.patch, { a: 1, b: 2 });
  });

  test('coalesce ne fusionne pas dans un item en vol', async () => {
    const merge = (cur, next) => ({ ...cur, patch: { ...cur.patch, ...next.patch } });
    const match = (it) => it.payload.client_uuid === UUID;
    const first = await win.outbox.coalesce('dive.update', { client_uuid: UUID, patch: { a: 1 } }, match, merge);
    await win.outbox.markInflight(first.id);
    await win.outbox.coalesce('dive.update', { client_uuid: UUID, patch: { b: 2 } }, match, merge);
    assert.equal((await win.outbox.pending()).length, 2);
  });

  test('coalesce réarme un item en revue', async () => {
    const merge = (cur, next) => ({ ...cur, patch: { ...cur.patch, ...next.patch } });
    const match = (it) => it.payload.client_uuid === UUID;
    const first = await win.outbox.coalesce('dive.update', { client_uuid: UUID, patch: { a: 1 } }, match, merge);
    await win.outbox.markReview(first.id, new Error('422'));
    await win.outbox.coalesce('dive.update', { client_uuid: UUID, patch: { b: 2 } }, match, merge);
    const [item] = await win.outbox.pending();
    assert.equal(item.status, 'pending');
    assert.ok(item.nextRetryAt <= Date.now());
  });
});

describe('drain — ordre et erreurs', () => {
  test('un échec bloque les items suivants de la même entité', async () => {
    await win.offlineStore.put('divers', 'd-1', { id: 'd-1' });
    await win.outbox.enqueue('diver.update', { id: 'd-1', nom: 'A' });
    await win.outbox.enqueue('diver.update', { id: 'd-1', nom: 'B' });
    await win.outbox.enqueue('diver.update', { id: 'd-2', nom: 'C' });
    const calls = mockFetch([
      async () => ({ status: 400, ok: false, error: 'bad' }),
      async () => ({ data: { id: 'd-2', nom: 'C' } }),
    ]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, '/api/divers/d-2');
  });

  test('422 → item en revue (pas de retry automatique)', async () => {
    await win.outbox.enqueue('diver.update', { id: 'd-1', nom: 'A' });
    mockFetch([async () => ({ status: 422, ok: false, error: 'invalide' })]);
    await win.sync._drainOutbox();
    const [item] = await win.outbox.pending();
    assert.equal(item.status, 'review');
    assert.equal((await win.outbox.ready()).length, 0);
  });

  test("5xx ou 429 → le drain s'arrête", async () => {
    await win.outbox.enqueue('diver.update', { id: 'd-1' });
    await win.outbox.enqueue('diver.update', { id: 'd-2' });
    const calls = mockFetch([async () => ({ status: 503, ok: false, error: 'down' })]);
    await win.sync._drainOutbox();
    assert.equal(calls.length, 1);
  });

  test('retryNow remet les délais à zéro', async () => {
    const it = await win.outbox.enqueue('diver.update', { id: 'd-1' });
    await win.outbox.markFailed(it.id, new Error('x'));
    assert.equal((await win.outbox.ready()).length, 0);
    await win.outbox.retryNow();
    assert.equal((await win.outbox.ready()).length, 1);
  });
});

describe("offline-api — lecture d'une plongée", () => {
  function bootWithApi(remote) {
    win.api = {
      divers: { list: async () => [] },
      sites: { list: async () => [] },
      dives: { list: async () => [], get: async () => remote },
    };
    loadOfflineApi(win);
  }

  test('dives.get en ligne persiste le contenu complet pour un usage hors-ligne', async () => {
    bootWithApi({
      id: 'srv-1',
      client_uuid: UUID,
      answers: { site_nom: 'Lac' },
      palanquees: [{ id: 'p1' }],
      render_state: {},
    });
    await win.api.dives.get(UUID);
    const local = await win.offlineStore.get('dives', UUID);
    assert.deepEqual(local.answers, { site_nom: 'Lac' });
    assert.equal(local.server_id, 'srv-1');
  });

  test("dives.update successifs ne créent qu'un item d'outbox", async () => {
    bootWithApi(null);
    await win.offlineStore.put('dives', UUID, FULL);
    await win.api.dives.update(UUID, { answers: { a: 1 } });
    await win.api.dives.update(UUID, { answers: { a: 2 } });
    const items = await win.outbox.pending();
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].payload.patch.answers, { a: 2 });
  });
});
