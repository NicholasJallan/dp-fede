// DP Assistant — Contexte « club courant » : informations, rôle, droits,
// changement de club et invitation en attente.
//
//   const club = useClub();
//   club.can('divers.write')   // matrice docs/api-club.md (droits serveur prioritaires)
//   await club.switchClub(id)  // purge les données locales de l'ancien club puis resynchronise
//
// Le dernier GET /api/club est gardé en localStorage : rôle et droits restent
// connus hors ligne. Sans réponse ni instantané, le rôle de /api/auth/me
// (club_role) s'applique.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/api.js';
import { STORAGE_KEYS } from '../api/storage-keys.js';
import { useAuth } from '../auth/auth-context.jsx';
import { offlineStore } from '../offline/offline-store.js';
import { bindLocalDataToClub } from '../offline/club-scope.js';
import { sync } from '../offline/sync.js';
import { can as canRole } from './permissions.js';
import { captureInvitationFromUrl, clearPendingInvitation, readPendingInvitation } from './invitation.js';

const ClubContext = createContext(null);

function readSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLUB_SNAPSHOT);
    const data = raw ? JSON.parse(raw) : null;
    return data?.club?.id ? data : null;
  } catch { return null; }
}

function writeSnapshot(data) {
  try { localStorage.setItem(STORAGE_KEYS.CLUB_SNAPSHOT, JSON.stringify(data)); } catch { /* quota : mémoire seule */ }
}

// Invitation en attente : lue au démarrage puis à chaque changement de fragment.
function usePendingInvitation() {
  const [token, setToken] = useState(() => readPendingInvitation());
  useEffect(() => {
    const onHash = () => setToken(captureInvitationFromUrl());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const dismiss = useCallback(() => { clearPendingInvitation(); setToken(null); }, []);
  return [token, dismiss];
}

function useClubInfo(user, authMode) {
  const [info, setInfo] = useState(() => readSnapshot());
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const data = await api.club.get();
      setInfo(data);
      writeSnapshot(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err);
      return null;
    }
  }, []);
  useEffect(() => {
    if (user && authMode === 'online') refresh();
  }, [user?.id, user?.club_id, authMode, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  return { info, setInfo, error, refresh };
}

export function ClubProvider({ children }) {
  const { user, authMode, refreshUser } = useAuth();
  const { info, setInfo, error, refresh } = useClubInfo(user, authMode);
  const [invitationToken, dismissInvitation] = usePendingInvitation();

  // Nouveau club courant (payload au format GET /api/club) : purge des
  // données de l'ancien club, compte relu, resynchronisation.
  const applyClubChange = useCallback(async (payload) => {
    if (payload?.club?.id) await bindLocalDataToClub(offlineStore, payload.club.id);
    if (payload) { setInfo(payload); writeSnapshot(payload); }
    await refreshUser();
    sync.trigger('club-changed');
    return payload;
  }, [refreshUser, setInfo]);

  const switchClub = useCallback(async (clubId) => applyClubChange(await api.club.switch(clubId)), [applyClubChange]);

  const acceptInvitation = useCallback(async (token) => {
    const res = await api.club.invitations.accept(token);
    dismissInvitation();
    return applyClubChange(res);
  }, [applyClubChange, dismissInvitation]);

  // Après « quitter le club » ou sa suppression : le serveur choisit le club suivant.
  const reloadCurrentClub = useCallback(async () => applyClubChange(await api.club.get()), [applyClubChange]);

  // Club changé ailleurs (détecté par la sync) : relire club et compte.
  useEffect(() => {
    const onChanged = (e) => {
      if (e.detail?.to && e.detail.to === info?.club?.id) return;
      refresh();
      refreshUser();
    };
    window.addEventListener('dp:clubChanged', onChanged);
    return () => window.removeEventListener('dp:clubChanged', onChanged);
  }, [info?.club?.id, refresh, refreshUser]);

  const value = useMemo(() => {
    // Instantané d'un autre club (changement pas encore relu) : ignoré.
    const current = info && (!user?.club_id || info.club?.id === user.club_id) ? info : null;
    const role = current?.role || user?.club_role || null;
    const permissions = current?.permissions || null;
    return {
      info: current, club: current?.club || null, role, permissions, error,
      clubsCount: current?.clubs_count ?? user?.club_count ?? 1,
      can: (permission) => canRole(role, permission, permissions),
      refresh, switchClub, acceptInvitation, reloadCurrentClub, setInfo,
      invitationToken, dismissInvitation,
    };
  }, [info, user?.club_id, user?.club_role, user?.club_count, error, refresh, switchClub,
    acceptInvitation, reloadCurrentClub, setInfo, invitationToken, dismissInvitation]);

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

// Hors fournisseur (tests de composants isolés) : aucun droit masqué.
const NO_CLUB = {
  info: null, club: null, role: null, permissions: null, error: null, clubsCount: 1,
  can: () => true,
  refresh: async () => null, switchClub: async () => null, acceptInvitation: async () => null,
  reloadCurrentClub: async () => null, setInfo: () => {},
  invitationToken: null, dismissInvitation: () => {},
};

export function useClub() {
  return useContext(ClubContext) || NO_CLUB;
}
