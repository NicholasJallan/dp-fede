// DP Assistant — Créer un club : le créateur en devient responsable et le
// nouveau club devient le club courant. Nom, numéro de club et SIRET /
// N° TAHITI sont uniques (refus serveur 409 CLUB_*_TAKEN, pré-contrôle sur
// l'annuaire déjà chargé).

import React, { useState } from 'react';
import { Alert, Field, Opt } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { DEFAULT_JURISDICTION, JURISDICTION_LABELS, JURISDICTIONS, structureLabels } from '../../domain/index.js';
import { describeApiError } from '../../club/permissions.js';
import { conflictField, newClubPayload, validateNewClub } from '../../club/directory.js';

const EMPTY = { jurisdiction: DEFAULT_JURISDICTION, structure_type: '', nom: '', numero_ffessm: '', siret: '' };

function FieldError({ id, text }) {
  if (!text) return null;
  return (
    <p id={id} className="field-error" role="alert">
      <StatusIcon tone="err" />
      {text}
    </p>
  );
}

function TextInput({ id, label, value, onChange, error, ...rest }) {
  return (
    <Field label={label} id={id}>
      <>
        <input
          id={id}
          className="input"
          value={value}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        <FieldError id={`${id}-error`} text={error} />
      </>
    </Field>
  );
}

function ChoiceGroup({ label, options, value, onChange, error }) {
  return (
    <Field label={label} labelOnly>
      {({ labelId }) => (
        <>
          <div className="opt-group opt-wide" role="radiogroup" aria-labelledby={labelId}>
            {options.map((o) => (
              <Opt key={o.value} label={o.label} checked={value === o.value} onClick={() => onChange(o.value)} />
            ))}
          </div>
          <FieldError text={error} />
        </>
      )}
    </Field>
  );
}

function CreateForm({ directory, online, onCreate, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const isPf = form.jurisdiction === 'PF';
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === 'jurisdiction' ? { structure_type: '' } : {}) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const types = Object.entries(structureLabels(form.jurisdiction)).map(([value, label]) => ({ value, label }));

  const submit = async (e) => {
    e.preventDefault();
    const found = validateNewClub(form, directory.clubs || []);
    setErrors(found);
    setFailure('');
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await onCreate(newClubPayload(form));
    } catch (err) {
      const field = conflictField(err);
      if (field) setErrors({ [field]: `${err.message}.` });
      else setFailure(describeApiError(err, 'créer un club'));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <ChoiceGroup
        label="Réglementation applicable"
        options={JURISDICTIONS.map((j) => ({ value: j, label: JURISDICTION_LABELS[j] }))}
        value={form.jurisdiction}
        onChange={set('jurisdiction')}
      />
      <ChoiceGroup
        label="Type de structure"
        options={types}
        value={form.structure_type}
        onChange={set('structure_type')}
        error={errors.structure_type}
      />
      <TextInput
        id="new-club-nom"
        label="Nom du club ou de la structure"
        value={form.nom}
        onChange={set('nom')}
        error={errors.nom}
        maxLength={200}
        autoComplete="organization"
        placeholder="Club de plongée de…"
      />
      <div className="grid-2">
        <TextInput
          id="new-club-numero"
          label={isPf ? 'Numéro de club (FFESSM / FPESSM)' : 'Numéro de club FFESSM ou agrément SCA'}
          value={form.numero_ffessm}
          onChange={set('numero_ffessm')}
          error={errors.numero_ffessm}
          maxLength={50}
        />
        <TextInput
          id="new-club-siret"
          label={isPf ? 'N° TAHITI' : 'SIRET'}
          value={form.siret}
          onChange={set('siret')}
          error={errors.siret}
          maxLength={50}
          inputMode={isPf ? undefined : 'numeric'}
        />
      </div>
      <p className="small muted">
        Le nom, le numéro de club et le {isPf ? 'N° TAHITI' : 'SIRET'} ne peuvent appartenir qu'à un seul club. Vous
        compléterez les autres informations (président, numéro d'urgence) dans la fiche du club.
      </p>
      {failure && <Alert tone="err">{failure}</Alert>}
      <div className="row mt-3 mb-3">
        <button type="submit" className="btn primary" disabled={busy || !online}>
          {busy ? 'Création…' : 'Créer le club'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      </div>
    </form>
  );
}

export function ClubCreateCard({ directory, online, onCreate }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card" aria-labelledby="club-create">
      <div className="card-head">
        <h2 id="club-create">Créer un club</h2>
        <span className="hint">Vous en serez responsable</span>
      </div>
      <div className={open ? 'card-body dense' : 'card-body'}>
        {open ? (
          <CreateForm
            directory={directory}
            online={online}
            onCreate={async (fields) => {
              await onCreate(fields);
              // Carte toujours montée (compte déjà rattaché) : formulaire refermé et vidé.
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <div className="row">
            <p className="small">Votre club n'est pas encore dans l'annuaire ? Créez-le, puis invitez ses membres.</p>
            <button type="button" className="btn" disabled={!online} onClick={() => setOpen(true)}>
              <Icon.Plus />
              Créer un nouveau club
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
