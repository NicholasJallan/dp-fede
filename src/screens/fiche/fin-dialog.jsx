// DP Assistant — Fin de plongée d'une palanquée : durée, profondeur et DTR
// réalisées. Règles conservées : durée ≤ temps écoulé depuis l'entrée,
// profondeur ≤ profondeur max du site, DTR réalisée ≤ durée.

import React from 'react';
import { Dialog } from '../../components/dialog.jsx';
import { Alert } from '../../components/ui.jsx';
import { UnitField } from '../../components/unit-field.jsx';
import { applyDuree, applyProf, applyDtr } from './fin-rules.js';

export function FinDialog({ palLabel, fin, form, setForm, noDeco, onCancel, onConfirm }) {
  return (
    <Dialog title={`Sortie de l'eau : ${palLabel}`} onClose={onCancel}
      footer={<>
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn primary lg" onClick={onConfirm} disabled={!form.duree || !form.profMax}>
          Valider la sortie
        </button>
      </>}>
      <p>Entrée à <b className="num">{fin.debut || '—'}</b>
        {fin.elapsed !== null && <>, soit <b className="num">{fin.elapsed} min</b> écoulées</>}.</p>
      <div className="grid-2">
        <UnitField label="Durée réelle" unit="min" value={form.duree} autoFocus
          hint={fin.elapsed !== null ? `Au plus ${fin.elapsed} min` : undefined}
          onChange={raw => setForm(f => applyDuree(f, raw, fin.elapsed))} />
        <UnitField label="Profondeur max réalisée" unit="m" value={form.profMax}
          hint={fin.siteProfMax ? `Site : ${fin.siteProfMax} m au plus` : undefined}
          onChange={raw => setForm(f => applyProf(f, raw, fin.siteProfMax))} />
      </div>
      {noDeco && <Alert tone="info">Palanquée prévue sans palier obligatoire : saisissez la DTR réellement constatée.</Alert>}
      <UnitField label="DTR réalisée" unit="min" value={form.dtr}
        hint={form.duree ? `Au plus la durée de plongée (${form.duree} min)` : 'Ne peut pas dépasser la durée de plongée.'}
        onChange={raw => setForm(f => applyDtr(f, raw))} />
      <div className="field plain">
        <label htmlFor="fin-comment">Commentaire (facultatif)</label>
        <textarea id="fin-comment" className="textarea" rows={3} value={form.commentaire}
          placeholder="Incident, observation, conditions particulières"
          onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} />
      </div>
    </Dialog>
  );
}
