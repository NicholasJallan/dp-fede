// Barre basse des étapes : précédent / avancement / URGENCE (exécution) / suivant.
//
// Le bouton URGENCE fait partie de la barre en mode exécution : toujours au
// même endroit, sans chevaucher le contenu.

import React from 'react';
import { STEPS, FICHE_IDX } from '../constants.js';
import { Icon, StatusIcon } from '../../components/icons.jsx';

// Libellé, verrou et motif du bouton « suivant » selon l'étape.
function nextButton({ screen, currentStepIdx, diveMode, archiveDone, allPalanqueesFinished, goDecision }) {
  const isLast = currentStepIdx === STEPS.length - 1;
  if (screen === 'checklist' && diveMode === 'prepare') return { label: 'Enregistrer la préparation' };
  if (screen === 'checklist' && diveMode === 'execute' && !goDecision) {
    return { label: 'Fiche de sécurité', blocked: "Cochez la décision finale du DP pour autoriser la mise à l'eau." };
  }
  if (screen === 'fiche') {
    return allPalanqueesFinished
      ? { label: 'Archiver' }
      : { label: 'Archiver', blocked: "Toutes les palanquées doivent être sorties (bouton SORTIE) avant l'archivage." };
  }
  if (isLast) return archiveDone ? { label: 'Terminé', isLast } : { label: 'Terminé', isLast, disabled: true };
  return { label: 'Suivant' };
}

// Avancement affiché au centre de la barre.
function statusFor({ screen, progress, exit, currentStepIdx }) {
  if (screen === 'checklist') return { label: 'Check-list', done: progress.doneCount, total: progress.total };
  if (screen === 'fiche') return { label: 'Palanquées sorties', done: exit.out, total: exit.total };
  return { label: `Étape ${currentStepIdx + 1} : ${STEPS[currentStepIdx]?.label || ''}` };
}

export function FootNav(props) {
  const {
    screen,
    currentStepIdx,
    diveMode,
    plongeeFigee,
    divePlongeesEnCours,
    archiveDone,
    onPrev,
    onNext,
    onStartNew,
    onUrgence,
  } = props;
  const next = nextButton(props);
  const status = statusFor(props);
  const isExecute = diveMode === 'execute';
  const prevDisabled =
    plongeeFigee || (divePlongeesEnCours && currentStepIdx <= FICHE_IDX) || (isExecute && screen === 'checklist');
  const pct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <footer className={`footnav ${isExecute ? 'is-execute' : ''}`} aria-label="Navigation entre les étapes">
      <button type="button" className="btn footnav-prev" onClick={onPrev} disabled={prevDisabled}>
        <Icon.ChevronLeft />
        <span className="label">Précédent</span>
      </button>
      <div className="footnav-status">
        <div className="lbl">
          <span>{status.label}</span>
          {status.total != null && (
            <span className="num">
              {status.done}/{status.total}
            </span>
          )}
        </div>
        {status.total != null && (
          <div
            className="bar"
            role="progressbar"
            aria-label={status.label}
            aria-valuemin={0}
            aria-valuemax={status.total}
            aria-valuenow={status.done}
          >
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {isExecute && (
        <button
          type="button"
          className="btn urgence footnav-urgence"
          onClick={onUrgence}
          aria-haspopup="dialog"
          title="Conduite à tenir et numéros des secours"
        >
          <Icon.Phone />
          URGENCE
        </button>
      )}
      <button
        type="button"
        className="btn primary footnav-next"
        onClick={next.isLast && archiveDone ? onStartNew : onNext}
        disabled={!!next.blocked || !!next.disabled}
        aria-describedby={next.blocked ? 'footnav-hint' : undefined}
      >
        {next.label}
        {!next.isLast && <Icon.ChevronRight />}
      </button>
      {next.blocked && (
        <p className="footnav-hint" id="footnav-hint">
          <StatusIcon tone="warn" />
          {next.blocked}
        </p>
      )}
    </footer>
  );
}
