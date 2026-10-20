// Stepper des étapes 1 → 5 (masquage selon le mode, verrouillages).

import React from 'react';
import { STEPS, FICHE_IDX, ARCHIVE_IDX, PREPARE_ONLY_STEPS, EXECUTE_ONLY_STEPS } from '../constants.js';

function isStepLocked(i, step, { plongeeFigee, divePlongeesEnCours, diveMode }) {
  if (plongeeFigee) return i < ARCHIVE_IDX;
  return (divePlongeesEnCours && i < FICHE_IDX)
    || (diveMode === 'execute' && PREPARE_ONLY_STEPS.includes(step.id));
}

export function DiveStepper({ currentStepIdx, diveMode, plongeeFigee, divePlongeesEnCours }) {
  const lockTitle = plongeeFigee
    ? "Plongée figée — consultation uniquement"
    : "Verrouillé";
  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        // En mode prepare : masquer fiche + archive ; en mode execute : masquer profil + palanquees
        const hiddenInPrepare = diveMode === 'prepare' && EXECUTE_ONLY_STEPS.includes(s.id);
        const hiddenInExecute = diveMode === 'execute' && PREPARE_ONLY_STEPS.includes(s.id);
        if (hiddenInPrepare || hiddenInExecute) return null;

        const isDone    = i < currentStepIdx;
        const isActive  = i === currentStepIdx;
        const isLocked  = isStepLocked(i, s, { plongeeFigee, divePlongeesEnCours, diveMode });
        return (
          <div key={s.id}
            className={`step ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`}
            title={isLocked ? lockTitle : undefined}
            aria-current={isActive ? "step" : undefined}>
            <span className="num">{isLocked ? "🔒" : isDone ? "✓" : (i + 1)}</span>
            <span className="grp">
              <span className="label-sub">{s.sub}</span>
              <span>{s.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
