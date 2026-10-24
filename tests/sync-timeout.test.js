// Tests métier — timeout et robustesse du drain / pull dans sync.js

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline } from './helpers/offline-harness.js';
import { createSync } from '../src/offline/sync.js';

let win;
let originalFetch;

beforeEach(() => {
  win = bootOffline();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('sync — timeoutSignal et gestion des requêtes lentes / bloquées', () => {
  test(
    "_drainOutbox abandonne sur timeout, se termine en < 1 s et repasse l'item en pending (attempts 1)",
    { timeout: 200 },
    async () => {
      // Fetch qui ne se résout jamais de lui-même mais rejette quand son signal abandonne
      globalThis.fetch = (url, opts = {}) => {
        return new Promise((resolve, reject) => {
          if (opts.signal) {
            if (opts.signal.aborted) {
              reject(opts.signal.reason);
              return;
            }
            opts.signal.addEventListener('abort', () => {
              reject(opts.signal.reason);
            });
          }
          // Sans signal, la requête pend indéfiniment
        });
      };

      await win.outbox.enqueue('diver.create', { id: 'd-1', nom: 'Doe', prenom: 'John' });

      const sync = createSync({
        store: win.offlineStore,
        outbox: win.outbox,
        getNetStatus: () => ({ online: true }),
        timeoutMs: 30,
      });

      const start = Date.now();
      await sync._drainOutbox();
      const duration = Date.now() - start;

      assert.ok(duration < 1000, `Durée excessive : ${duration} ms (attendu < 1000 ms)`);

      // L'item ne doit pas être resté en 'inflight' : il doit être en 'pending' avec attempts = 1
      const items = await win.outbox.pending();
      assert.equal(items.length, 1);
      assert.equal(items[0].status, 'pending');
      assert.equal(items[0].attempts, 1);
    },
  );

  test('_pullIncremental se termine en < 1 s quand /api/sync/state pend', { timeout: 200 }, async () => {
    globalThis.fetch = (url, opts = {}) => {
      return new Promise((resolve, reject) => {
        if (opts.signal) {
          if (opts.signal.aborted) {
            reject(opts.signal.reason);
            return;
          }
          opts.signal.addEventListener('abort', () => {
            reject(opts.signal.reason);
          });
        }
        // Sans signal, la requête pend indéfiniment
      });
    };

    const sync = createSync({
      store: win.offlineStore,
      outbox: win.outbox,
      getNetStatus: () => ({ online: true }),
      timeoutMs: 30,
    });

    const start = Date.now();
    await sync._pullIncremental();
    const duration = Date.now() - start;

    assert.ok(duration < 1000, `Durée excessive : ${duration} ms (attendu < 1000 ms)`);
  });
});
