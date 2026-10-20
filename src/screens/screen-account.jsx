// DP Assistant — Mon compte : identité, club courant, données personnelles.
// Les informations du club (ex-champs « Structure » de ce compte) se gèrent
// dans l'écran Club (responsable).

import React, { useState } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { useClub } from '../club/club-context.jsx';
import { Alert, Field, Pill } from '../components/components.jsx';
import { Icon } from '../components/icons.jsx';
import { REGLEMENTATION } from '../domain/index.js';
import { api } from '../api/api.js';
import { roleLabel } from '../club/permissions.js';
import { AccountPrivacy } from './account/account-privacy.jsx';

function TextField({ label, value, onChange, autoComplete }) {
  return (
    <Field label={label}>
      <input className="input" type="text" autoComplete={autoComplete} maxLength={100}
        value={value} onChange={e => onChange(e.target.value)} />
    </Field>
  );
}

function IdentityCard({ user, setUser }) {
  const [form, setForm] = useState({ prenom: user?.prenom || '', nom: user?.nom || '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const onSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      setUser(await api.auth.update({ prenom: form.prenom, nom: form.nom }));
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" aria-labelledby="acc-id">
      <div className="card-head"><h2 id="acc-id">Identité</h2></div>
      <div className="card-body dense">
        <div className="grid-2">
          <TextField label="Prénom" value={form.prenom} onChange={set('prenom')} autoComplete="given-name" />
          <TextField label="Nom" value={form.nom} onChange={set('nom')} autoComplete="family-name" />
        </div>
        {error && <Alert tone="err" title="Enregistrement impossible">{error}</Alert>}
        {saved && <div role="status"><Alert tone="ok">Identité enregistrée.</Alert></div>}
        <div className="row mt-3 mb-3">
          <button type="button" className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ClubCard({ user, onNavigate }) {
  const club = useClub();
  return (
    <section className="card" aria-labelledby="acc-club">
      <div className="card-head"><h2 id="acc-club">Club</h2></div>
      <div className="card-body">
        <div className="row-between">
          <div>
            <b>{club.club?.nom || user?.club_nom || 'Club sans nom'}</b>
            <p className="small muted">Votre rôle : <Pill>{roleLabel(club.role)}</Pill>. Informations du club, membres et invitations : écran Club.</p>
          </div>
          <button type="button" className="btn" onClick={() => onNavigate('club')}><Icon.Flag />Ouvrir l'écran Club</button>
        </div>
      </div>
    </section>
  );
}

function ScreenAccount({ onNavigate }) {
  const { user, setUser } = useAuth();
  return (
    <div>
      <div className="page-head">
        <h1>Mon compte</h1>
        <p>Connecté avec Google : {user?.email}</p>
      </div>
      <IdentityCard user={user} setUser={setUser} />
      <ClubCard user={user} onNavigate={onNavigate} />
      <AccountPrivacy onNavigate={onNavigate} />
      {REGLEMENTATION && (
        <p className="disclaimer">{REGLEMENTATION.label}. {REGLEMENTATION.textes}</p>
      )}
    </div>
  );
}

export { ScreenAccount };
