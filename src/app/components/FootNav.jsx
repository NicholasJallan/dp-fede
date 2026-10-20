// Pied de page des étapes : précédent / progression / suivant.

import React from 'react';
import { STEPS, FICHE_IDX } from '../constants.js';

function nextButtonProps({ screen, currentStepIdx, diveMode, archiveDone, allPalanqueesFinished }) {
  const isLast       = currentStepIdx === STEPS.length - 1;
  const ficheBlocked = screen === "fiche" && !allPalanqueesFinished;
  const isPrepareEnd = screen === "checklist" && diveMode === 'prepare';
  return {
    isLast,
    disabled: (isLast && !archiveDone) || ficheBlocked,
    title: ficheBlocked
      ? "Terminez toutes les plongées (bouton ■ Fin sur la fiche) avant de continuer."
      : undefined,
    label: isPrepareEnd
      ? "Sauvegarder →"
      : isLast ? "Terminé" : "Suivant →",
  };
}

export function FootNav(props) {
  const {
    screen, currentStepIdx, diveMode, plongeeFigee, divePlongeesEnCours,
    archiveDone, doneCount, total, onPrev, onNext, onStartNew,
  } = props;
  const next = nextButtonProps(props);
  return (
    <div className="footnav">
      <button className="btn" onClick={onPrev}
        disabled={
          plongeeFigee
          || (divePlongeesEnCours && currentStepIdx <= FICHE_IDX)
          || (diveMode === 'execute' && screen === 'checklist')
        }>
        ← Précédent
      </button>
      <div className="progress">
        <div className="lbl">
          <span>Étape {currentStepIdx + 1} / {STEPS.length} — {STEPS[currentStepIdx]?.label}</span>
          <span>{doneCount} / {total} actions</span>
        </div>
        <div className="bar">
          <div style={{ width:`${total > 0 ? (doneCount / total * 100) : 0}%` }}></div>
        </div>
      </div>
      <button className="btn primary"
        onClick={next.isLast && archiveDone ? onStartNew : onNext}
        disabled={next.disabled}
        title={next.title}>
        {next.label}
      </button>
    </div>
  );
}
