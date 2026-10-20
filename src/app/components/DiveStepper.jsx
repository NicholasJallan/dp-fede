// Étapes 1 → 5 de la plongée (masquage selon le mode, verrouillages).

import React from 'react';
import { STEPS, FICHE_IDX, ARCHIVE_IDX, PREPARE_ONLY_STEPS, EXECUTE_ONLY_STEPS } from '../constants.js';
import { Icon } from '../../components/icons.jsx';

function isStepLocked(i, step, { plongeeFigee, divePlongeesEnCours, diveMode }) {
  if (plongeeFigee) return i < ARCHIVE_IDX;
  return (divePlongeesEnCours && i < FICHE_IDX)
    || (diveMode === 'execute' && PREPARE_ONLY_STEPS.includes(step.id));
}

function stepState(i, currentStepIdx, locked) {
  if (i === currentStepIdx) return { cls: 'is-active', sr: 'étape en cours' };
  if (locked) return { cls: 'is-locked', sr: 'verrouillée' };
  if (i < currentStepIdx) return { cls: 'is-done', sr: 'terminée' };
  return { cls: '', sr: 'à venir' };
}

export function DiveStepper({ currentStepIdx, diveMode, plongeeFigee, divePlongeesEnCours }) {
  const visible = STEPS
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !(diveMode === 'prepare' && EXECUTE_ONLY_STEPS.includes(s.id))
      && !(diveMode === 'execute' && PREPARE_ONLY_STEPS.includes(s.id)));
  return (
    <nav className="stepper" aria-label={diveMode === 'execute' ? 'Étapes de l\'exécution' : 'Étapes de la préparation'}>
      <ol className="stepper-list">
        {visible.map(({ s, i }) => {
          const locked = isStepLocked(i, s, { plongeeFigee, divePlongeesEnCours, diveMode });
          const st = stepState(i, currentStepIdx, locked);
          return (
            <li key={s.id} className={`step ${st.cls}`} aria-current={i === currentStepIdx ? 'step' : undefined}>
              <span className="step-num" aria-hidden="true">
                {locked && i !== currentStepIdx ? <Icon.Lock /> : st.cls === 'is-done' ? <Icon.Check /> : i + 1}
              </span>
              <span className="step-label">{s.label}</span>
              <span className="sr-only"> ({st.sr})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
