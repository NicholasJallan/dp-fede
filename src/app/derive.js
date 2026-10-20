// DP Assistant — Valeurs dérivées de la plongée ouverte (pures, sans React).

import { CHECKLIST_RULES, getMilieuType, isBassinDerogation, matchCondition, validatePal } from '../domain/index.js';

// Notes réglementaires affichées sur l'écran profil.
export function computeProfilNotes(answers) {
  const notes = [];
  const profNum = parseFloat(answers.prof_max);
  if (answers.activite !== "Exploration" && profNum > 40) {
    notes.push({ tone:"info", text:"Enseignement au-delà de 40 m : l'encadrant de la palanquée doit être E4 (Annexe III-16 a)." });
  }
  if (answers.recycleur && profNum > 6) {
    notes.push({ tone:"info", text:"Recycleur > 6 m : un secours circuit-ouvert est obligatoire (Art. A322-94)." });
  }
  if (answers.depart_bateau && !answers.vhf && getMilieuType(answers.milieu) === 'mer') {
    notes.push({ tone:"warn", text:"En mer au départ d'une embarcation, une VHF est obligatoire (Art. A322-78)." });
  }
  if (isBassinDerogation(answers, profNum || 0)) {
    notes.push({ tone:"info", text:"En piscine ≤ 6 m : la fiche de sécurité n'est pas obligatoire (Art. A322-98)." });
  }
  return { notes };
}

// Palanquées présentant des erreurs bloquantes : [{ id, nom, errs[] }].
export function computeBlockingPalSummary(palanquees, divers, answers) {
  const diversById = {};
  divers.forEach(d => { diversById[d.id] = d; });
  const dp = divers.find(d => d.id === answers.dp_id) || null;
  return palanquees
    .map((p, idx) => {
      const issues = validatePal(p, diversById, answers, dp);
      const errs = issues.filter(i => i.tone === 'err').map(i => i.text);
      return { id: p.id, nom: p.nom || `Palanquée ${idx + 1}`, errs };
    })
    .filter(s => s.errs.length > 0);
}

// Progression de la check-list : { total, doneCount }.
export function checklistProgress(answers, checked) {
  const total = CHECKLIST_RULES.reduce((n, p) =>
    n + p.items.filter(it => matchCondition(it.when, answers)).length, 0);
  const doneCount = Object.values(checked).filter(Boolean).length;
  return { total, doneCount };
}

// Toutes les palanquées ont une heure de début ET de fin.
export function areAllPalanqueesFinished(palanquees, heuresDebut, heuresFin) {
  return palanquees.length > 0
    && palanquees.every(p => heuresDebut[p.id] && heuresFin[p.id]);
}
