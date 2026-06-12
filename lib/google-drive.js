// DP Assistant — Helper centralisé pour OAuth Drive + lecture CSRF.
//
// Avant ce module, le flux Drive (initTokenClient → requestAccessToken →
// stockage token) était dupliqué dans 4 endroits : screen-home (pré-auth +
// handleNew), screen-archive (doArchive + finalizePendingDrive). Toute
// modification (timeout, scope, format de cache) devait être propagée à la
// main, avec un risque évident de désynchro.
//
// Ce module expose un seul point d'entrée :
//   getDriveToken({ explicit, timeoutMs }) → Promise<string>
//
// Sémantique :
//   - Si un token valide est en cache (window.dp_driveToken) et qu'il reste
//     au moins TTL.DRIVE_TOKEN avant expiration, on le retourne sans GIS.
//   - Sinon on demande à GIS un nouveau token (prompt='consent' si explicit,
//     prompt='' sinon — l'utilisateur a déjà donné son accord initial).
//   - Si GIS ne répond pas avant timeoutMs (popup bloqué silencieusement),
//     on reject avec une erreur claire.
//   - Le token frais est mis en cache pour 55 min.
//
// Le scope est fixe : drive.file (accès uniquement aux fichiers créés par
// l'app). Ne pas élargir sans audit de sécurité.

(function (root) {
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  // 55 min : GIS access tokens durent 1h, on garde 5 min de marge avant
  // d'aller en demander un nouveau (évite les requêtes Drive qui partent
  // avec un token qui expire entre le check et l'envoi).
  const TOKEN_CACHE_MS = 55 * 60 * 1000;
  // Sans geste user, le popup GIS peut être bloqué silencieusement par le
  // navigateur. On reject après ce délai pour ne pas hang infiniment.
  const DEFAULT_TIMEOUT_MS = 15000;

  function isGisAvailable() {
    return typeof window !== 'undefined'
        && !!window.google?.accounts?.oauth2
        && !!window.GOOGLE_CLIENT_ID;
  }

  function getCachedToken() {
    const cached = window.dp_driveToken;
    if (cached?.access_token && cached.expires_at > Date.now()) {
      return cached.access_token;
    }
    return null;
  }

  function setCachedToken(access_token) {
    window.dp_driveToken = {
      access_token,
      expires_at: Date.now() + TOKEN_CACHE_MS,
    };
  }

  function clearCachedToken() {
    window.dp_driveToken = null;
  }

  // Demande un access_token Drive. Cache-first.
  //
  // options.explicit   : true → force prompt='consent' (réautoriser quand
  //                      l'utilisateur clique « Réessayer » après une révocation
  //                      ou un refus). Par défaut false → prompt='' (silencieux).
  // options.timeoutMs  : délai max avant reject. Défaut 15s.
  function getDriveToken({ explicit = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
      if (!isGisAvailable()) {
        reject(new Error('Google Identity Services indisponible — recharger la page.'));
        return;
      }

      const cached = getCachedToken();
      if (cached && !explicit) {
        resolve(cached);
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Autorisation Google Drive expirée — cliquez sur le bouton pour réessayer.'));
      }, timeoutMs);

      try {
        const tc = window.google.accounts.oauth2.initTokenClient({
          client_id: window.GOOGLE_CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (resp) => {
            clearTimeout(timer);
            if (resp.error) {
              reject(new Error(`Google Drive : ${resp.error}`));
              return;
            }
            setCachedToken(resp.access_token);
            resolve(resp.access_token);
          },
        });
        tc.requestAccessToken({ prompt: explicit ? 'consent' : '' });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  // Lecture du cookie CSRF — utilisé par api.js, sync.js, offline-api.js,
  // screen-archive.jsx. Centralisé pour éviter 4 regex différentes.
  function getCsrfToken() {
    if (typeof document === 'undefined') return '';
    const m = document.cookie.match(/(?:^|; )dp_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  const api = {
    getDriveToken,
    clearCachedToken,
    getCachedToken,
    isGisAvailable,
    getCsrfToken,
    _scope: DRIVE_SCOPE,
    _cacheMs: TOKEN_CACHE_MS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
