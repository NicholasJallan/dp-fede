// Tests métier — outbox (queue de mutations offline).

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { bootOffline } = require('./helpers/offline-harness');

let win;
beforeEach(() => { win = bootOffline(); });

describe('outbox — enqueue / pending / size', () => {
  test('enqueue persiste un item avec id, kind, payload, attempts=0', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe' });
    assert.equal(it.kind, 'diver.create');
    assert.equal(it.attempts, 0);
    assert.equal(it.payload.nom, 'Doe');
    assert.ok(it.id && it.id.length === 36, 'UUID v4');
    assert.equal(it.status, 'pending');
  });

  test('pending() retourne les items en attente', async () => {
    await win.outbox.enqueue('diver.create', { id: 'a' });
    await win.outbox.enqueue('site.create',  { id: 'b' });
    const all = await win.outbox.pending();
    assert.equal(all.length, 2);
    assert.equal(await win.outbox.size(), 2);
  });

  test('clear vide la queue', async () => {
    await win.outbox.enqueue('diver.create', { id: 'a' });
    await win.outbox.clear();
    assert.equal(await win.outbox.size(), 0);
  });
});

describe('outbox — ready / FIFO / nextWakeMs', () => {
  test('ready() retourne items où nextRetryAt <= now, triés par createdAt', async () => {
    const a = await win.outbox.enqueue('diver.create', { id: 'a' });
    // petit délai pour garantir createdAt distinct
    await new Promise(r => setTimeout(r, 5));
    const b = await win.outbox.enqueue('site.create', { id: 'b' });
    const ready = await win.outbox.ready();
    assert.equal(ready.length, 2);
    assert.equal(ready[0].id, a.id, 'FIFO : a vient avant b');
    assert.equal(ready[1].id, b.id);
  });

  test('un item avec nextRetryAt futur est exclu de ready()', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'a' });
    // Reporte le retry à +10s
    await win.outbox.update(it.id, { nextRetryAt: Date.now() + 10_000 });
    const ready = await win.outbox.ready();
    assert.equal(ready.length, 0);
    // nextWakeMs renvoie un délai > 0
    const wake = await win.outbox.nextWakeMs();
    assert.ok(wake > 5_000 && wake <= 10_000, `wake=${wake}`);
  });
});

describe('outbox — markDone / markFailed / backoff exp', () => {
  test('markDone supprime l\'item', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'a' });
    await win.outbox.markDone(it.id);
    assert.equal(await win.outbox.size(), 0);
  });

  test('markFailed incrémente attempts et programme un nextRetryAt > now', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'a' });
    const before = Date.now();
    await win.outbox.markFailed(it.id, new Error('boom'));
    const got = await win.outbox.get(it.id);
    assert.equal(got.attempts, 1);
    assert.equal(got.lastError, 'boom');
    assert.ok(got.nextRetryAt > before, 'nextRetryAt programmé dans le futur');
    // 1er retry ≈ 10s
    const delta = got.nextRetryAt - before;
    assert.ok(delta >= 7_000 && delta <= 13_000, `1er retry ~10s (got ${delta}ms)`);
  });

  test('backoff exponentiel : 10s, 30s, 60s, 120s, 300s, 600s, 1800s, 3600s, 7200s, puis plafond', async () => {
    // _backoffMs(attempts) renvoie un délai en ms avec jitter ±15%.
    const expectedSeconds = [10, 30, 60, 120, 300, 600, 1800, 3600, 7200];
    for (let i = 0; i < expectedSeconds.length; i++) {
      const ms = win.outbox._backoffMs(i);
      const expected = expectedSeconds[i] * 1000;
      const lower = expected * 0.85;
      const upper = expected * 1.15;
      assert.ok(ms >= lower && ms <= upper, `attempts=${i} : ${ms}ms ∉ [${lower}, ${upper}]`);
    }
    // Plafond : au-delà du dernier index, on reste au plafond (jitter ok)
    const plat = win.outbox._backoffMs(50);
    assert.ok(plat >= 7200 * 1000 * 0.85, 'plafond 2h respecté');
    assert.ok(plat <= 7200 * 1000 * 1.15);
  });

  test('retry indéfini : pas d\'état "abandonné" après N échecs', async () => {
    const it = await win.outbox.enqueue('diver.create', { id: 'a' });
    for (let i = 0; i < 20; i++) {
      await win.outbox.markFailed(it.id, new Error(`fail ${i}`));
    }
    const got = await win.outbox.get(it.id);
    assert.equal(got.status, 'pending', 'jamais en review/abandoned');
    assert.equal(got.attempts, 20);
  });
});
