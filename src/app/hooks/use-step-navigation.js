// DP Assistant — Navigation entre les étapes 1 → 5 (précédent / suivant,
// verrouillages en exécution, confirmations avant archivage).

import { useCallback } from 'react';
import { STEPS, ADMIN_SCREENS, FICHE_IDX, CHECKLIST_IDX } from '../constants.js';
import { GO_DECISION_ID } from '../derive.js';

const smoothTop = () => window.scrollTo({ top:0, behavior:"smooth" });

export function stepFlags(screen, heuresDebut) {
  const currentStepIdx = STEPS.findIndex(s => s.id === screen);
  return {
    currentStepIdx,
    isStepScreen:  currentStepIdx >= 0,
    isAdminScreen: ADMIN_SCREENS.includes(screen),
    divePlongeesEnCours: Object.keys(heuresDebut).length > 0,
  };
}

export function useStepNavigation(ctx) {
  const {
    screen, setScreen, diveMode, session, flags,
    blockingPalSummary, allPalanqueesFinished, startPreparation, finishPreparation,
  } = ctx;
  const { plongeeFigee, setPlongeeFigee, setConfirmModal } = session;
  const { currentStepIdx, divePlongeesEnCours } = flags;

  const goNextStep = useCallback(() => {
    if (currentStepIdx < STEPS.length - 1) setScreen(STEPS[currentStepIdx + 1].id);
    smoothTop();
  }, [currentStepIdx, setScreen]);

  const goPrev = () => {
    if (plongeeFigee) return;
    if (divePlongeesEnCours && currentStepIdx <= FICHE_IDX) return;
    if (diveMode === 'execute' && currentStepIdx <= CHECKLIST_IDX) return;
    if (currentStepIdx <= 0) { setScreen("home"); return; }
    setScreen(STEPS[currentStepIdx - 1].id);
    smoothTop();
  };

  const goNext = () => {
    if (screen === "home") { startPreparation(); return; }
    // Fin de préparation : bouton "Suivant" sur la check-list phase 1
    if (screen === "checklist" && diveMode === 'prepare') {
      finishPreparation();
      return;
    }
    // Décision finale du DP : verrou avant le passage à la fiche (mise à l'eau).
    if (screen === "checklist" && diveMode === 'execute' && !session.checked[GO_DECISION_ID]) return;
    if (screen === "palanquees" && blockingPalSummary.length > 0) {
      setConfirmModal("pal_blocking");
      return;
    }
    if (screen === "fiche") {
      if (!allPalanqueesFinished) return;
      setConfirmModal("confirm");
      return;
    }
    goNextStep();
  };

  const overridePalBlocking = () => {
    setConfirmModal(false);
    goNextStep();
  };

  const confirmArchive = () => {
    setPlongeeFigee(true);
    setConfirmModal(false);
    setScreen("archive");
    smoothTop();
  };

  return { goPrev, goNext, overridePalBlocking, confirmArchive };
}
