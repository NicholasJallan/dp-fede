// DP Assistant — Écran « Club » : club courant, membres et rôles,
// invitations, changement de club, départ / suppression.
//
// Droits (docs/api-club.md) : tout membre consulte ; le responsable
// (club.manage) modifie les informations, gère membres et invitations.

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth-context.jsx';
import { useClub } from '../../club/club-context.jsx';
import { useOnline } from '../../offline/use-online.jsx';
import { useToasts } from '../../components/toast.jsx';
import { Alert, Notice, Pill } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { api } from '../../api/api.js';
import { ROLE_HINTS, describeApiError, roleLabel } from '../../club/permissions.js';
import { ClubInfoCard } from './club-info.jsx';
import { ClubMembersCard } from './club-members.jsx';
import { ClubInvitationsCard } from './club-invitations.jsx';
import { ClubSwitcherCard, useMemberships } from './club-switcher.jsx';
import { ClubDangerZone } from './club-danger-zone.jsx';

function useMembers(online, clubId) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await api.club.members();
      setMembers(res?.members || []);
      setInvitations(res?.invitations || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (online) load(); else setLoading(false);
  }, [online, clubId, load]);
  return { members, setMembers, invitations, setInvitations, loading, error };
}

function ClubCounts({ counts }) {
  if (!counts) return null;
  const items = [
    ['Membres', counts.members],
    ['Plongeurs', counts.divers],
    ['Sites', counts.sites],
    ['Plongées archivées', counts.dives_archived],
  ];
  return (
    <div className="kpi-grid" role="list" aria-label="Le club en chiffres">
      {items.map(([k, v]) => (
        <div key={k} className="kpi" role="listitem"><span className="v">{v ?? 0}</span><span className="k">{k}</span></div>
      ))}
    </div>
  );
}

function ClubHead({ name, role, onStats }) {
  return (
    <div className="page-head">
      <p className="step-tag"><Icon.Flag />Club courant</p>
      <h1>{name}</h1>
      <p className="club-role">Votre rôle : <Pill tone="ink" className="lg">{roleLabel(role)}</Pill></p>
      {role && <p className="small">{ROLE_HINTS[role]}</p>}
      <div className="page-head-actions">
        <button type="button" className="btn" onClick={onStats}><Icon.Chart />Statistiques du club</button>
      </div>
    </div>
  );
}

export function ScreenClub({ onNavigate }) {
  const { user, refreshUser } = useAuth();
  const club = useClub();
  const online = useOnline();
  const { showToast } = useToasts();
  const clubId = club.club?.id || user?.club_id;
  const canManage = club.can('club.manage');
  const m = useMembers(online, clubId);
  const clubs = useMemberships(online, clubId);
  const name = club.club?.nom || user?.club_nom || 'Club sans nom';
  const me = m.members.find(x => x.is_me);

  const onSaved = async (payload) => {
    club.setInfo(payload);
    await refreshUser();
  };

  const onSwitch = async (target) => {
    await club.switchClub(target.club_id);
    showToast({ tone: 'ok', title: 'Club changé', body: `Vous travaillez maintenant pour ${target.nom || 'ce club'}.` });
    onNavigate('home');
  };

  const onLeft = async () => {
    try {
      const res = await club.reloadCurrentClub();
      showToast({ tone: 'ok', title: 'Club quitté', body: `Club courant : ${res?.club?.nom || 'votre club personnel'}.` });
    } catch (err) {
      showToast({ tone: 'warn', title: 'Club à recharger', body: err.message });
    }
    onNavigate('home');
  };

  return (
    <div>
      <ClubHead name={name} role={club.role} onStats={() => onNavigate('stats')} />
      {!online && (
        <Notice tone="info" title="Hors ligne">Dernières informations connues. Modifications, membres et invitations demandent le réseau.</Notice>
      )}
      {club.error && online && !club.info && (
        <Alert tone="warn" title="Club indisponible">{describeApiError(club.error, 'consulter le club')}</Alert>
      )}
      <ClubCounts counts={club.info?.counts} />
      {clubs && clubs.length > 1 && (
        <ClubSwitcherCard clubs={clubs} online={online} currentName={name} onSwitch={onSwitch} />
      )}
      {club.club && (
        <ClubInfoCard key={club.club.id} club={club.club} canManage={canManage} online={online} onSaved={onSaved} />
      )}
      {m.error && <Alert tone="warn">{describeApiError(m.error, 'voir les membres')}</Alert>}
      <ClubMembersCard members={m.members} loading={m.loading} canManage={canManage} online={online}
        setMembers={m.setMembers} onChanged={club.refresh} />
      {canManage && <ClubInvitationsCard invitations={m.invitations} setInvitations={m.setInvitations} online={online} />}
      {!canManage && (
        <p className="disclaimer"><StatusIcon tone="info" /> Pour inviter quelqu'un ou changer un rôle, adressez-vous au responsable du club.</p>
      )}
      <ClubDangerZone clubName={name} myUserId={me?.user_id ?? null} canManage={canManage} online={online} onLeft={onLeft} />
    </div>
  );
}
