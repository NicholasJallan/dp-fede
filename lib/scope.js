// DP Assistant — bascule d'espace de données (personnel ↔ structure).
//
// Les caches clients ne sont PAS namespacés par utilisateur :
//   - IndexedDB `dp-offline` (lib/offline-store.js) : un seul jeu de stores ;
//   - snapshots localStorage `dp-cache-divers` / `dp-cache-sites` ;
//   - cache Service Worker `*-api` : sw.js sert /api/divers, /api/sites,
//     /api/dives et /api/sync/state en stale-while-revalidate, keyés par URL
//     seule — aucune discrimination de session.
//
// Sans purge, basculer d'espace afficherait les données du scope précédent au
// premier paint, et le curseur `meta.sync` hérité ferait sauter des lignes à la
// synchro suivante (sync.js ne retire que ce qui est plus récent que le
// watermark). D'où purgeLocalScope(), appelée à chaque bascule.

(function (root) {
  // L'outbox est délibérément conservée : elle porte les écritures pas encore
  // envoyées. C'est aussi pourquoi switchScope() refuse de basculer tant
  // qu'elle n'est pas vide (cf. plus bas).
  const DATA_STORES = ['divers', 'sites', 'dives', 'archives', 'meta'];

  async function purgeLocalScope() {
    if (root.offlineStore) {
      for (const store of DATA_STORES) {
        try { await root.offlineStore.clear(store); } catch (e) { /* store absent */ }
      }
    }

    const K = root.STORAGE_KEYS || {};
    for (const key of [K.CACHE_DIVERS || 'dp-cache-divers', K.CACHE_SITES || 'dp-cache-sites']) {
      try { root.localStorage.removeItem(key); } catch (e) { /* mode privé */ }
    }

    try {
      if (root.caches) {
        const names = await root.caches.keys();
        await Promise.all(
          names.filter(n => n.endsWith('-api')).map(n => root.caches.delete(n))
        );
      }
    } catch (e) { /* pas de SW (Safari privé, http local) */ }
  }

  async function pendingWrites() {
    if (!root.outbox || typeof root.outbox.size !== 'function') return 0;
    try { return await root.outbox.size(); } catch (e) { return 0; }
  }

  // Basculer avec des écritures en attente les rejouerait dans le mauvais
  // espace : les items d'outbox ne portent pas de scope, ils sont envoyés avec
  // la session courante. On tente donc un cycle de synchro, et on refuse la
  // bascule s'il en reste.
  async function switchScope(workspaceId) {
    let pending = await pendingWrites();

    if (pending > 0 && root.sync && (!root.netStatus || root.netStatus().online)) {
      try { await root.sync.cycle(); } catch (e) { /* on revérifie juste après */ }
      pending = await pendingWrites();
    }

    if (pending > 0) {
      const err = new Error(
        pending + ' modification(s) pas encore envoyée(s). Reconnectez-vous à ' +
        'Internet et réessayez : changer d\'espace maintenant les enverrait au mauvais endroit.'
      );
      err.code = 'PENDING_WRITES';
      throw err;
    }

    const user = await root.api.workspaces.activate(workspaceId);
    await purgeLocalScope();
    return user;
  }

  const api = { purgeLocalScope, switchScope, scopePendingWrites: pendingWrites };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
