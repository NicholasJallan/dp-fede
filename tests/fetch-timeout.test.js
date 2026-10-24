// Tests unitaires — timeout de requête HTTP (src/api/fetch-timeout.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REQUEST_TIMEOUT_MS, timeoutSignal } from '../src/api/fetch-timeout.js';

describe('fetch-timeout — REQUEST_TIMEOUT_MS', () => {
  test('vaut 20 000 ms (20 s)', () => {
    assert.equal(REQUEST_TIMEOUT_MS, 20_000);
  });
});

describe('fetch-timeout — timeoutSignal', () => {
  test('abandonne après ms avec raison TimeoutError', async () => {
    const start = Date.now();
    const signal = timeoutSignal(20);
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);

    await new Promise((resolve) => {
      signal.addEventListener('abort', resolve, { once: true });
    });

    assert.equal(signal.aborted, true);
    assert.equal(signal.reason?.name, 'TimeoutError');
    assert.ok(Date.now() - start >= 15);
  });

  test('abandonne quand callerSignal abandonne avant le délai et propage sa raison', () => {
    const controller = new AbortController();
    const callerReason = new Error('Annulation utilisateur');
    const signal = timeoutSignal(500, controller.signal);

    assert.equal(signal.aborted, false);
    controller.abort(callerReason);

    assert.equal(signal.aborted, true);
    assert.equal(signal.reason, callerReason);
  });

  test('ms non fini ou <= 0 renvoie callerSignal tel quel', () => {
    const controller = new AbortController();
    assert.equal(timeoutSignal(0, controller.signal), controller.signal);
    assert.equal(timeoutSignal(-10, controller.signal), controller.signal);
    assert.equal(timeoutSignal(NaN, controller.signal), controller.signal);
    assert.equal(timeoutSignal(Infinity, controller.signal), controller.signal);

    assert.equal(timeoutSignal(0), undefined);
    assert.equal(timeoutSignal(-1), undefined);
  });

  test('si AbortSignal.timeout est indisponible, replie sur callerSignal', () => {
    const originalTimeout = AbortSignal.timeout;
    try {
      // @ts-ignore
      delete AbortSignal.timeout;

      const controller = new AbortController();
      assert.equal(timeoutSignal(20, controller.signal), controller.signal);
      assert.equal(timeoutSignal(20), undefined);
    } finally {
      AbortSignal.timeout = originalTimeout;
    }
  });
});
