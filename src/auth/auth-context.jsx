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
//
// Club courant (docs/api-club.md) : /api/auth/me renvoie club_id ; les
// données locales sont rattachées à ce club (bindLocalDataToClub) et celles
// d'un autre club purgées avant tout affichage.

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api } from '../api/api.js';
import { STORAGE_KEYS, TTL } from '../api/storage-keys.js';
import { offlineStore } from '../offline/offline-store.js';
import { outbox } from '../offline/outbox.js';
import { bindLocalDataToClub } from '../offline/club-scope.js';
import { setCurrentClubId } from '../api/club-header.js';

const AuthContext = createContext(null);

// Clés localStorage centralisées dans src/api/storage-keys.js.
const SKEYS = STORAGE_KEYS || {
  LAST_USER: 'dp-last-user', CACHE_DIVERS: 'dp-cache-divers', CACHE_SITES: 'dp-cache-sites',
};
const LAST_USER_MAX_AGE_MS = (TTL && TTL.LAST_USER_MAX_AGE) || 7 * 24 * 3600 * 1000;

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
  try { localStorage.removeItem(SKEYS.LAST_USER); } catch { /* stockage indisponible */ }
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

// Lie les données locales (IndexedDB, caches) à l'utilisateur courant.
// Si un autre compte se connecte sur l'appareil, les données du précédent
// (annuaire, plongées, outbox) sont purgées : elles ne doivent ni lui être
// montrées ni être rejouées avec sa session.
async function bindLocalDataToUser(u) {
  if (!u || !offlineStore) return;
  try {
    const owner = await offlineStore.get('meta', 'owner');
    if (owner && owner !== u.id) await purgeLocalData();
    await offlineStore.put('meta', 'owner', u.id);
    if (u.club_id) await bindLocalDataToClub(offlineStore, u.club_id);
    // Session (re)confirmée : les actions en attente repartent immédiatement.
    if (outbox?.retryNow) await outbox.retryNow();
  } catch (err) {
    console.error('[auth] liaison des données locales :', err?.message || err);
  }
}

// Purge complète des données locales de l'appareil (déconnexion, changement
// d'utilisateur, suppression du compte) : IndexedDB, pré-caches, club courant.
async function purgeLocalData() {
  try {
    if (offlineStore?.clearAll) await offlineStore.clearAll();
  } catch (err) {
    console.error('[auth] purge IndexedDB :', err?.message || err);
  }
  try {
    [SKEYS.CACHE_DIVERS, SKEYS.CACHE_SITES, SKEYS.CLUB_SNAPSHOT].forEach(k => localStorage.removeItem(k));
  } catch { /* stockage indisponible : rien à purger */ }
  setCurrentClubId(null);
  try {
    if (window.caches) {
      const names = await caches.keys();
      await Promise.all(names.filter(n => n.endsWith('-api')).map(n => caches.delete(n)));
    }
  } catch { /* Cache API indisponible */ }
}

function AuthProvider({ children }) {
  // undefined = chargement, null = non connecté, objet = connecté
  const [user, setUser]     = useState(undefined);
  const [loading, setLoading] = useState(true);
  // 'online' = session confirmée par le serveur ; 'offline' = fallback snapshot
  const [authMode, setAuthMode] = useState('online');
  // Message affiché sur l'écran de connexion (ex. compte supprimé).
  const [loginNotice, setLoginNotice] = useState(null);

  // Au démarrage : tente /api/auth/me, fallback snapshot si KO.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await api.auth.me();
        if (cancelled) return;
        if (u) {
          writeLastUser(u);
          await bindLocalDataToUser(u);
          if (cancelled) return;
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
              bindLocalDataToUser(u);
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

  // La purge locale efface aussi l'outbox : l'appelant doit avoir prévenu
  // l'utilisateur s'il reste des actions non synchronisées.
  // keepLocal : reconnexion après expiration de session — l'outbox du même
  // utilisateur est conservée et rejouée au prochain login.
  const logout = useCallback(async ({ keepLocal = false } = {}) => {
    await api.auth.logout().catch(err => console.warn('[auth] logout serveur :', err?.message));
    clearLastUser();
    if (!keepLocal) await purgeLocalData();
    setUser(null);
    setAuthMode('online');
    window.location.reload();
  }, []);

  // Relit /api/auth/me (club courant changé : nom du club, rôle…).
  const refreshUser = useCallback(async () => {
    try {
      const u = await api.auth.me();
      if (u) {
        writeLastUser(u);
        setUser(u);
      }
      return u;
    } catch (err) {
      console.warn('[auth] relecture du compte :', err?.message || err);
      return null;
    }
  }, []);

  // Fin de session sans appel serveur (compte supprimé : la session l'est
  // aussi) : purge locale puis écran de connexion, avec un message éventuel.
  const endSession = useCallback(async ({ notice = null } = {}) => {
    clearLastUser();
    await purgeLocalData();
    setLoginNotice(notice);
    setAuthMode('online');
    setUser(null);
  }, []);

  // Callback Google Identity Services
  const handleGoogleCredential = useCallback(async (response) => {
    try {
      const u = await api.auth.google(response.credential);
      writeLastUser(u);
      await bindLocalDataToUser(u);
      setLoginNotice(null);
      setUser(u);
      setAuthMode('online');
      prefetchUserData();
    } catch (err) {
      console.error('Google auth error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, logout, handleGoogleCredential, setUser, authMode,
      refreshUser, endSession, loginNotice,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

export { AuthProvider, useAuth, AuthContext, purgeLocalData };
