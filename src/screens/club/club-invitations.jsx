// DP Assistant — Invitations (responsable) : lien à usage unique valable
// 7 jours, à copier et transmettre (aucun e-mail envoyé par le serveur).

import React, { useRef, useState } from 'react';
import { Alert, Pill } from '../../components/components.jsx';
import { ConfirmDialog } from '../../components/dialog.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { CopyButton } from '../../components/copy-button.jsx';
import { formatDate, formatDateTime } from '../../components/format.js';
import { api } from '../../api/api.js';
import { ROLES, describeApiError, roleLabel } from '../../club/permissions.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InviteForm({ online, onCreated }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('dp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) { setError('Saisissez une adresse e-mail valide (celle du compte Google de la personne).'); return; }
    setBusy(true); setError('');
    try {
      onCreated(await api.club.invitations.create({ email: value, role }));
      setEmail('');
    } catch (err) {
      setError(err.status === 409 ? `${err.message}.` : describeApiError(err, 'inviter des membres'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="invite-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="invite-email">E-mail du compte Google invité</label>
        <input id="invite-email" className="input" type="email" autoComplete="off" value={email}
          aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'invite-error' : undefined}
          onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@example.com" />
      </div>
      <div className="field">
        <label htmlFor="invite-role">Rôle</label>
        <select id="invite-role" className="input" value={role} onChange={e => setRole(e.target.value)}>
          {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
      </div>
      <button type="submit" className="btn primary" disabled={busy || !online}>
        <Icon.Link />{busy ? 'Création…' : 'Créer le lien'}
      </button>
      {error && <p id="invite-error" className="field-error" role="alert"><StatusIcon tone="err" />{error}</p>}
    </form>
  );
}

function InviteResult({ invitation, onClose }) {
  const inputRef = useRef(null);
  return (
    <div className="invite-result" aria-live="polite">
      <p className="lead"><StatusIcon tone="ok" />Lien créé pour {invitation.email} ({roleLabel(invitation.role)})</p>
      <div className="invite-link">
        <label className="sr-only" htmlFor="invite-url">Lien d'invitation</label>
        <input id="invite-url" ref={inputRef} className="input" readOnly value={invitation.url}
          onFocus={e => e.target.select()} />
        <CopyButton text={invitation.url} inputRef={inputRef} />
      </div>
      <p className="small">
        Valable jusqu'au <span className="num">{formatDateTime(invitation.expires_at)}</span>, une seule utilisation.
        Ce lien ne sera plus affiché : copiez-le maintenant et transmettez-le à la personne invitée.
        Elle devra se connecter avec le compte Google {invitation.email}.
      </p>
      <div><button type="button" className="btn" onClick={onClose}>Fermer</button></div>
    </div>
  );
}

function PendingRow({ inv, online, onRevoke }) {
  return (
    <div className="diver-admin-row">
      <div className="info">
        <b className="wrap-anywhere">{inv.email}</b>
        <div className="meta-row">
          <Pill>{roleLabel(inv.role)}</Pill>
          <span className="muted small">expire le <span className="num">{formatDate(inv.expires_at)}</span></span>
        </div>
      </div>
      <div className="diver-admin-actions">
        <button type="button" className="btn" disabled={!online} onClick={onRevoke}
          aria-label={`Annuler l'invitation de ${inv.email}`}>Annuler l'invitation</button>
      </div>
    </div>
  );
}

export function ClubInvitationsCard({ invitations, setInvitations, online }) {
  const [created, setCreated] = useState(null);
  const [toRevoke, setToRevoke] = useState(null);
  const [error, setError] = useState('');

  const onCreated = (inv) => {
    setCreated(inv);
    const { token: _t, url: _u, ...pending } = inv;
    setInvitations(prev => [pending, ...prev.filter(i => i.email.toLowerCase() !== inv.email.toLowerCase())]);
  };

  const revoke = async () => {
    const inv = toRevoke;
    setToRevoke(null); setError('');
    try {
      await api.club.invitations.revoke(inv.id);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
    } catch (err) {
      setError(err.status === 404 ? 'Invitation introuvable ou déjà utilisée.' : describeApiError(err, 'annuler une invitation'));
    }
  };

  return (
    <section className="card" aria-labelledby="club-invites">
      <div className="card-head">
        <h2 id="club-invites">Inviter un membre</h2>
        <span className="hint">Lien à usage unique, valable 7 jours</span>
      </div>
      <div className="card-body">
        <InviteForm online={online} onCreated={onCreated} />
        {created && <InviteResult invitation={created} onClose={() => setCreated(null)} />}
        {error && <Alert tone="err">{error}</Alert>}
      </div>
      {invitations.length > 0 && (
        <>
          <div className="card-head"><h3 className="small">Invitations en attente</h3><span className="hint num">{invitations.length}</span></div>
          <div className="card-body flush">
            {invitations.map(inv => <PendingRow key={inv.id} inv={inv} online={online} onRevoke={() => setToRevoke(inv)} />)}
          </div>
        </>
      )}
      {toRevoke && (
        <ConfirmDialog title="Annuler l'invitation ?" danger confirmLabel="Annuler l'invitation" cancelLabel="Garder"
          onCancel={() => setToRevoke(null)} onConfirm={revoke}>
          <p>Le lien envoyé à <b>{toRevoke.email}</b> ne fonctionnera plus.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
