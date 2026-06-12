// DP Assistant — Clés localStorage / IndexedDB centralisées.
//
// Toutes les clés de stockage client doivent passer par ce module pour éviter
// la dérive (typos, duplication, oubli de migration). Préfixe `dp-` pour ne
// pas collisionner avec d'autres apps servies sur le même domaine.

(function (root) {
  const STORAGE_KEYS = Object.freeze({
    // Auth snapshot (auth-context.jsx) — fallback offline
    LAST_USER:   'dp-last-user',
    // Pre-cache annuaire (auth-context.jsx, app.jsx) — bootstrap offline rapide
    CACHE_DIVERS:'dp-cache-divers',
    CACHE_SITES: 'dp-cache-sites',
    // Brouillon legacy v1 (supprimé en boot — kept ici pour le cleanup)
    LEGACY_V1:   'dp-assistant-v1',
    // Préférence UI : avertissement météo déjà vu
    METEO_SEEN:  'dp-meteo-warned',
    // Préférence UI : visite guidée déjà vue
    TOUR_SEEN:   'dp-tour-seen',
  });

  // Cookies (non localStorage mais regroupés ici pour cohérence)
  const COOKIE_KEYS = Object.freeze({
    SESSION: 'dp_session',
    CSRF:    'dp_csrf',
  });

  // TTL communs (en ms)
  const TTL = Object.freeze({
    LAST_USER_MAX_AGE: 7 * 24 * 3600 * 1000, // aligné sur la TTL session backend
    DRIVE_TOKEN:       55 * 60 * 1000,        // 5 min de marge avant expiration GIS
  });

  const api = { STORAGE_KEYS, COOKIE_KEYS, TTL };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
