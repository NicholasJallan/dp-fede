// @ts-check
// DP Assistant — Libellés des niveaux et des types de structure.

import { DEFAULT_JURISDICTION, normalizeJurisdiction } from './jurisdiction.js';

// =========================================================================
// LEVELS — étiquettes affichables + flag canBeDP (le seul attribut consommé)
// =========================================================================
// canBeDP : peut diriger quelque part (E1/E2 : piscine ou fosse ≤ 6 m, A322-98).
export const LEVELS = {
  E1: { label: 'E1 — Initiateur', canBeDP: true },
  E2: { label: 'E2 — Initiateur + GP / stagiaire MF1', canBeDP: true },
  E3: { label: 'E3 — MF1', canBeDP: true },
  E4: { label: 'E4 — MF2 / BEPPA', canBeDP: true },
  N5: { label: 'N5 — P5 / DPE (exploration)', canBeDP: true },
  N4: { label: 'N4 / GP — Guide de palanquée' },
  N3: { label: 'N3 — PA-60 / PE-60' },
  N2: { label: 'N2 — PE-40 / PA-20' },
  N1: { label: 'N1 — PE-20' },
};

// Structure type → label lisible (Code du sport)
export const STRUCTURE_LABELS = {
  club: 'Club FFESSM associatif',
  sca: 'Structure Commerciale Agréée (SCA)',
  csa: "Convention de Section d'Activité (CSA)",
  autre: 'Autre',
};

export const JURISDICTION_LABELS = Object.freeze({
  FR: 'France — Code du sport',
  PF: 'Polynésie française — arrêté n° 199 CM',
});

// Types de structure proposés par juridiction, dans l'ordre d'affichage. En
// Polynésie, la loi du pays n° 2017-44 distingue organismes à but lucratif
// (établissement, moniteur patenté) et non lucratif (LP 5, LP 18).
const STRUCTURE_LABELS_BY_JURISDICTION = Object.freeze({
  FR: Object.freeze({ ...STRUCTURE_LABELS }),
  PF: Object.freeze({
    club: 'Association (FPESSM / FFESSM)',
    sca: 'Établissement commercial',
    patente: 'Moniteur patenté (indépendant)',
    csa: STRUCTURE_LABELS.csa,
    autre: STRUCTURE_LABELS.autre,
  }),
});

/**
 * @param {unknown} jurisdiction
 * @returns {Readonly<Record<string, string>>}
 */
export function structureLabels(jurisdiction) {
  return STRUCTURE_LABELS_BY_JURISDICTION[normalizeJurisdiction(jurisdiction) ?? DEFAULT_JURISDICTION];
}

/**
 * Libellé d'un type de structure : celui de la juridiction, sinon celui d'une
 * autre juridiction, sinon le code brut ; null sans type.
 * @param {string|null|undefined} type
 * @param {unknown} jurisdiction
 * @returns {string|null}
 */
export function structureLabel(type, jurisdiction) {
  if (!type) return null;
  const own = structureLabels(jurisdiction)[type];
  if (own) return own;
  const other = Object.values(STRUCTURE_LABELS_BY_JURISDICTION).find((labels) => labels[type]);
  return other ? other[type] : type;
}

/** Libellé d'un type de palanquée (getPalType) : famille d'aptitudes en tête. */
export const PAL_TYPE_LABELS = {
  exploration: 'PA · Autonomie',
  guidee: 'PE · Guidée',
  formation: 'Formation',
  bapteme: 'Baptême',
};
