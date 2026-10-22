// DP Assistant — Popup de saisie rapide de la date de naissance d'un plongeur.
//
// Un seul champ JJ/MM/AAAA, clavier numérique, barres obliques posées au fil
// de la frappe (« 12031990 » suffit), âge affiché en direct, Entrée valide.
// Pas de sélecteur de calendrier : remonter des décennies y est laborieux.

import React, { useId, useState } from 'react';
import { Alert, Pill, diverFullName } from '../../components/components.jsx';
import { Dialog } from '../../components/dialog.jsx';
import { StatusIcon } from '../../components/icons.jsx';
import { maskBirthdate, parseBirthdate } from './birthdate.js';

const MAJORITY = 18;

function Feedback({ parsed, id }) {
  if (parsed.error) {
    return (
      <p className="birthdate-feedback is-err" id={id} aria-live="polite">
        <StatusIcon tone="err" />
        {parsed.error}
      </p>
    );
  }
  if (parsed.iso) {
    const minor = parsed.age < MAJORITY;
    return (
      <p className={`birthdate-feedback ${minor ? 'is-warn' : 'is-ok'}`} id={id} aria-live="polite">
        <StatusIcon tone={minor ? 'warn' : 'ok'} />
        <span className="birthdate-age">{parsed.age} ans</span>
        {minor && <span>mineur : autorisation parentale</span>}
      </p>
    );
  }
  return (
    <p className="birthdate-feedback" id={id} aria-live="polite">
      Tapez les 8 chiffres, ex. 12031990
    </p>
  );
}

/**
 * @param {object} props
 * @param {object} props.diver                    Fiche annuaire sans date de naissance
 * @param {(iso: string) => Promise<void>} props.onSave
 * @param {() => void} props.onClose              « Plus tard » : la popup ne revient pas d'elle-même
 */
export function BirthdateDialog({ diver, onSave, onClose }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const parsed = parseBirthdate(text);
  const level = diver.niveau_encadrant || diver.niveau_plongeur;

  const save = async (e) => {
    e?.preventDefault();
    if (!parsed.iso || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(parsed.iso);
    } catch (err) {
      setError(err?.message || "La date n'a pas pu être enregistrée.");
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Date de naissance manquante"
      size="sm"
      className="birthdate-dialog"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Plus tard
          </button>
          <button type="submit" form={inputId + '-form'} className="btn primary" disabled={!parsed.iso || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="birthdate-who">
        {level && <Pill tone="ink">{level}</Pill>}
        <b>{diverFullName(diver)}</b>
      </div>
      <form id={inputId + '-form'} className="birthdate-form" onSubmit={save} noValidate>
        <label htmlFor={inputId}>Né(e) le</label>
        <input
          id={inputId}
          className="birthdate-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="JJ/MM/AAAA"
          maxLength={10}
          value={text}
          aria-invalid={parsed.error ? true : undefined}
          aria-describedby={feedbackId}
          data-autofocus=""
          onChange={(e) => setText(maskBirthdate(e.target.value))}
        />
        <Feedback parsed={parsed} id={feedbackId} />
      </form>
      <p className="birthdate-why">Elle sert à vérifier l'âge minimal d'autonomie et les mineurs (Code du sport).</p>
      {error && <Alert tone="err">{error}</Alert>}
    </Dialog>
  );
}
