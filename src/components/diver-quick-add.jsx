// DP Assistant — Création rapide d'un plongeur (profil, palanquées).
import React, { useState } from 'react';
import { Alert } from './ui.jsx';
import { Dialog } from './dialog.jsx';
import { api } from '../api/api.js';
import { emptyDiver, formToPayload } from './diver-payload.js';

import { BaptemeFields, DiverFormFields, useDiverForm } from './diver-form.jsx';
import { validateDiverForm } from './diver-form-rules.js';

export function DiverQuickAdd({ onCreated, onClose, initialName = '', allowBapteme = false, baptemeOnSave = null }) {
  const parts = initialName.trim().split(/\s+/);
  const f = useDiverForm({
    ...emptyDiver(),
    prenom: parts.length > 1 ? parts[0] : initialName,
    nom: parts.length > 1 ? parts.slice(1).join(' ') : '',
  });
  const { form, setField } = f;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [isBapteme, setIsBapteme] = useState(false);

  const onSave = async () => {
    const problem = isBapteme
      ? !form.prenom.trim() && !form.nom.trim()
        ? 'Saisissez au moins le prénom ou le nom du baptisé.'
        : ''
      : validateDiverForm(form);
    if (problem) {
      setErr(problem);
      return;
    }
    setErr('');
    setSaving(true);
    try {
      if (isBapteme && baptemeOnSave) {
        // Baptême : objet local, jamais ajouté à l'annuaire.
        baptemeOnSave({
          id: `bap-${Math.random().toString(36).slice(2, 9)}`,
          nom: form.nom || '?',
          prenom: form.prenom || '',
          niveau_plongeur: null,
          niveau_encadrant: null,
          aptitudes_sup: [],
          nitrox: [],
          trimix: [],
          recycleurs: [],
          medical: null,
          _bapteme: true,
        });
      } else {
        onCreated(await api.divers.create(formToPayload(form)));
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={isBapteme ? 'Ajouter un baptême' : 'Nouveau plongeur'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : isBapteme ? 'Ajouter le baptême' : 'Créer le plongeur'}
          </button>
        </>
      }
    >
      {err && <Alert tone="err">{err}</Alert>}
      {allowBapteme && (
        <label className={`qualif-toggle ${isBapteme ? 'on' : ''}`}>
          <input type="checkbox" checked={isBapteme} onChange={() => setIsBapteme((v) => !v)} />
          Baptême (non enregistré dans l'annuaire)
        </label>
      )}
      {isBapteme ? <BaptemeFields form={form} setField={setField} /> : <DiverFormFields f={f} />}
    </Dialog>
  );
}
