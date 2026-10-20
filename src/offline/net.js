// DP Assistant — Détection online/offline + utilitaires réseau bas-niveau.
//
// navigator.onLine est un mensonge utile : il dit « connecté à un réseau »
// pas « internet accessible ». On combine 3 signaux :
//   1. navigator.onLine (transition de base)
//   2. Events 'online'/'offline' du navigateur
//   3. Ping HEAD /api/auth/me périodique (toutes les 30s en focus tab)
//
// Le résultat synthétisé est exposé via :
//   - useOnline()                hook React (./use-online.js)
//   - netStatus()                lecture synchrone (export de ce module)
//   - window.addEventListener('dp:netchange', e => e.detail.online)
//
// Les écouteurs et le ping périodique ne démarrent qu'à l'appel de
// startNetMonitor() (src/app/bootstrap.js) : importer le module est sans effet.
//
// La détection « vraie » online n'apparaît qu'après un ping réussi. Tant
// que le ping n'a pas répondu, on se fie à navigator.onLine (pessimiste).

// État interne : true = on a une connectivité utilisable.
// Initialisation : on fait confiance à navigator.onLine au démarrage,
// un ping immédiat affinera dans la première seconde.
let _online = typeof navigator === 'undefined' || navigator.onLine !== false;
let _lastPingOk = 0;
let _pingInFlight = null;

const PING_PATH = '/api/auth/me';
const PING_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS  = 4000;

function setOnline(next, reason) {
  if (next === _online) return;
  _online = next;
  window.dispatchEvent(new CustomEvent('dp:netchange', {
    detail: { online: next, reason },
  }));
}

async function pingOnce() {
  if (_pingInFlight) return _pingInFlight;
  _pingInFlight = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    try {
      // HEAD sur /api/auth/me — pas de body, juste valider le round-trip.
      // L'endpoint répond 200 même si non connecté (renvoie null), donc on
      // accepte tout statut 2xx ou 401 comme « serveur joignable ».
      const res = await fetch(PING_PATH, {
        method: 'HEAD',
        credentials: 'include',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const ok = res.status < 500;
      if (ok) {
        _lastPingOk = Date.now();
        setOnline(true, 'ping');
      } else {
        setOnline(false, 'ping-5xx');
      }
      return ok;
    } catch {
      clearTimeout(t);
      setOnline(false, 'ping-fail');
      return false;
    } finally {
      _pingInFlight = null;
    }
  })();
  return _pingInFlight;
}

let _started = false;

/** Branche les écouteurs navigateur et lance le ping (idempotent). */
export function startNetMonitor() {
  if (_started) return;
  _started = true;
  _online = navigator.onLine !== false;

  // Listeners navigateur — réactifs aux transitions immédiates.
  window.addEventListener('online', () => {
    // Si le navigateur nous dit online, on vérifie quand même via ping.
    pingOnce();
  });
  window.addEventListener('offline', () => {
    setOnline(false, 'navigator-offline');
  });

  // Re-ping quand l'onglet redevient visible : utile pour le mobile qui
  // suspend les timers en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pingOnce();
  });

  // Ping périodique tant que l'onglet est visible.
  setInterval(() => {
    if (document.visibilityState === 'visible') pingOnce();
  }, PING_INTERVAL_MS);

  // Ping initial après chargement, pour ajuster _online dès le démarrage.
  pingOnce();
}

// ── API publique ───────────────────────────────────────────────────────

/** Lecture synchrone de l'état réseau synthétisé. */
export function netStatus() {
  return {
    online: _online,
    lastPingOk: _lastPingOk,
    ageMs: _lastPingOk ? Date.now() - _lastPingOk : null,
  };
}
