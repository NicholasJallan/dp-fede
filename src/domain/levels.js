// @ts-check
// DP Assistant — Libellés des niveaux et des types de structure.

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

// Structure type → label lisible
export const STRUCTURE_LABELS = {
  club: 'Club FFESSM associatif',
  sca: 'Structure Commerciale Agréée (SCA)',
  csa: "Convention de Section d'Activité (CSA)",
  autre: 'Autre',
};

/** Libellé d'un type de palanquée (getPalType) : famille d'aptitudes en tête. */
export const PAL_TYPE_LABELS = {
  exploration: 'PA · Autonomie',
  guidee: 'PE · Guidée',
  formation: 'Formation',
  bapteme: 'Baptême',
};
