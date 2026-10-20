// DP Assistant — Membres du club et rôles. Le responsable change les rôles
// et retire des membres ; les autres rôles consultent.

import React, { useState } from 'react';
import { Alert, Pill } from '../../components/components.jsx';
import { ConfirmDialog } from '../../components/dialog.jsx';
import { Icon } from '../../components/icons.jsx';
import { formatDate } from '../../components/format.js';
import { DiveListSkeleton } from '../home-parts.jsx';
import { api } from '../../api/api.js';
import { ROLES, ROLE_HINTS, describeApiError, roleLabel } from '../../club/permissions.js';

export function memberName(m) {
  const name = [m.prenom, m.nom].filter(Boolean).join(' ');
  return name || m.email || `Membre ${m.user_id}`;
}

function RoleSelect({ member, disabled, onChange }) {
  return (
    <div className="member-role">
      <label className="sr-only" htmlFor={`role-${member.user_id}`}>Rôle de {memberName(member)}</label>
      <select id={`role-${member.user_id}`} className="input" value={member.role} disabled={disabled}
        onChange={e => onChange(e.target.value)}>
        {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
      </select>
    </div>
  );
}

function MemberRow({ m, canManage, online, busy, onRole, onRemove }) {
  return (
    <div className="diver-admin-row">
      <div className="info">
        <b>{memberName(m)}{m.is_me && <Pill tone="ink">Moi</Pill>}</b>
        <div className="meta-row">
          {!canManage && <Pill tone={m.role === 'responsable' ? 'ink' : 'default'}>{roleLabel(m.role)}</Pill>}
          {m.email && <span className="muted small wrap-anywhere">{m.email}</span>}
        </div>
        <span className="muted small">
          Membre depuis le {formatDate(m.joined_at)}
          {canManage && m.last_seen_at ? `, dernière activité le ${formatDate(m.last_seen_at)}` : ''}
        </span>
      </div>
      {canManage && (
        <div className="diver-admin-actions">
          <RoleSelect member={m} disabled={busy || !online} onChange={onRole} />
          {!m.is_me && (
            <button type="button" className="btn danger icon" disabled={busy || !online}
              aria-label={`Retirer ${memberName(m)} du club`} title="Retirer du club" onClick={onRemove}>
              <Icon.Trash />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ClubMembersCard({ members, loading, canManage, online, setMembers, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [toRemove, setToRemove] = useState(null);

  const changeRole = async (m, role) => {
    setBusyId(m.user_id); setError('');
    try {
      await api.club.setRole(m.user_id, role);
      setMembers(prev => prev.map(x => (x.user_id === m.user_id ? { ...x, role } : x)));
      if (m.is_me) await onChanged();
    } catch (err) {
      setError(err.status === 409
        ? `${err.message}. Nommez d'abord un autre responsable.`
        : describeApiError(err, 'changer les rôles'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    const m = toRemove;
    setToRemove(null); setBusyId(m.user_id); setError('');
    try {
      await api.club.removeMember(m.user_id);
      setMembers(prev => prev.filter(x => x.user_id !== m.user_id));
    } catch (err) {
      setError(describeApiError(err, 'retirer un membre'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card" aria-labelledby="club-members">
      <div className="card-head">
        <h2 id="club-members">Membres</h2>
        {!loading && <span className="hint num">{members.length}</span>}
      </div>
      {canManage && (
        <div className="card-body dense">
          <ul className="small muted mt-3 mb-3">
            {ROLES.map(r => <li key={r}><b>{roleLabel(r)}</b> : {ROLE_HINTS[r]}</li>)}
          </ul>
        </div>
      )}
      {error && <div className="card-body dense"><Alert tone="err">{error}</Alert></div>}
      <div className="card-body flush">
        {loading && <DiveListSkeleton rows={2} />}
        {members.map(m => (
          <MemberRow key={m.user_id} m={m} canManage={canManage} online={online} busy={busyId === m.user_id}
            onRole={(role) => changeRole(m, role)} onRemove={() => setToRemove(m)} />
        ))}
      </div>
      {toRemove && (
        <ConfirmDialog title={`Retirer ${memberName(toRemove)} du club ?`} danger confirmLabel="Retirer du club"
          onCancel={() => setToRemove(null)} onConfirm={remove}>
          <p>Il n'aura plus accès aux plongées, à l'annuaire ni aux sites du club. Ce qu'il a saisi reste au club.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
