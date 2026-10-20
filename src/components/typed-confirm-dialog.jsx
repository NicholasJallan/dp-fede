// DP Assistant — Confirmation d'une suppression définitive par saisie du mot
// SUPPRIMER (compte, club). Le bouton reste inactif tant que la saisie n'est
// pas exacte ; Annuler reçoit le focus à l'ouverture.

import React, { useId, useState } from 'react';
import { Dialog } from './dialog.jsx';
import { DELETE_CONFIRMATION, isDeleteConfirmed } from '../club/deletion.js';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.confirmLabel
 * @param {boolean} [props.busy]
 * @param {React.ReactNode} [props.error]   refus serveur affiché au-dessus de la saisie
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export function TypedConfirmDialog({ title, confirmLabel, busy = false, error = null, onConfirm, onCancel, children }) {
  const [text, setText] = useState('');
  const id = useId();
  const ok = isDeleteConfirmed(text);
  const submit = (e) => {
    e.preventDefault();
    if (ok && !busy) onConfirm();
  };
  return (
    <Dialog title={title} onClose={onCancel} size="md" tone="err" icon="err" dismissible={!busy}
      footer={<>
        <button type="button" className="btn" onClick={onCancel} disabled={busy} data-autofocus="">Annuler</button>
        <button type="submit" form={`${id}-form`} className="btn danger solid" disabled={!ok || busy}>
          {busy ? 'Suppression…' : confirmLabel}
        </button>
      </>}>
      {children}
      {error}
      <form id={`${id}-form`} className="field plain" onSubmit={submit}>
        <label htmlFor={`${id}-input`}>
          Pour confirmer, saisissez <span className="confirm-word">{DELETE_CONFIRMATION}</span>
        </label>
        <input id={`${id}-input`} className="input mono" value={text} autoComplete="off" autoCapitalize="characters"
          spellCheck={false} onChange={e => setText(e.target.value)} disabled={busy} />
      </form>
    </Dialog>
  );
}
