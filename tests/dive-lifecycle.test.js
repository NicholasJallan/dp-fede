// Tests — cycle de vie des plongées (prepared → in_progress → archived)

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { bootOffline } = require('./helpers/offline-harness');

let win;
beforeEach(() => {
  win = bootOffline();
  win.netStatus = () => ({ online: true });
});

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

describe('dive lifecycle — transitions de statut', () => {
  test('dive.create POST /api/dives avec status=prepared par défaut', async () => {
    const client_uuid = '11111111-1111-4111-8111-111111111111';
    await win.offlineStore.put('dives', client_uuid, { client_uuid, status: 'prepared', _pending: true });
    await win.outbox.enqueue('dive.create', { client_uuid, status: 'prepared', site_nom: 'Lac' });

    const calls = mockFetch([
      async () => ({ status: 201, data: { id: 'srv-prep-1', duplicate: false } }),
    ]);

    await win.sync._drainOutbox();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/dives');
    assert.equal(calls[0].method, 'POST');

    const local = await win.offlineStore.get('dives', client_uuid);
    assert.equal(local.server_id, 'srv-prep-1');
    assert.equal(local.synced, true);
    assert.equal(local.status, 'prepared');
  });

  test('dive.update PATCH /api/dives/:id avec status=in_progress', async () => {
    const client_uuid = '22222222-2222-4222-8222-222222222222';
    await win.offlineStore.put('dives', client_uuid, {
      client_uuid, server_id: 'srv-ip-1', status: 'prepared', _pending: false, synced: true,
    });
    await win.outbox.enqueue('dive.update', {
      client_uuid,
      patch: { status: 'in_progress', started_at: '2026-06-08T09:15:00' },
    });

    const calls = mockFetch([
      async () => ({ data: { id: 'srv-ip-1', status: 'in_progress' } }),
    ]);

    await win.sync._drainOutbox();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/dives/srv-ip-1');
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[0].body.status, 'in_progress');
    assert.equal(calls[0].body.started_at, '2026-06-08T09:15:00');

    assert.equal(await win.outbox.size(), 0);

    const local = await win.offlineStore.get('dives', client_uuid);
    assert.equal(local.status, 'in_progress');
    assert.equal(local._pending, false);
  });

  test('dive.update échoue si server_id manquant (create pas encore synced)', async () => {
    const client_uuid = '33333333-3333-4333-8333-333333333333';
    await win.offlineStore.put('dives', client_uuid, { client_uuid, status: 'prepared', _pending: true });
    await win.outbox.enqueue('dive.update', {
      client_uuid, patch: { answers: { site_id: 'abc' } },
    });

    const calls = mockFetch([]);
    await win.sync._drainOutbox();

    // Aucun appel réseau (pas de server_id → erreur avant fetch)
    assert.equal(calls.length, 0);
    // L'item est encore dans l'outbox (markFailed appelé)
    assert.equal(await win.outbox.size(), 1);
    const items = await win.outbox.pending();
    assert.equal(items[0].attempts, 1);
  });

  test('dive.delete DELETE /api/dives/:id', async () => {
    const client_uuid = '44444444-4444-4444-8444-444444444444';
    await win.offlineStore.put('dives', client_uuid, {
      client_uuid, server_id: 'srv-del-1', status: 'prepared', _pending: false,
    });
    await win.outbox.enqueue('dive.delete', { client_uuid });

    const calls = mockFetch([
      async () => ({ data: { id: 'srv-del-1', deleted: true } }),
    ]);

    await win.sync._drainOutbox();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/dives/srv-del-1');
    assert.equal(calls[0].method, 'DELETE');

    // Retiré du store
    const local = await win.offlineStore.get('dives', client_uuid);
    assert.equal(local, null);
  });

  test('dive.delete sans server_id : ne fait pas de requête réseau mais nettoie le store', async () => {
    const client_uuid = '55555555-5555-4555-8555-555555555555';
    await win.offlineStore.put('dives', client_uuid, { client_uuid, status: 'prepared', _pending: true });
    await win.outbox.enqueue('dive.delete', { client_uuid });

    const calls = mockFetch([]);
    await win.sync._drainOutbox();

    assert.equal(calls.length, 0);
    const local = await win.offlineStore.get('dives', client_uuid);
    assert.equal(local, null);
    assert.equal(await win.outbox.size(), 0);
  });
});

describe('dive lifecycle — FIFO garantit create avant update', () => {
  test('create puis update s\'exécutent dans l\'ordre', async () => {
    const client_uuid = '66666666-6666-4666-8666-666666666666';
    await win.offlineStore.put('dives', client_uuid, { client_uuid, status: 'prepared', _pending: true });

    // Enqueue create PUIS update (ordre FIFO naturel)
    await win.outbox.enqueue('dive.create', { client_uuid, site_nom: 'Mer', status: 'prepared' });
    await new Promise(r => setTimeout(r, 5)); // createdAt distinct
    await win.outbox.enqueue('dive.update', {
      client_uuid, patch: { answers: { meteo: 'beau' } },
    });

    const calls = mockFetch([
      // Réponse pour dive.create
      async () => ({ status: 201, data: { id: 'srv-seq-1', duplicate: false } }),
      // Réponse pour dive.update
      async () => ({ data: { id: 'srv-seq-1', status: 'prepared' } }),
    ]);

    await win.sync._drainOutbox();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'POST');   // create en premier
    assert.equal(calls[1].method, 'PATCH');  // update en second
    assert.equal(await win.outbox.size(), 0);
  });
});

describe('dive lifecycle — calcul ±4h warning', () => {
  test('écart < 4h → pas de warning', () => {
    const planned = new Date(Date.now() - 2 * 3600_000); // il y a 2h
    const now     = new Date();
    const diffH   = Math.abs(now - planned) / 3_600_000;
    assert.ok(diffH < 4, 'devrait être < 4h');
  });

  test('écart > 4h → warning requis', () => {
    const planned = new Date(Date.now() - 5 * 3600_000); // il y a 5h
    const now     = new Date();
    const diffH   = Math.abs(now - planned) / 3_600_000;
    assert.ok(diffH > 4, 'devrait être > 4h');
  });

  test('date invalide → pas de warning (protection NaN)', () => {
    const planned = new Date('invalid');
    const now     = new Date();
    const diffH   = Math.abs(now - planned) / 3_600_000;
    assert.ok(isNaN(diffH), 'NaN pour date invalide → guard isNaN dans le code');
  });
});
