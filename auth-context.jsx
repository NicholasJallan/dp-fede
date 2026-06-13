// DP Assistant — contexte d'authentification Google OAuth
//
// Comportement offline (Phase 1) :
//   - Au boot, on tente /api/auth/me. Si OK → on snapshot l'utilisateur dans
//     localStorage (dp-last-user) avec son timestamp.
//   - Si KO mais qu'on a un snapshot < 7 jours → on considère l'utilisateur
//     loggé en mode offline (authMode = 'offline'). L'app continue ; tout
//     est en lecture seule jusqu'au prochain ping OK.
//   - Si pas de snapshot ou snapshot > 7 jours → écran login normal (qui
//     affichera un message « connexion requise » si on est offline).
//
// Au succès du login Google, on précache divers + sites pour bootstrap rapide
// au prochain boot offline.

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

const AuthContext = createContext(null);

// Clés localStorage centralisées dans lib/storage-keys.js.
const SKEYS = window.STORAGE_KEYS || {
  LAST_USER: 'dp-last-user', CACHE_DIVERS: 'dp-cache-divers', CACHE_SITES: 'dp-cache-sites',
};
const LAST_USER_MAX_AGE_MS = (window.TTL && window.TTL.LAST_USER_MAX_AGE) || 7 * 24 * 3600 * 1000;

function readLastUser() {
  try {
    const raw = localStorage.getItem(SKEYS.LAST_USER);
    if (!raw) return null;
    const { user, at } = JSON.parse(raw);
    if (!user || !at) return null;
    if (Date.now() - at > LAST_USER_MAX_AGE_MS) return null;
    return user;
  } catch {
    return null;
  }
}

function writeLastUser(user) {
  try {
    localStorage.setItem(SKEYS.LAST_USER, JSON.stringify({ user, at: Date.now() }));
  } catch {
    // Quota / mode privé : on continue sans persister.
  }
}

function clearLastUser() {
  try { localStorage.removeItem(SKEYS.LAST_USER); } catch {}
}

// Pré-cache des listes au login pour bootstrap offline. Best-effort, non bloquant.
// En Phase 2, ce snapshot sera remplacé par l'offlineStore IndexedDB.
async function prefetchUserData() {
  try {
    const [divers, sites] = await Promise.all([
      api.divers.list().catch(() => null),
      api.sites.list().catch(() => null),
    ]);
    if (divers) localStorage.setItem(SKEYS.CACHE_DIVERS, JSON.stringify({ list: divers, at: Date.now() }));
    if (sites)  localStorage.setItem(SKEYS.CACHE_SITES,  JSON.stringify({ list: sites,  at: Date.now() }));
  } catch {
    // Pas grave — le SW a peut-être déjà cache via SWR.
  }
}

function AuthProvider({ children }) {
  // undefined = chargement, null = non connecté, objet = connecté
  const [user, setUser]     = useState(undefined);
  const [loading, setLoading] = useState(true);
  // 'online' = session confirmée par le serveur ; 'offline' = fallback snapshot
  const [authMode, setAuthMode] = useState('online');

  // Au démarrage : tente /api/auth/me, fallback snapshot si KO.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await api.auth.me();
        if (cancelled) return;
        if (u) {
          writeLastUser(u);
          setUser(u);
          setAuthMode('online');
          // Pré-cache en arrière-plan, non bloquant pour le splash.
          prefetchUserData();
        } else {
          // Serveur joignable mais pas de session → on est bien online mais
          // non authentifié. On n'utilise PAS le snapshot dans ce cas, car
          // le serveur a explicitement dit « pas connecté ».
          clearLastUser();
          setUser(null);
        }
      } catch (err) {
        if (cancelled) return;
        // /api/auth/me a échoué (network ou 5xx). On regarde le snapshot.
        const cached = readLastUser();
        if (cached) {
          setUser(cached);
          setAuthMode('offline');
        } else {
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Si le réseau revient et qu'on était en mode offline, on re-vérifie.
  useEffect(() => {
    function onNet(e) {
      if (e.detail.online && authMode === 'offline' && user) {
        api.auth.me()
          .then(u => {
            if (u) {
              writeLastUser(u);
              setUser(u);
              setAuthMode('online');
            } else {
              // Session expirée côté serveur — on garde le snapshot pour ne
              // pas perdre l'outbox, mais on alerte l'app via un event.
              window.dispatchEvent(new CustomEvent('dp:authExpired'));
            }
          })
          .catch(() => { /* ping foireux, on réessaiera */ });
      }
    }
    window.addEventListener('dp:netchange', onNet);
    return () => window.removeEventListener('dp:netchange', onNet);
  }, [authMode, user]);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    clearLastUser();
    setUser(null);
    setAuthMode('online');
    window.location.reload();
  }, []);

  // Callback Google Identity Services
  const handleGoogleCredential = useCallback(async (response) => {
    try {
      const u = await api.auth.google(response.credential);
      writeLastUser(u);
      setUser(u);
      setAuthMode('online');
      prefetchUserData();
    } catch (err) {
      console.error('Google auth error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, handleGoogleCredential, setUser, authMode }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

export { AuthProvider, useAuth, AuthContext };
