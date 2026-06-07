// DP Assistant — wrapper IndexedDB natif, zéro dépendance.
//
// Stores :
//   - outbox   : queue de mutations { id, kind, payload, attempts, lastError,
//                                     nextRetryAt, createdAt, status }
//   - divers   : snapshot local des plongeurs (avec flag _pending)
//   - sites    : snapshot local des sites
//   - archives : snapshot local des archives (résumé + détail si présent)
//   - meta     : curseurs de sync, lastSyncAt, etc.
//
// Cibles compat : Safari iOS 14+, Chrome 90+, Firefox 90+. IndexedDB est
// universel sur ces cibles. Fallback localStorage uniquement si IndexedDB
// est explicitement KO (Safari mode privé sur iOS < 16 ouvre IDB mais
// refuse l'écriture — on detect cela à la première erreur d'écriture).

(function () {
  const DB_NAME    = 'dp-offline';
  const DB_VERSION = 2;
  const STORES     = ['outbox', 'divers', 'sites', 'archives', 'dives', 'meta'];

  let _dbPromise = null;
  let _fallback  = null;  // sera initialisé en lazy si IDB plante

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB indisponible'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Migration data : copie archives → dives (best-effort, en arrière-plan)
        migrateArchivesToDivesRaw(db);
        resolve(db);
      };
      req.onerror   = () => reject(req.error || new Error('IDB open failed'));
      req.onblocked = () => reject(new Error('IDB open blocked'));
    }).catch(err => {
      console.warn('[offline-store] IDB indispo → fallback localStorage :', err.message);
      _fallback = createLocalStorageFallback();
      return null;
    });
    return _dbPromise;
  }

  function tx(db, storeName, mode) {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    return { store, done: new Promise((res, rej) => {
      t.oncomplete = res;
      t.onabort    = () => rej(t.error || new Error('tx aborted'));
      t.onerror    = () => rej(t.error || new Error('tx error'));
    })};
  }

  async function get(storeName, key) {
    if (!STORES.includes(storeName)) throw new Error(`Store inconnu : ${storeName}`);
    const db = await openDb();
    if (!db) return _fallback.get(storeName, key);
    const { store } = tx(db, storeName, 'readonly');
    return await new Promise((res, rej) => {
      const r = store.get(key);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror   = () => rej(r.error);
    });
  }

  async function put(storeName, key, value) {
    if (!STORES.includes(storeName)) throw new Error(`Store inconnu : ${storeName}`);
    const db = await openDb();
    if (!db) return _fallback.put(storeName, key, value);
    try {
      const { store, done } = tx(db, storeName, 'readwrite');
      store.put(value, key);
      await done;
    } catch (err) {
      // Premier put en lecture seule (Safari iOS privé) → bascule fallback.
      console.warn('[offline-store] put failed → fallback :', err.message);
      _fallback = _fallback || createLocalStorageFallback();
      return _fallback.put(storeName, key, value);
    }
  }

  async function del(storeName, key) {
    if (!STORES.includes(storeName)) throw new Error(`Store inconnu : ${storeName}`);
    const db = await openDb();
    if (!db) return _fallback.del(storeName, key);
    const { store, done } = tx(db, storeName, 'readwrite');
    store.delete(key);
    await done;
  }

  async function all(storeName) {
    if (!STORES.includes(storeName)) throw new Error(`Store inconnu : ${storeName}`);
    const db = await openDb();
    if (!db) return _fallback.all(storeName);
    const { store } = tx(db, storeName, 'readonly');
    return await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => rej(r.error);
    });
  }

  async function allKeys(storeName) {
    if (!STORES.includes(storeName)) throw new Error(`Store inconnu : ${storeName}`);
    const db = await openDb();
    if (!db) return _fallback.allKeys(storeName);
    const { store } = tx(db, storeName, 'readonly');
    return await new Promise((res, rej) => {
      const r = store.getAllKeys();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => rej(r.error);
    });
  }

  async function clear(storeName) {
    if (!STORES.includes(storeName)) throw new Error(`Store inconnu : ${storeName}`);
    const db = await openDb();
    if (!db) return _fallback.clear(storeName);
    const { store, done } = tx(db, storeName, 'readwrite');
    store.clear();
    await done;
  }

  // ── Fallback localStorage ──────────────────────────────────────────────
  // Utilisé uniquement si IndexedDB est KO. Limité à ~5 Mo, mais ça reste
  // largement suffisant pour outbox + snapshots annuaire. Préfixe les clés
  // par `dp-fb:{store}:{key}` pour éviter les collisions.
  function createLocalStorageFallback() {
    const PREFIX = 'dp-fb:';
    function k(store, key) { return `${PREFIX}${store}:${key}`; }
    return {
      get(store, key) {
        try {
          const raw = localStorage.getItem(k(store, key));
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      },
      put(store, key, value) {
        try { localStorage.setItem(k(store, key), JSON.stringify(value)); } catch {}
      },
      del(store, key) {
        try { localStorage.removeItem(k(store, key)); } catch {}
      },
      all(store) {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
          const fullKey = localStorage.key(i);
          if (fullKey && fullKey.startsWith(`${PREFIX}${store}:`)) {
            try { out.push(JSON.parse(localStorage.getItem(fullKey))); } catch {}
          }
        }
        return out;
      },
      allKeys(store) {
        const out = [];
        const pfx = `${PREFIX}${store}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const fullKey = localStorage.key(i);
          if (fullKey && fullKey.startsWith(pfx)) out.push(fullKey.slice(pfx.length));
        }
        return out;
      },
      clear(store) {
        const pfx = `${PREFIX}${store}:`;
        const toDel = [];
        for (let i = 0; i < localStorage.length; i++) {
          const fullKey = localStorage.key(i);
          if (fullKey && fullKey.startsWith(pfx)) toDel.push(fullKey);
        }
        toDel.forEach(k => localStorage.removeItem(k));
      },
    };
  }

  // ── Migration IDB : archives → dives ──────────────────────────────────
  // Copie les données de l'ancien store 'archives' vers 'dives' (une seule fois).
  // Opération raw IDB pour éviter la dépendance circulaire avec openDb().
  function migrateArchivesToDivesRaw(db) {
    try {
      const markTx = db.transaction('meta', 'readonly');
      const checkReq = markTx.objectStore('meta').get('archivesMigrated');
      checkReq.onsuccess = () => {
        if (checkReq.result) return; // déjà fait
        try {
          const readTx  = db.transaction('archives', 'readonly');
          const keysReq = readTx.objectStore('archives').getAllKeys();
          keysReq.onsuccess = () => {
            const keys = keysReq.result || [];
            if (keys.length === 0) {
              try {
                const markTx2 = db.transaction('meta', 'readwrite');
                markTx2.objectStore('meta').put(true, 'archivesMigrated');
              } catch {}
              return;
            }
            try {
              const readTx2 = db.transaction('archives', 'readonly');
              const allReq  = readTx2.objectStore('archives').getAll();
              allReq.onsuccess = () => {
                const items = allReq.result || [];
                try {
                  const writeTx = db.transaction(['dives', 'archives', 'meta'], 'readwrite');
                  items.forEach((item, i) => {
                    writeTx.objectStore('dives').put(item, keys[i]);
                  });
                  writeTx.objectStore('archives').clear();
                  writeTx.objectStore('meta').put(true, 'archivesMigrated');
                } catch {}
              };
            } catch {}
          };
        } catch {}
      };
    } catch {}
  }

  // ── API publique ───────────────────────────────────────────────────────

  window.offlineStore = {
    get, put, del, all, allKeys, clear,
    // Exposé pour les tests : permet de forcer le fallback en CI.
    _useFallback: () => { _fallback = createLocalStorageFallback(); _dbPromise = Promise.resolve(null); },
  };
})();
