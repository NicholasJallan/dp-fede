// DP Assistant — Fin de plongée d'une palanquée : durée, profondeur et DTR
// réalisées, paliers de décompression effectués (facultatif). Règles
// conservées : durée ≤ temps écoulé depuis l'entrée, profondeur ≤ profondeur
// max du site, DTR réalisée ≤ durée. Saisie « − / + » (StepperField) : rapide
// à corriger au bord de l'eau.

import React from 'react';
import { Dialog } from '../../components/dialog.jsx';
import { Alert } from '../../components/ui.jsx';
import { StepperField } from '../../components/stepper-field.jsx';
import { PALIER_DEPTHS, paliersTotal } from '../../domain/index.js';
import {
  applyDuree,
  applyProf,
  applyDtr,
  applyPalier,
  applyConfort,
  PALIER_MAX_MIN,
  CONFORT_DEPTH,
  CONFORT_MAX_MIN,
} from './fin-rules.js';

function PaliersFieldset({ form, setForm }) {
  const total = paliersTotal(form);
  const dtr = parseInt(form.dtr, 10);
  return (
    <fieldset className="field paliers-fieldset">
      <legend>
        Paliers réalisés <span className="muted">(facultatif)</span>
      </legend>
      <p className="field-hint">
        Durée effectuée à chaque palier, par tranche de 3 m. Laisser vide si le palier n'a pas été fait.
      </p>
      <div className="paliers-grid">
        {PALIER_DEPTHS.map((depth) => (
          <StepperField
            key={depth}
            compact
            label={
              <>
                <span className="sr-only">Palier à </span>
                {depth} m
              </>
            }
            unit="min"
            min={0}
            max={PALIER_MAX_MIN}
            value={form.paliers[depth]}
            placeholder="—"
            onChange={(raw) => setForm((f) => applyPalier(f, depth, raw))}
          />
        ))}
      </div>
      <label className={`qualif-toggle ${form.confort.on ? 'on' : ''}`}>
        <input
          type="checkbox"
          checked={form.confort.on}
          onChange={(e) => setForm((f) => applyConfort(f, { on: e.target.checked }))}
        />
        Palier de confort (non obligatoire)
      </label>
      {form.confort.on && (
        <div className="grid-2">
          <StepperField
            label={
              <>
                <span className="sr-only">Palier de confort, </span>Profondeur
              </>
            }
            unit="m"
            min={CONFORT_DEPTH.min}
            max={CONFORT_DEPTH.max}
            value={form.confort.profondeur}
            onChange={(raw) => setForm((f) => applyConfort(f, { profondeur: raw }))}
          />
          <StepperField
            label={
              <>
                <span className="sr-only">Palier de confort, </span>Durée
              </>
            }
            unit="min"
            min={0}
            max={CONFORT_MAX_MIN}
            placeholder="—"
            value={form.confort.duree}
            onChange={(raw) => setForm((f) => applyConfort(f, { duree: raw }))}
          />
        </div>
      )}
      {total > 0 && isFinite(dtr) && total > dtr && (
        <Alert tone="warn">
          Les paliers totalisent {total} min, plus que la DTR réalisée ({dtr} min) : vérifiez la DTR, elle inclut les
          paliers.
        </Alert>
      )}
    </fieldset>
  );
}

export function FinDialog({ palLabel, fin, form, setForm, noDeco, onCancel, onConfirm }) {
  return (
    <Dialog
      title={`Sortie de l'eau : ${palLabel}`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn primary lg" onClick={onConfirm} disabled={!form.duree || !form.profMax}>
            Valider la sortie
          </button>
        </>
      }
    >
      <p>
        Entrée à <b className="num">{fin.debut || '—'}</b>
        {fin.elapsed !== null && (
          <>
            , soit <b className="num">{fin.elapsed} min</b> écoulées
          </>
        )}
        .
      </p>
      <div className="grid-2">
        <StepperField
          label="Durée réelle"
          unit="min"
          value={form.duree}
          autoFocus
          min={0}
          max={fin.elapsed ?? 240}
          hint={fin.elapsed !== null ? `Au plus ${fin.elapsed} min` : undefined}
          onChange={(raw) => setForm((f) => applyDuree(f, raw, fin.elapsed))}
        />
        <StepperField
          label="Profondeur max réalisée"
          unit="m"
          value={form.profMax}
          min={0}
          max={fin.siteProfMax || 200}
          hint={fin.siteProfMax ? `Site : ${fin.siteProfMax} m au plus` : undefined}
          onChange={(raw) => setForm((f) => applyProf(f, raw, fin.siteProfMax))}
        />
      </div>
      {noDeco && (
        <Alert tone="info">Palanquée prévue sans palier obligatoire : saisissez la DTR réellement constatée.</Alert>
      )}
      <StepperField
        label="DTR réalisée"
        unit="min"
        value={form.dtr}
        min={0}
        max={parseInt(form.duree, 10) || 120}
        hint={
          form.duree ? `Au plus la durée de plongée (${form.duree} min)` : 'Ne peut pas dépasser la durée de plongée.'
        }
        onChange={(raw) => setForm((f) => applyDtr(f, raw))}
      />
      <PaliersFieldset form={form} setForm={setForm} />
      <div className="field plain">
        <label htmlFor="fin-comment">Commentaire (facultatif)</label>
        <textarea
          id="fin-comment"
          className="textarea"
          rows={3}
          value={form.commentaire}
          placeholder="Incident, observation, conditions particulières"
          onChange={(e) => setForm((f) => ({ ...f, commentaire: e.target.value }))}
        />
      </div>
    </Dialog>
  );
}
