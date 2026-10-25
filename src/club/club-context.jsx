// DP Assistant — Contexte « club courant » : informations, rôle, droits,
// changement de club et invitation en attente.
//
//   const club = useClub();
//   club.can('divers.write')   // matrice docs/api-club.md (droits serveur prioritaires)
//   await club.switchClub(id)  // purge les données locales de l'ancien club puis resynchronise
//   await club.createClub(f)   // POST /api/clubs : nouveau club courant (responsable)
//
// Club quitté ou retiré (403 CLUB_NOT_MEMBER sur n'importe quelle requête,
// événement dp:clubNotMember) : actions « à revoir » de ce club retirées de
// l'outbox, club courant oublié puis relu au serveur (données locales de
// l'ancien club purgées), et avis `lostClub` proposant de supprimer les
// données de l'appareil.
//
// Le dernier GET /api/club est gardé en localStorage : rôle et droits restent
// connus hors ligne. Sans réponse ni instantané, le rôle de /api/auth/me
// (club_role) s'applique.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/api.js';
import { DEFAULT_JURISDICTION, normalizeJurisdiction } from '../domain/index.js';
import { STORAGE_KEYS } from '../api/storage-keys.js';
import { useAuth } from '../auth/auth-context.jsx';
import { offlineStore } from '../offline/offline-store.js';
import { bindLocalDataToClub } from '../offline/club-scope.js';
import { sync } from '../offline/sync.js';
import { can as canRole } from './permissions.js';
import { handleClubNotMember } from './membership-lost.js';
import { getCurrentClubId } from '../api/club-header.js';
import { captureInvitationFromUrl, clearPendingInvitation, readPendingInvitation } from './invitation.js';

const ClubContext = createContext(null);

function readSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLUB_SNAPSHOT);
    const data = raw ? JSON.parse(raw) : null;
    return data?.club?.id ? data : null;
  } catch {
    return null;
  }
}

function writeSnapshot(data) {
  try {
    localStorage.setItem(STORAGE_KEYS.CLUB_SNAPSHOT, JSON.stringify(data));
  } catch {
    /* quota : mémoire seule */
  }
}

// Invitation en attente : lue au démarrage puis à chaque changement de fragment.
function usePendingInvitation() {
  const [token, setToken] = useState(() => readPendingInvitation());
  useEffect(() => {
    const onHash = () => setToken(captureInvitationFromUrl());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const dismiss = useCallback(() => {
    clearPendingInvitation();
    setToken(null);
  }, []);
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

// 403 CLUB_NOT_MEMBER (dp:clubNotMember) : purge des actions en revue du club
// refusé et, s'il s'agissait du club courant, resynchronisation sur le club
// que choisit le serveur. Un seul traitement à la fois.
function useLostClub({ info, authMode, applyClubChange }) {
  const [lostClub, setLostClub] = useState(null);
  const busy = useRef(false);
  useEffect(() => {
    const onLost = async (e) => {
      if (busy.current) return;
      busy.current = true;
      const clubId = e.detail?.clubId || null;
      const name = clubId && info?.club?.id === clubId ? info.club.nom : null;
      try {
        const { removed, wasCurrent } = await handleClubNotMember({ clubId });
        if (wasCurrent && authMode === 'online') await applyClubChange(await api.club.get());
        if (wasCurrent || removed > 0) setLostClub({ clubId, name, removed });
      } catch (err) {
        console.warn('[club] resynchronisation après club quitté :', err?.message || err);
      } finally {
        busy.current = false;
      }
    };
    window.addEventListener('dp:clubNotMember', onLost);
    return () => window.removeEventListener('dp:clubNotMember', onLost);
  }, [info, authMode, applyClubChange]);
  const dismiss = useCallback(() => setLostClub(null), []);
  return { lostClub, dismiss };
}

export function ClubProvider({ children }) {
  const { user, authMode, refreshUser } = useAuth();
  const { info, setInfo, error, refresh } = useClubInfo(user, authMode);
  const [invitationToken, dismissInvitation] = usePendingInvitation();

  // Nouveau club courant (payload au format GET /api/club) : purge des
  // données de l'ancien club, compte relu, resynchronisation.
  const applyClubChange = useCallback(
    async (payload) => {
      if (payload?.club?.id) await bindLocalDataToClub(offlineStore, payload.club.id);
      if (payload) {
        setInfo(payload);
        writeSnapshot(payload);
      }
      await refreshUser();
      sync.trigger('club-changed');
      return payload;
    },
    [refreshUser, setInfo],
  );

  const switchClub = useCallback(async (clubId) => applyClubChange(await api.club.switch(clubId)), [applyClubChange]);

  const createClub = useCallback(async (fields) => applyClubChange(await api.clubs.create(fields)), [applyClubChange]);

  const acceptInvitation = useCallback(
    async (token) => {
      const res = await api.club.invitations.accept(token);
      dismissInvitation();
      return applyClubChange(res);
    },
    [applyClubChange, dismissInvitation],
  );

  // Après « quitter le club » ou sa suppression : le serveur choisit le club
  // suivant. Le club quitté est d'abord oublié (sinon X-DP-Club le viserait
  // encore → 403) et ses actions « à revoir » retirées de l'outbox.
  const reloadCurrentClub = useCallback(async () => {
    await handleClubNotMember({ clubId: getCurrentClubId() });
    return applyClubChange(await api.club.get());
  }, [applyClubChange]);

  const lost = useLostClub({ info, authMode, applyClubChange });

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
      info: current,
      club: current?.club || null,
      // Juridiction d'origine du club : repli quand le pays du site est inconnu.
      jurisdiction:
        normalizeJurisdiction(current?.club?.jurisdiction ?? user?.club_jurisdiction) ?? DEFAULT_JURISDICTION,
      role,
      permissions,
      error,
      clubsCount: current?.clubs_count ?? user?.club_count ?? 1,
      can: (permission) => canRole(role, permission, permissions),
      refresh,
      switchClub,
      createClub,
      acceptInvitation,
      reloadCurrentClub,
      setInfo,
      invitationToken,
      dismissInvitation,
      lostClub: lost.lostClub,
      dismissLostClub: lost.dismiss,
    };
  }, [
    info,
    user?.club_id,
    user?.club_role,
    user?.club_count,
    user?.club_jurisdiction,
    error,
    refresh,
    switchClub,
    createClub,
    acceptInvitation,
    reloadCurrentClub,
    setInfo,
    invitationToken,
    dismissInvitation,
    lost.lostClub,
    lost.dismiss,
  ]);

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

// Hors fournisseur (tests de composants isolés) : aucun droit masqué.
const NO_CLUB = {
  info: null,
  club: null,
  role: null,
  permissions: null,
  error: null,
  clubsCount: 1,
  can: () => true,
  refresh: async () => null,
  switchClub: async () => null,
  createClub: async () => null,
  acceptInvitation: async () => null,
  reloadCurrentClub: async () => null,
  setInfo: () => {},
  invitationToken: null,
  dismissInvitation: () => {},
  lostClub: null,
  dismissLostClub: () => {},
};

export function useClub() {
  return useContext(ClubContext) || NO_CLUB;
}
