// DP Assistant — Rejoindre un club : annuaire des clubs (recherche), demande
// d'adhésion avec message facultatif, suivi de mes demandes. Le responsable
// du club accepte ou refuse (club-join-requests.jsx).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dialog, Pill } from '../../components/components.jsx';
import { StatusIcon } from '../../components/icons.jsx';
import { formatDate } from '../../components/format.js';
import { api } from '../../api/api.js';
import { structureLabel } from '../../domain/index.js';
import { describeApiError, roleLabel } from '../../club/permissions.js';
import { JOIN_STATUS_LABELS, filterClubs, joinStatusTone, membershipState } from '../../club/directory.js';

const MESSAGE_MAX = 500;
const MAX_SHOWN = 30;

/** Annuaire et mes demandes, rechargés ensemble après chaque action. */
export function useClubDirectory(online, currentClubId) {
  const [clubs, setClubs] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const [dir, mine] = await Promise.all([api.clubs.search(), api.clubs.myRequests()]);
      setClubs(dir?.clubs || []);
      setRequests(mine?.requests || []);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);
  useEffect(() => {
    if (online) load();
  }, [online, currentClubId, load]);
  return { clubs, requests, error, reload: load };
}

function ClubRowAction({ c, online, busy, onAsk, onCancel }) {
  const state = membershipState(c);
  if (state === 'member') {
    return (
      <span className="current">
        <StatusIcon tone="ok" />
        Déjà membre
      </span>
    );
  }
  if (state === 'pending') {
    return (
      <>
        <Pill tone="warn">Demande envoyée</Pill>
        <button type="button" className="btn" disabled={!online || busy} onClick={onCancel}>
          Retirer
        </button>
      </>
    );
  }
  return (
    <button type="button" className="btn primary" disabled={!online || busy} onClick={onAsk}>
      Demander à rejoindre
    </button>
  );
}

function ClubRow({ c, ...actions }) {
  const kind = structureLabel(c.structure_type, c.jurisdiction);
  return (
    <div className="diver-admin-row club-switch-row">
      <div className="info">
        <b>{c.nom}</b>
        <div className="meta-row">
          {kind && <span className="muted small">{kind}</span>}
          {c.numero_ffessm && <span className="muted small num">{c.numero_ffessm}</span>}
          <span className="muted small">
            <span className="num">{c.members_count}</span> membre{c.members_count > 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="diver-admin-actions">
        <ClubRowAction c={c} {...actions} />
      </div>
    </div>
  );
}

function RequestDialog({ club, onCancel, onSend }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await onSend(message.trim());
    } catch (err) {
      setError(err.status === 409 ? `${err.message}.` : describeApiError(err, 'demander à rejoindre ce club'));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Rejoindre ${club.nom} ?`}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn primary" onClick={send} disabled={busy} data-autofocus="">
            {busy ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </>
      }
    >
      <p>
        Le responsable du club verra votre nom et votre adresse e-mail, puis choisira votre rôle (DP, encadrant,
        lecture…).
      </p>
      <label className="small" htmlFor="join-message">
        Message pour le responsable (facultatif)
      </label>
      <textarea
        id="join-message"
        className="textarea"
        rows={3}
        maxLength={MESSAGE_MAX}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ex. : DP N5 au club depuis 2021"
      />
      {error && <Alert tone="err">{error}</Alert>}
    </Dialog>
  );
}

function MyRequests({ requests }) {
  const decided = requests.filter((r) => r.status !== 'pending');
  if (decided.length === 0) return null;
  return (
    <>
      <div className="card-head">
        <h3 className="small">Mes demandes traitées</h3>
        <span className="hint">30 derniers jours</span>
      </div>
      <div className="card-body flush">
        {decided.map((r) => (
          <div key={r.id} className="diver-admin-row">
            <div className="info">
              <b>{r.club_nom}</b>
              <div className="meta-row">
                <Pill tone={joinStatusTone(r.status)}>{JOIN_STATUS_LABELS[r.status] || r.status}</Pill>
                {r.status === 'accepted' && r.role && <span className="muted small">{roleLabel(r.role)}</span>}
                {r.decided_at && (
                  <span className="muted small">
                    le <span className="num">{formatDate(r.decided_at)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function ClubJoinCard({ directory, online }) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { tone, text }
  const { clubs, requests, error, reload } = directory;
  const found = useMemo(() => filterClubs(clubs || [], query), [clubs, query]);

  const send = async (message) => {
    const c = target;
    await api.clubs.requestJoin(c.club_id, message);
    setTarget(null);
    setStatus({
      tone: 'ok',
      text: `Demande envoyée à ${c.nom}. Le club apparaîtra dans « Mes clubs » dès son acceptation.`,
    });
    await reload();
  };

  const cancel = async (c) => {
    setBusy(true);
    setStatus(null);
    try {
      await api.clubs.cancelRequest(c.pending_request_id);
      await reload();
    } catch (err) {
      setStatus({ tone: 'err', text: describeApiError(err, 'retirer cette demande') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="club-join">
      <div className="card-head">
        <h2 id="club-join">Rejoindre un club</h2>
        <span className="hint">Sur acceptation du responsable</span>
      </div>
      <div className="card-body">
        {!online && <p className="small muted">Connexion requise pour consulter l'annuaire des clubs.</p>}
        {error && online && <Alert tone="warn">{describeApiError(error, "consulter l'annuaire des clubs")}</Alert>}
        {status && (
          <div role="status">
            <Alert tone={status.tone}>{status.text}</Alert>
          </div>
        )}
        {clubs && (
          <div className="toolbar">
            <label className="sr-only" htmlFor="club-search">
              Rechercher un club
            </label>
            <input
              id="club-search"
              className="input"
              type="search"
              placeholder="Nom du club ou numéro FFESSM"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        {clubs && found.length === 0 && (
          <p className="small muted">
            {query
              ? "Aucun club ne correspond : vérifiez l'orthographe, ou créez-le ci-dessous."
              : 'Aucun club pour le moment.'}
          </p>
        )}
      </div>
      {found.length > 0 && (
        <div className="card-body flush">
          {found.slice(0, MAX_SHOWN).map((c) => (
            <ClubRow
              key={c.club_id}
              c={c}
              online={online}
              busy={busy}
              onAsk={() => setTarget(c)}
              onCancel={() => cancel(c)}
            />
          ))}
          {found.length > MAX_SHOWN && (
            <p className="small muted empty">{found.length - MAX_SHOWN} autres clubs : précisez la recherche.</p>
          )}
        </div>
      )}
      <MyRequests requests={requests} />
      {target && <RequestDialog club={target} onCancel={() => setTarget(null)} onSend={send} />}
    </section>
  );
}
