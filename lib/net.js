// DP Assistant — Détection online/offline + utilitaires réseau bas-niveau.
//
// navigator.onLine est un mensonge utile : il dit « connecté à un réseau »
// pas « internet accessible ». On combine 3 signaux :
//   1. navigator.onLine (transition de base)
//   2. Events 'online'/'offline' du navigateur
//   3. Ping HEAD /api/auth/me périodique (toutes les 30s en focus tab)
//
// Le résultat synthétisé est exposé via :
//   - window.useOnline()         hook React
//   - window.netStatus()         lecture synchrone
//   - window.addEventListener('dp:netchange', e => e.detail.online)
//
// La détection « vraie » online n'apparaît qu'après un ping réussi. Tant
// que le ping n'a pas répondu, on se fie à navigator.onLine (pessimiste).

(function () {
  // État interne : true = on a une connectivité utilisable.
  // Initialisation : on fait confiance à navigator.onLine au démarrage,
  // un ping immédiat affinera dans la première seconde.
  let _online = navigator.onLine !== false;
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
      } catch (err) {
        clearTimeout(t);
        setOnline(false, 'ping-fail');
        return false;
      } finally {
        _pingInFlight = null;
      }
    })();
    return _pingInFlight;
  }

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

  // ── API publique ───────────────────────────────────────────────────────

  window.netStatus = () => ({
    online: _online,
    lastPingOk: _lastPingOk,
    ageMs: _lastPingOk ? Date.now() - _lastPingOk : null,
  });

  window.netPing = pingOnce;

  // Hook React minimaliste.
  window.useOnline = function useOnline() {
    const [online, setLocal] = React.useState(_online);
    React.useEffect(() => {
      const handler = (e) => setLocal(e.detail.online);
      window.addEventListener('dp:netchange', handler);
      return () => window.removeEventListener('dp:netchange', handler);
    }, []);
    return online;
  };

  // ── Polyfill crypto.randomUUID (Safari < 15.4) ─────────────────────────
  // Garantit qu'on peut générer des UUID v4 RFC 4122 même sur des Safari
  // un peu anciens. Utilisé par l'outbox pour générer client_uuid.
  if (!window.crypto?.randomUUID) {
    const bytes = new Uint8Array(16);
    window.randomUUID = function randomUUID() {
      window.crypto.getRandomValues(bytes);
      // Version 4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      // Variant 10
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
      return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
      ].join('-');
    };
  } else {
    window.randomUUID = () => window.crypto.randomUUID();
  }
})();
