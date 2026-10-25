// DP Assistant — Valeurs dérivées de la plongée ouverte (pures, sans React).

import { getMilieuType, isBassinDerogation, matchCondition, rulesFor } from '../domain/index.js';

// Notes réglementaires affichées sur l'écran profil.
export function computeProfilNotes(answers) {
  const notes = [];
  const profNum = parseFloat(answers.prof_max);
  if (answers.activite !== 'Exploration' && profNum > 40) {
    notes.push({
      tone: 'info',
      text: "Enseignement au-delà de 40 m : l'encadrant de la palanquée doit être E4 (Annexe III-16 a).",
    });
  }
  if (answers.recycleur && profNum > 6) {
    notes.push({ tone: 'info', text: 'Recycleur > 6 m : un secours circuit-ouvert est obligatoire (Art. A322-94).' });
  }
  if (answers.depart_bateau && !answers.vhf && getMilieuType(answers.milieu) === 'mer') {
    notes.push({ tone: 'warn', text: "En mer au départ d'une embarcation, une VHF est obligatoire (Art. A322-78)." });
  }
  if (isBassinDerogation(answers, profNum || 0)) {
    notes.push({ tone: 'info', text: "En piscine ≤ 6 m : la fiche de sécurité n'est pas obligatoire (Art. A322-98)." });
  }
  return { notes };
}

// Palanquées présentant des erreurs bloquantes :
// [{ id, nom, errs: [{ code, text, ref }] }].
// `answers` : réponses passées au moteur (juridiction et structure, cf.
// useDiveRules) ; `rules` : règles de cette juridiction.
export function computeBlockingPalSummary(palanquees, divers, answers, rules = rulesFor(answers.jurisdiction)) {
  const diversById = {};
  divers.forEach((d) => {
    diversById[d.id] = d;
  });
  const dp = divers.find((d) => d.id === answers.dp_id) || null;
  const { validatePal } = rules;
  return palanquees
    .map((p, idx) => {
      const issues = validatePal(p, diversById, answers, dp);
      const errs = issues.filter((i) => i.tone === 'err').map(({ code, text, ref }) => ({ code, text, ref }));
      return { id: p.id, nom: p.nom || `Palanquée ${idx + 1}`, errs };
    })
    .filter((s) => s.errs.length > 0);
}

// Item « décision finale du DP » : verrou avant le passage en exécution.
export const GO_DECISION_ID = 'p2_go_decision';

function itemVisible(it, answers) {
  // Ancienne condition personnalisée (dérogation PA-60) conservée pour compat.
  if (it.when && it.when._custom === 'pa60_derog') {
    return answers.prof_max === '60 m' && answers.activite === 'Exploration' && !answers.dp_nom;
  }
  return matchCondition(it.when, answers);
}

// Phases de check-list affichées pour un mode : 'prepare' → phase 1,
// 'execute' → phase 2, autre → toutes. Items filtrés par le profil.
export function visibleChecklist(answers, mode, rules = rulesFor(answers.jurisdiction)) {
  return rules.checklistRules
    .filter((phase) => (mode === 'prepare' ? phase.phase === 1 : mode === 'execute' ? phase.phase === 2 : true))
    .map((phase) => ({ ...phase, items: phase.items.filter((it) => itemVisible(it, answers)) }));
}

// Progression de la check-list du mode courant : { total, doneCount }.
// Seuls les items visibles comptent (un item coché puis masqué par le profil
// ne gonfle plus le compteur).
export function checklistProgress(answers, checked, mode, rules) {
  const items = visibleChecklist(answers, mode, rules).flatMap((p) => p.items);
  return { total: items.length, doneCount: items.filter((it) => checked[it.id]).length };
}

// Avancement de l'exécution : palanquées à l'eau / sorties.
export function exitProgress(palanquees, heuresDebut, heuresFin) {
  const total = palanquees.length;
  const out = palanquees.filter((p) => heuresDebut[p.id] && heuresFin[p.id]).length;
  const water = palanquees.filter((p) => heuresDebut[p.id] && !heuresFin[p.id]).length;
  return { total, out, water };
}

// Toutes les palanquées ont une heure de début ET de fin.
export function areAllPalanqueesFinished(palanquees, heuresDebut, heuresFin) {
  return palanquees.length > 0 && palanquees.every((p) => heuresDebut[p.id] && heuresFin[p.id]);
}
