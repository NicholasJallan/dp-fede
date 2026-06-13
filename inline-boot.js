// Scripts d'amorçage sortis inline pour respecter la CSP sans 'unsafe-inline'.
// Chargé avant Google Identity Services et Google Maps.

// --- Fallback de chargement (affiché si React ne monte pas en 12 s) ---
var _loadTimer = setTimeout(function() {
  var root = document.getElementById('root');
  if (!root || !root.hasChildNodes()) {
    var fb = document.getElementById('load-fallback');
    if (fb) fb.style.display = 'flex';
  }
}, 12000);
window.addEventListener('dp:appReady', function() { clearTimeout(_loadTimer); });

// --- Google Client ID (exposé avant GIS pour les callbacks) ---
window.GOOGLE_CLIENT_ID = "813155202106-jlddu3nmfuq552p9673odcegrf5kuke7.apps.googleusercontent.com";

// --- Callback Google Maps (déclaré avant le chargement asynchrone de l'API) ---
window.__gmapsLoaded = false;
window.__gmapsReady = function() {
  window.__gmapsLoaded = true;
  window.dispatchEvent(new Event('gmaps:ready'));
};

// --- Enregistrement du Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function(reg) {
        reg.addEventListener('updatefound', function() {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function() {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('dp:swUpdate', { detail: { reg: reg } }));
            }
          });
        });

        navigator.serviceWorker.addEventListener('message', function(e) {
          if (e.data && e.data.type) {
            window.dispatchEvent(new CustomEvent('dp:sw', { detail: e.data }));
          }
        });
      })
      .catch(function(err) { console.warn('[SW] register échec :', err && err.message || err); });
  });
}
