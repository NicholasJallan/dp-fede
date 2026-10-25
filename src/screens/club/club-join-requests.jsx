// DP Assistant — Demandes d'adhésion reçues (responsable) : accepter en
// choisissant le rôle, ou refuser. Le demandeur voit la décision dans son
// écran Club ; s'il n'avait qu'un club personnel vide, il bascule sur ce club.

import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from '../../components/components.jsx';
import { ConfirmDialog } from '../../components/dialog.jsx';
import { formatDate } from '../../components/format.js';
import { api } from '../../api/api.js';
import { ROLES, describeApiError, roleLabel } from '../../club/permissions.js';
import { requesterName } from '../../club/directory.js';

const DEFAULT_ROLE = 'lecture';

export function useJoinRequests(enabled, clubId) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await api.club.joinRequests.list();
      setRequests(res?.requests || []);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);
  useEffect(() => {
    if (enabled) load();
    else setRequests([]);
  }, [enabled, clubId, load]);
  return { requests, setRequests, error };
}

function RequestRow({ r, online, busy, onAccept, onRefuse }) {
  const [role, setRole] = useState(DEFAULT_ROLE);
  const name = requesterName(r);
  return (
    <div className="diver-admin-row">
      <div className="info">
        <b>{name}</b>
        <div className="meta-row">
          {r.email && <span className="muted small wrap-anywhere">{r.email}</span>}
          <span className="muted small">
            le <span className="num">{formatDate(r.created_at)}</span>
          </span>
        </div>
        {r.message && <p className="small mt-1">« {r.message} »</p>}
      </div>
      <div className="diver-admin-actions member-role">
        <label className="sr-only" htmlFor={`join-role-${r.id}`}>
          Rôle de {name}
        </label>
        <select
          id={`join-role-${r.id}`}
          className="input"
          value={role}
          disabled={!online || busy}
          onChange={(e) => setRole(e.target.value)}
        >
          {ROLES.map((x) => (
            <option key={x} value={x}>
              {roleLabel(x)}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" disabled={!online || busy} onClick={() => onAccept(role)}>
          Accepter
        </button>
        <button type="button" className="btn" disabled={!online || busy} onClick={onRefuse}>
          Refuser
        </button>
      </div>
    </div>
  );
}

export function ClubJoinRequestsCard({ requests, setRequests, online, onAccepted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toRefuse, setToRefuse] = useState(null);

  const decide = async (r, action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      return true;
    } catch (err) {
      if (err.status === 404) setRequests((prev) => prev.filter((x) => x.id !== r.id));
      setError(
        err.status === 404
          ? 'Cette demande a déjà été traitée ou retirée.'
          : describeApiError(err, 'traiter les demandes d’adhésion'),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const accept = async (r, role) => {
    if (await decide(r, () => api.club.joinRequests.accept(r.id, role))) onAccepted?.();
  };

  const refuse = async () => {
    const r = toRefuse;
    setToRefuse(null);
    await decide(r, () => api.club.joinRequests.refuse(r.id));
  };

  if (requests.length === 0) return null;
  return (
    <section className="card" aria-labelledby="club-join-requests">
      <div className="card-head">
        <h2 id="club-join-requests">Demandes d'adhésion</h2>
        <span className="hint num">{requests.length}</span>
      </div>
      {error && (
        <div className="card-body dense">
          <Alert tone="err">{error}</Alert>
        </div>
      )}
      <div className="card-body flush">
        {requests.map((r) => (
          <RequestRow
            key={r.id}
            r={r}
            online={online}
            busy={busy}
            onAccept={(role) => accept(r, role)}
            onRefuse={() => setToRefuse(r)}
          />
        ))}
      </div>
      {toRefuse && (
        <ConfirmDialog
          title="Refuser la demande ?"
          danger
          confirmLabel="Refuser"
          cancelLabel="Garder"
          onCancel={() => setToRefuse(null)}
          onConfirm={refuse}
        >
          <p>
            <b>{requesterName(toRefuse)}</b> ne rejoindra pas le club. Cette personne pourra renvoyer une demande.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
