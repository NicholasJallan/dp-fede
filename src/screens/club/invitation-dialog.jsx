// DP Assistant — Acceptation d'une invitation (lien #invitation=…), après
// connexion Google : aperçu du club, contrôle de l'e-mail, puis Accepter.

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth-context.jsx';
import { useClub } from '../../club/club-context.jsx';
import { useOnline } from '../../offline/use-online.jsx';
import { useToasts } from '../../components/toast.jsx';
import { Alert } from '../../components/components.jsx';
import { Dialog } from '../../components/dialog.jsx';
import { formatDateTime } from '../../components/format.js';
import { api } from '../../api/api.js';
import { roleLabel } from '../../club/permissions.js';

const STATUS_TEXT = {
  accepted: 'Cette invitation a déjà été utilisée.',
  revoked: 'Cette invitation a été annulée par le responsable du club.',
  expired: 'Cette invitation a expiré (validité 7 jours).',
};

// Message d'erreur de l'aperçu ou de l'acceptation.
export function invitationErrorText(err, userEmail) {
  if (err?.status === 404) return 'Lien d\'invitation inconnu : vérifiez qu\'il a été copié en entier, ou demandez-en un nouveau.';
  if (err?.status === 403) return `Cette invitation est destinée à une autre adresse e-mail que ${userEmail || 'celle de votre compte'}. Connectez-vous avec le compte Google invité.`;
  if (err?.status === 410) return `${err.message}. Demandez un nouveau lien au responsable du club.`;
  if (err?.status === 429) return `${err.message}. Réessayez dans un quart d'heure.`;
  if (!err?.status) return 'Connexion requise pour lire l\'invitation. Le lien reste mémorisé : réessayez une fois en ligne.';
  return err.message;
}

function PreviewFacts({ p }) {
  return (
    <dl className="kv-list">
      <div><dt>Club</dt><dd>{p.club_nom || '—'}</dd></div>
      <div><dt>Rôle proposé</dt><dd>{roleLabel(p.role)}</dd></div>
      <div><dt>Invitation adressée à</dt><dd className="wrap-anywhere">{p.email}</dd></div>
      <div><dt>Valable jusqu'au</dt><dd className="num">{formatDateTime(p.expires_at)}</dd></div>
    </dl>
  );
}

function PreviewNotes({ p, userEmail }) {
  return (<>
    {!p.email_matches && (
      <Alert tone="err" title="Adresse e-mail différente">
        Vous êtes connecté avec {userEmail}. Cette invitation ne peut être acceptée qu'avec le compte Google {p.email}.
      </Alert>
    )}
    {p.status && p.status !== 'pending' && <Alert tone="warn">{STATUS_TEXT[p.status] || p.status}</Alert>}
    {p.already_member && (
      <Alert tone="info">Vous êtes déjà membre de ce club : accepter en fera votre club courant, votre rôle actuel est conservé.</Alert>
    )}
  </>);
}

export function InvitationDialog({ onAccepted }) {
  const { user, logout } = useAuth();
  const club = useClub();
  const online = useOnline();
  const { showToast } = useToasts();
  const token = club.invitationToken;
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!online || !token) return undefined;
    let cancelled = false;
    setError('');
    api.club.invitations.preview(token)
      .then(p => { if (!cancelled) setPreview(p); })
      .catch(err => { if (!cancelled) setError(invitationErrorText(err, user?.email)); });
    return () => { cancelled = true; };
  }, [token, online, user?.email]);

  const accept = async () => {
    setBusy(true); setError('');
    try {
      const res = await club.acceptInvitation(token);
      showToast({ tone: 'ok', title: 'Bienvenue', body: `Vous avez rejoint ${res?.club?.nom || preview?.club_nom || 'le club'}.` });
      onAccepted();
    } catch (err) {
      setError(invitationErrorText(err, user?.email));
      setBusy(false);
    }
  };

  const mismatch = preview && !preview.email_matches;
  const usable = preview && preview.email_matches && (!preview.status || preview.status === 'pending');
  const title = preview ? `Rejoindre ${preview.club_nom || 'le club'} ?` : 'Invitation à rejoindre un club';

  return (
    <Dialog title={title} onClose={club.dismissInvitation} size="sm" icon={mismatch ? 'err' : 'info'}
      footer={<>
        <button type="button" className="btn" onClick={club.dismissInvitation}>Ignorer l'invitation</button>
        {mismatch && <button type="button" className="btn" onClick={() => logout({ keepLocal: true })}>Changer de compte Google</button>}
        {usable && (
          <button type="button" className="btn primary" onClick={accept} disabled={busy} data-autofocus="">
            {busy ? 'Adhésion…' : `Rejoindre en tant que ${roleLabel(preview.role)}`}
          </button>
        )}
      </>}>
      {!preview && !error && <p role="status">{online ? 'Lecture de l\'invitation…' : 'Hors ligne : l\'invitation sera lue au retour du réseau.'}</p>}
      {preview && <PreviewFacts p={preview} />}
      {preview && <PreviewNotes p={preview} userEmail={user?.email} />}
      {usable && <p>Le club deviendra votre club courant : son annuaire, ses sites et ses plongées remplaceront ceux affichés sur cet appareil.</p>}
      {error && <Alert tone="err">{error}</Alert>}
    </Dialog>
  );
}
