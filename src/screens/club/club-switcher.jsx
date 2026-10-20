// DP Assistant — Mes clubs : changement de club courant (si plusieurs).
// Au changement, les données de l'ancien club sont effacées de l'appareil
// puis celles du nouveau club synchronisées ; les actions en attente restent
// rattachées au club où elles ont été saisies.

import React, { useEffect, useState } from 'react';
import { Alert, Pill } from '../../components/components.jsx';
import { ConfirmDialog } from '../../components/dialog.jsx';
import { StatusIcon } from '../../components/icons.jsx';
import { api } from '../../api/api.js';
import { outbox } from '../../offline/outbox.js';
import { describeApiError, roleLabel } from '../../club/permissions.js';

export function useMemberships(online, currentClubId) {
  const [clubs, setClubs] = useState(null);
  useEffect(() => {
    if (!online) return undefined;
    let cancelled = false;
    api.club.memberships()
      .then(res => { if (!cancelled) setClubs(res?.clubs || []); })
      .catch(err => console.warn('[club] liste des clubs :', err.message));
    return () => { cancelled = true; };
  }, [online, currentClubId]);
  return clubs;
}

function SwitchRow({ c, online, busy, onSwitch }) {
  return (
    <div className="diver-admin-row club-switch-row">
      <div className="info">
        <b>{c.nom || 'Club sans nom'}</b>
        <div className="meta-row">
          <Pill tone={c.role === 'responsable' ? 'ink' : 'default'}>{roleLabel(c.role)}</Pill>
          <span className="muted small"><span className="num">{c.members_count}</span> membre{c.members_count > 1 ? 's' : ''}</span>
          {c.numero_ffessm && <span className="muted small num">{c.numero_ffessm}</span>}
        </div>
      </div>
      <div className="diver-admin-actions">
        {c.current
          ? <span className="current"><StatusIcon tone="ok" />Club courant</span>
          : <button type="button" className="btn" disabled={!online || busy} onClick={onSwitch}>Passer sur ce club</button>}
      </div>
    </div>
  );
}

export function ClubSwitcherCard({ clubs, online, currentName, onSwitch }) {
  const [target, setTarget] = useState(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async (c) => {
    setPending((await outbox.pending()).length);
    setTarget(c);
  };

  const confirm = async () => {
    const c = target;
    setTarget(null); setBusy(true); setError('');
    try {
      await onSwitch(c);
    } catch (err) {
      setError(describeApiError(err, 'changer de club'));
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="club-switch">
      <div className="card-head"><h2 id="club-switch">Mes clubs</h2><span className="hint num">{clubs.length}</span></div>
      {error && <div className="card-body dense"><Alert tone="err">{error}</Alert></div>}
      <div className="card-body flush">
        {clubs.map(c => <SwitchRow key={c.club_id} c={c} online={online} busy={busy} onSwitch={() => ask(c)} />)}
      </div>
      {target && (
        <ConfirmDialog title={`Passer sur ${target.nom || 'ce club'} ?`} confirmLabel="Changer de club"
          onCancel={() => setTarget(null)} onConfirm={confirm}>
          <p>L'annuaire, les sites et les plongées de <b>{currentName}</b> seront retirés de cet appareil,
            puis ceux de <b>{target.nom || 'ce club'}</b> chargés.</p>
          {pending > 0 && (
            <p>{pending} action{pending > 1 ? 's' : ''} en attente d'envoi rester{pending > 1 ? 'ont' : 'a'} rattachée{pending > 1 ? 's' : ''} à {currentName}.</p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
