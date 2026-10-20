// DP Assistant — Informations du club (en-tête de la fiche de sécurité) :
// modifiables par le responsable seulement, lecture pour les autres rôles.

import React, { useState } from 'react';
import { Alert, Field, Opt } from '../../components/components.jsx';
import { STRUCTURE_LABELS } from '../../domain/index.js';
import { api } from '../../api/api.js';
import { describeApiError } from '../../club/permissions.js';

const STRUCTURE_TYPES = Object.entries(STRUCTURE_LABELS).map(([value, label]) => ({ value, label }));
const FIELDS = [
  'nom',
  'numero_ffessm',
  'siret',
  'structure_type',
  'president_prenom',
  'president_nom',
  'president_tel',
  'urgence_defaut',
];

function toForm(club) {
  return Object.fromEntries(FIELDS.map((k) => [k, club?.[k] || '']));
}

// Champs modifiés uniquement (PATCH partiel).
function changedFields(form, club) {
  return Object.fromEntries(FIELDS.filter((k) => (form[k] || '') !== (club?.[k] || '')).map((k) => [k, form[k]]));
}

function TextField({ label, value, onChange, hint, placeholder, type = 'text', inputMode, autoComplete, maxLength }) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function ReadOnlyInfo({ club }) {
  const president = [club?.president_prenom, club?.president_nom].filter(Boolean).join(' ');
  const rows = [
    ['Nom', club?.nom],
    ['Type de structure', STRUCTURE_LABELS[club?.structure_type] || club?.structure_type],
    ['Numéro FFESSM', club?.numero_ffessm],
    ['SIRET', club?.siret],
    ['Président', [president, club?.president_tel].filter(Boolean).join(', ')],
    ["Numéro d'urgence par défaut", club?.urgence_defaut],
  ];
  return (
    <div className="kv-rows">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="k">{k}</span>
          <span className="v">{v || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function InfoForm({ form, set }) {
  return (
    <>
      <Field label="Type de structure" labelOnly>
        {({ labelId }) => (
          <div className="opt-group opt-wide" role="radiogroup" aria-labelledby={labelId}>
            {STRUCTURE_TYPES.map((t) => (
              <Opt
                key={t.value}
                label={t.label}
                checked={form.structure_type === t.value}
                onClick={() => set('structure_type')(t.value)}
              />
            ))}
          </div>
        )}
      </Field>
      <TextField
        label="Nom du club ou de la structure"
        value={form.nom}
        onChange={set('nom')}
        maxLength={200}
        placeholder="Club de plongée de…"
        autoComplete="organization"
      />
      <div className="grid-2">
        <TextField
          label="Numéro de club FFESSM"
          value={form.numero_ffessm}
          onChange={set('numero_ffessm')}
          maxLength={50}
          placeholder="06123456"
        />
        <TextField
          label="SIRET ou numéro d'entreprise"
          value={form.siret}
          onChange={set('siret')}
          maxLength={50}
          inputMode="numeric"
        />
      </div>
      {form.structure_type === 'club' && (
        <div className="grid-2">
          <TextField
            label="Prénom du président"
            value={form.president_prenom}
            onChange={set('president_prenom')}
            maxLength={100}
          />
          <TextField
            label="Nom du président"
            value={form.president_nom}
            onChange={set('president_nom')}
            maxLength={100}
          />
        </div>
      )}
      {form.structure_type === 'club' && (
        <TextField
          label="Téléphone du président"
          type="tel"
          value={form.president_tel}
          onChange={set('president_tel')}
          maxLength={30}
          placeholder="+33 6 12 34 56 78"
        />
      )}
      <TextField
        label="Numéro d'urgence par défaut"
        type="tel"
        inputMode="tel"
        value={form.urgence_defaut}
        onChange={set('urgence_defaut')}
        maxLength={20}
        placeholder="18, 112, 144…"
        hint="Pré-rempli sur la fiche de sécurité ; ajusté selon le pays du site (144 en Suisse, 18 en France)."
      />
    </>
  );
}

export function ClubInfoCard({ club, canManage, online, onSaved }) {
  const [form, setForm] = useState(() => toForm(club));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { tone, text }
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changes = changedFields(form, club);
  const dirty = Object.keys(changes).length > 0;

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await api.club.update(changes);
      await onSaved(res);
      setForm(toForm(res.club));
      setStatus({ tone: 'ok', text: 'Informations du club enregistrées.' });
    } catch (err) {
      setStatus({ tone: 'err', text: describeApiError(err, 'modifier les informations du club') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" aria-labelledby="club-info">
      <div className="card-head">
        <h2 id="club-info">Informations du club</h2>
        <span className="hint">Reprises sur la fiche de sécurité</span>
      </div>
      <div className={canManage ? 'card-body dense' : 'card-body'}>
        {canManage ? <InfoForm form={form} set={set} /> : <ReadOnlyInfo club={club} />}
        {!canManage && <p className="small muted mt-3">Seul le responsable du club peut modifier ces informations.</p>}
        {status && (
          <div role="status">
            <Alert tone={status.tone}>{status.text}</Alert>
          </div>
        )}
        {canManage && (
          <div className="row mt-3 mb-3">
            <button type="button" className="btn primary" onClick={onSave} disabled={!dirty || saving || !online}>
              {saving ? 'Enregistrement…' : 'Enregistrer les informations'}
            </button>
            {!online && <span className="small muted">Connexion requise pour enregistrer.</span>}
          </div>
        )}
      </div>
    </section>
  );
}
