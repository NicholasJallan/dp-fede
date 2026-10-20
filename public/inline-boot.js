// Scripts d'amorçage sortis inline pour respecter la CSP sans 'unsafe-inline'.
// Chargé avant Google Identity Services et Google Maps.

// --- Thème Soleil / Nuit : appliqué avant le premier rendu (pas de flash) ---
// Choix explicite mémorisé par la bascule de la barre haute (src/app/hooks/use-theme.js) ;
// sans choix, la préférence système (prefers-color-scheme) s'applique via le CSS.
(function () {
  try {
    var t = localStorage.getItem('dp-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* stockage indisponible : préférence système */
  }
})();

// --- Fallback de chargement (affiché si React ne monte pas en 12 s) ---
var _loadTimer = setTimeout(function () {
  var root = document.getElementById('root');
  if (!root || !root.hasChildNodes()) {
    var fb = document.getElementById('load-fallback');
    if (fb) fb.classList.add('is-visible');
  }
}, 12000);
window.addEventListener('dp:appReady', function () {
  clearTimeout(_loadTimer);
});

// Bouton « Vider le cache et recharger » (gestionnaire attaché ici : pas de
// onclick inline, interdit par la CSP sans 'unsafe-inline').
document.addEventListener('click', function (e) {
  if (!e.target || e.target.id !== 'load-fallback-reset') return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        regs.forEach(function (r) {
          r.unregister();
        });
        return caches.keys();
      })
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            return caches.delete(k);
          }),
        );
      })
      .then(
        function () {
          location.reload();
        },
        function () {
          location.reload();
        },
      );
  } else {
    location.reload();
  }
});

// --- Google Client ID (exposé avant GIS pour les callbacks) ---
window.GOOGLE_CLIENT_ID = '813155202106-jlddu3nmfuq552p9673odcegrf5kuke7.apps.googleusercontent.com';

// --- Callback Google Maps (déclaré avant le chargement asynchrone de l'API) ---
window.__gmapsLoaded = false;
window.__gmapsReady = function () {
  window.__gmapsLoaded = true;
  window.dispatchEvent(new Event('gmaps:ready'));
};

// --- Enregistrement du Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('dp:swUpdate', { detail: { reg: reg } }));
            }
          });
        });

        navigator.serviceWorker.addEventListener('message', function (e) {
          if (e.data && e.data.type) {
            window.dispatchEvent(new CustomEvent('dp:sw', { detail: e.data }));
          }
        });
      })
      .catch(function (err) {
        console.warn('[SW] register échec :', (err && err.message) || err);
      });
  });
}
