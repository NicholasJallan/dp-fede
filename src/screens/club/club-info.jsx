// DP Assistant — Informations du club (en-tête de la fiche de sécurité) :
// modifiables par le responsable seulement, lecture pour les autres rôles.

import React, { useState } from 'react';
import { Alert, Field, Opt } from '../../components/components.jsx';
import {
  DEFAULT_JURISDICTION,
  JURISDICTION_LABELS,
  JURISDICTIONS,
  rulesFor,
  structureLabel,
  structureLabels,
} from '../../domain/index.js';
import { api } from '../../api/api.js';
import { describeApiError } from '../../club/permissions.js';

const FIELDS = [
  'jurisdiction',
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
  const form = Object.fromEntries(FIELDS.map((k) => [k, club?.[k] || '']));
  return { ...form, jurisdiction: form.jurisdiction || DEFAULT_JURISDICTION };
}

// Types proposés pour la juridiction ; la valeur enregistrée reste affichée
// même si elle n'y figure pas (ex. moniteur patenté repassé en France).
function structureTypes(jurisdiction, current) {
  const types = Object.entries(structureLabels(jurisdiction)).map(([value, label]) => ({ value, label }));
  return !current || types.some((t) => t.value === current)
    ? types
    : [...types, { value: current, label: structureLabel(current, jurisdiction) }];
}

// Règles d'une juridiction pas encore transcrite : l'app applique celles d'une autre.
function JurisdictionNote({ jurisdiction }) {
  const applied = rulesFor(jurisdiction).jurisdiction;
  if (applied === jurisdiction) return null;
  return (
    <Alert tone="info">
      Règles de la Polynésie française en cours d'intégration : les contrôles du Code du sport sont appliqués en
      attendant.
    </Alert>
  );
}

// Champs modifiés uniquement (PATCH partiel).
// Comparaison avec le club normalisé : un club sans juridiction (cache
// antérieur à la migration 012) vaut 'FR' et ne rend pas le formulaire modifié.
function changedFields(form, club) {
  const saved = toForm(club);
  return Object.fromEntries(FIELDS.filter((k) => (form[k] || '') !== (saved[k] || '')).map((k) => [k, form[k]]));
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
  const isPf = club?.jurisdiction === 'PF';
  const president = [club?.president_prenom, club?.president_nom].filter(Boolean).join(' ');
  const rows = [
    ['Réglementation', JURISDICTION_LABELS[club?.jurisdiction || DEFAULT_JURISDICTION]],
    ['Nom', club?.nom],
    ['Type de structure', structureLabel(club?.structure_type, club?.jurisdiction)],
    [isPf ? 'Numéro de club' : 'Numéro FFESSM', club?.numero_ffessm],
    [isPf ? 'N° TAHITI' : 'SIRET', club?.siret],
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
  const isPf = form.jurisdiction === 'PF';
  return (
    <>
      <Field
        label="Réglementation applicable"
        labelOnly
        hint="Appliquée par défaut ; une plongée suit la réglementation du pays de son site."
      >
        {({ labelId }) => (
          <div className="opt-group opt-wide" role="radiogroup" aria-labelledby={labelId}>
            {JURISDICTIONS.map((j) => (
              <Opt
                key={j}
                label={JURISDICTION_LABELS[j]}
                checked={form.jurisdiction === j}
                onClick={() => set('jurisdiction')(j)}
              />
            ))}
          </div>
        )}
      </Field>
      <JurisdictionNote jurisdiction={form.jurisdiction} />
      <Field label="Type de structure" labelOnly>
        {({ labelId }) => (
          <div className="opt-group opt-wide" role="radiogroup" aria-labelledby={labelId}>
            {structureTypes(form.jurisdiction, form.structure_type).map((t) => (
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
          label={isPf ? 'Numéro de club (FFESSM / FPESSM)' : 'Numéro de club FFESSM'}
          value={form.numero_ffessm}
          onChange={set('numero_ffessm')}
          maxLength={50}
          placeholder={isPf ? '' : '06123456'}
        />
        <TextField
          label={isPf ? "N° TAHITI ou numéro d'entreprise" : "SIRET ou numéro d'entreprise"}
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
          placeholder={isPf ? '+689 87 12 34 56' : '+33 6 12 34 56 78'}
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
