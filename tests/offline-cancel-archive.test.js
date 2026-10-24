// Tests offline-api — annulation d'un archivage bloqué / refusé (cancelArchive)

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline, loadOfflineApi } from './helpers/offline-harness.js';

let win;

beforeEach(() => {
  win = bootOffline();
  win.api = {
    divers: { list: async () => [] },
    sites: { list: async () => [] },
    dives: { list: async () => [], get: async () => null },
  };
  loadOfflineApi(win);
});

describe('offline-api — dives.cancelArchive', () => {
  const UUID = '11111111-2222-3333-4444-555555555555';

  test('aucun item archivage en outbox : renvoie false et ne modifie rien', async () => {
    await win.offlineStore.put('dives', UUID, { client_uuid: UUID, status: 'in_progress' });
    const res = await win.api.dives.cancelArchive(UUID);

    assert.equal(res, false);
    const stored = await win.offlineStore.get('dives', UUID);
    assert.equal(stored.status, 'in_progress');
  });

  test("un item d'archivage est en cours d'envoi (inflight) : renvoie false et ne touche à rien", async () => {
    await win.offlineStore.put('dives', UUID, {
      client_uuid: UUID,
      status: 'archived',
      closed_at: '2026-10-25T10:00:00Z',
    });
    const item = await win.outbox.enqueue('dive.update', {
      client_uuid: UUID,
      patch: { status: 'archived', closed_at: '2026-10-25T10:00:00Z' },
    });
    await win.outbox.markInflight(item.id);

    const res = await win.api.dives.cancelArchive(UUID);
    assert.equal(res, false);

    const outboxItem = await win.outbox.get(item.id);
    assert.equal(outboxItem.status, 'inflight');
    assert.equal(outboxItem.payload.patch.status, 'archived');

    const stored = await win.offlineStore.get('dives', UUID);
    assert.equal(stored.status, 'archived');
  });

  test('dive.update en revue avec patch mixte : retire status et closed_at, repasse en pending, store en in_progress', async () => {
    await win.offlineStore.put('dives', UUID, {
      client_uuid: UUID,
      status: 'archived',
      closed_at: '2026-10-25T10:00:00Z',
      answers: { site_nom: 'Marseille' },
    });
    const item = await win.outbox.enqueue('dive.update', {
      client_uuid: UUID,
      patch: { status: 'archived', closed_at: '2026-10-25T10:00:00Z', meteo: 'calme' },
    });
    await win.outbox.markReview(item.id, new Error('Validation refusée'));

    const res = await win.api.dives.cancelArchive(UUID);
    assert.equal(res, true);

    const outboxItem = await win.outbox.get(item.id);
    assert.ok(outboxItem, "L'item d'outbox doit subsister car il reste meteo: calme");
    assert.equal(outboxItem.status, 'pending');
    assert.equal(outboxItem.payload.patch.status, undefined);
    assert.equal(outboxItem.payload.patch.closed_at, undefined);
    assert.equal(outboxItem.payload.patch.meteo, 'calme');

    const stored = await win.offlineStore.get('dives', UUID);
    assert.equal(stored.status, 'in_progress');
    assert.equal(stored.closed_at, undefined);
  });

  test("dive.update dont le patch ne contenait que l'archivage : supprime l'item d'outbox, store en in_progress", async () => {
    await win.offlineStore.put('dives', UUID, {
      client_uuid: UUID,
      status: 'archived',
      closed_at: '2026-10-25T10:00:00Z',
    });
    const item = await win.outbox.enqueue('dive.update', {
      client_uuid: UUID,
      patch: { status: 'archived', closed_at: '2026-10-25T10:00:00Z' },
    });
    await win.outbox.markReview(item.id, new Error('Refus serveur'));

    const res = await win.api.dives.cancelArchive(UUID);
    assert.equal(res, true);

    const outboxItem = await win.outbox.get(item.id);
    assert.ok(outboxItem == null, "L'item d'outbox doit avoir été supprimé car le patch est vide");

    const stored = await win.offlineStore.get('dives', UUID);
    assert.equal(stored.status, 'in_progress');
    assert.equal(stored.closed_at, undefined);
  });

  test('dive.create avec status archived : passe le payload en in_progress, sans closed_at, repasse en pending', async () => {
    await win.offlineStore.put('dives', UUID, {
      client_uuid: UUID,
      status: 'archived',
      closed_at: '2026-10-25T10:00:00Z',
    });
    const item = await win.outbox.enqueue('dive.create', {
      client_uuid: UUID,
      status: 'archived',
      closed_at: '2026-10-25T10:00:00Z',
      answers: { dp_nom: 'Alice' },
    });
    await win.outbox.markReview(item.id, new Error('Refus'));

    const res = await win.api.dives.cancelArchive(UUID);
    assert.equal(res, true);

    const outboxItem = await win.outbox.get(item.id);
    assert.ok(outboxItem);
    assert.equal(outboxItem.status, 'pending');
    assert.equal(outboxItem.payload.status, 'in_progress');
    assert.equal(outboxItem.payload.closed_at, undefined);

    const stored = await win.offlineStore.get('dives', UUID);
    assert.equal(stored.status, 'in_progress');
    assert.equal(stored.closed_at, undefined);
  });
});
