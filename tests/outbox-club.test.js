// Tests — outbox et club : pas d'écriture sans club connu, rattachement des
// items orphelins au club confirmé par le serveur, purge d'un club quitté.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline } from './helpers/offline-harness.js';

const CLUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let win;

beforeEach(() => {
  win = bootOffline();
});

describe('outbox — club inconnu', () => {
  test('coalesce sans club : nouvel item en revue (aucune fusion, aucun envoi)', async () => {
    win.clubId = null;
    const match = (it) => it.payload.id === 'd-1';
    const merge = (a, b) => ({ ...a, ...b });
    const item = await win.outbox.coalesce('diver.update', { id: 'd-1', nom: 'A' }, match, merge);
    assert.equal(item.status, 'review');
    assert.equal(item.club_id, null);
    assert.deepEqual(await win.outbox.ready(), []);
  });

  test('retryNow rattache les items sans club au club courant confirmé', async () => {
    win.clubId = null;
    const orphan = await win.outbox.enqueue('diver.create', { id: 'd-1' });
    win.clubId = CLUB_A;
    await win.outbox.retryNow();
    const after = await win.outbox.get(orphan.id);
    assert.equal(after.club_id, CLUB_A);
    assert.equal(after.status, 'pending');
  });

  test('retryNow sans club connu : les orphelins restent en revue', async () => {
    win.clubId = null;
    const orphan = await win.outbox.enqueue('diver.create', { id: 'd-1' });
    await win.outbox.retryNow();
    assert.equal((await win.outbox.get(orphan.id)).status, 'review');
  });
});

describe('outbox — club quitté', () => {
  test('purgeClub retire les items en revue de ce club seulement', async () => {
    win.clubId = CLUB_A;
    const a1 = await win.outbox.enqueue('diver.update', { id: 'd-1' });
    const a2 = await win.outbox.enqueue('site.update', { id: 's-1' });
    win.clubId = CLUB_B;
    const b1 = await win.outbox.enqueue('diver.update', { id: 'd-2' });
    await win.outbox.markReview(a1.id, new Error('403'));
    await win.outbox.markReview(b1.id, new Error('422'));

    const removed = await win.outbox.purgeClub(CLUB_A);

    assert.equal(removed, 1);
    assert.equal(await win.outbox.get(a1.id), null);
    assert.ok(await win.outbox.get(a2.id), 'item en attente conservé (sera refusé puis purgé)');
    assert.ok(await win.outbox.get(b1.id), "revue d'un autre club conservée");
  });

  test('purgeClub({ all: true }) retire aussi les items en attente de ce club', async () => {
    win.clubId = CLUB_A;
    await win.outbox.enqueue('diver.update', { id: 'd-1' });
    win.clubId = CLUB_B;
    await win.outbox.enqueue('diver.update', { id: 'd-2' });
    assert.equal(await win.outbox.purgeClub(CLUB_A, { all: true }), 1);
    assert.equal(await win.outbox.size(), 1);
  });
});
