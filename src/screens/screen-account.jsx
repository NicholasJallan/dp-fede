// DP Assistant — Compte utilisateur : identité, structure, sécurité.

import React, { useState } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { Alert, Field, Opt } from '../components/components.jsx';
import { REGLEMENTATION, STRUCTURE_LABELS } from '../domain/index.js';
import { api } from '../api/api.js';

const STRUCTURE_TYPES = Object.entries(STRUCTURE_LABELS).map(([value, label]) => ({ value, label }));

function initialForm(user) {
  const keys = ['nom', 'prenom', 'club_nom', 'club_numero', 'club_siret', 'structure_type', 'president_prenom', 'president_nom', 'president_tel'];
  return { ...Object.fromEntries(keys.map(k => [k, user?.[k] || ''])), urgence_defaut: user?.urgence_defaut || '18' };
}

function TextField({ label, value, onChange, hint, placeholder, type = 'text', inputMode, autoComplete }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type={type} inputMode={inputMode} autoComplete={autoComplete}
        value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </Field>
  );
}

function ScreenAccount() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(() => initialForm(user));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const onSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      setUser(await api.auth.update(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Mon compte</h1>
        <p>Connecté avec Google : {user?.email}</p>
      </div>

      <section className="card" aria-labelledby="acc-id">
        <div className="card-head"><h2 id="acc-id">Identité</h2></div>
        <div className="card-body dense grid-2">
          <TextField label="Prénom" value={form.prenom} onChange={set('prenom')} autoComplete="given-name" />
          <TextField label="Nom" value={form.nom} onChange={set('nom')} autoComplete="family-name" />
        </div>
      </section>

      <section className="card" aria-labelledby="acc-struct">
        <div className="card-head"><h2 id="acc-struct">Structure</h2></div>
        <div className="card-body dense">
          <Field label="Type de structure" labelOnly>
            {({ labelId }) => (
              <div className="opt-group col-2" role="radiogroup" aria-labelledby={labelId}>
                {STRUCTURE_TYPES.map(t => (
                  <Opt key={t.value} label={t.label} checked={form.structure_type === t.value}
                    onClick={() => set('structure_type')(t.value)} />
                ))}
              </div>
            )}
          </Field>
          <TextField label="Nom du club ou de la structure" value={form.club_nom} onChange={set('club_nom')}
            placeholder="Club de plongée de…" autoComplete="organization" />
          <div className="grid-2">
            <TextField label="Numéro de club FFESSM" value={form.club_numero} onChange={set('club_numero')} placeholder="A-29-001" />
            <TextField label="SIRET ou numéro d'entreprise" value={form.club_siret} onChange={set('club_siret')} inputMode="numeric" />
          </div>
        </div>
      </section>

      {form.structure_type === 'club' && (
        <section className="card" aria-labelledby="acc-pres">
          <div className="card-head"><h2 id="acc-pres">Président du club</h2><span className="hint">Repris sur la fiche de sécurité</span></div>
          <div className="card-body dense">
            <div className="grid-2">
              <TextField label="Prénom" value={form.president_prenom} onChange={set('president_prenom')} />
              <TextField label="Nom" value={form.president_nom} onChange={set('president_nom')} />
            </div>
            <TextField label="Téléphone" type="tel" value={form.president_tel} onChange={set('president_tel')} placeholder="+33 6 12 34 56 78" />
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="acc-secu">
        <div className="card-head"><h2 id="acc-secu">Sécurité</h2></div>
        <div className="card-body dense">
          <TextField label="Numéro d'urgence par défaut" type="tel" inputMode="tel" value={form.urgence_defaut}
            onChange={set('urgence_defaut')} placeholder="18, 112, 144…"
            hint="Pré-rempli sur la fiche de sécurité ; ajusté selon le pays du site (144 en Suisse, 18 en France)." />
        </div>
      </section>

      {error && <Alert tone="err" title="Enregistrement impossible">{error}</Alert>}
      {saved && <div role="status"><Alert tone="ok">Compte enregistré.</Alert></div>}

      <div className="row mt-4">
        <button type="button" className="btn primary lg" onClick={onSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {REGLEMENTATION && (
        <p className="disclaimer">{REGLEMENTATION.label}. {REGLEMENTATION.textes}</p>
      )}
    </div>
  );
}

export { ScreenAccount };
