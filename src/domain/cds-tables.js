// DP Assistant — Tableaux réglementaires du Code du sport (plongée subaquatique).
//
// Transcription des annexes III-15 a à III-18 c et des articles A322-73,
// A322-76, A322-89, A322-92 et A322-98 (texte consolidé, arrêtés des
// 17/10/2025 et 24/11/2025 inclus). Données pures : la logique d'application
// vit dans src/domain/pal-rules.js et son portage PHP backend/lib/Rules.php.
//
// Toute modification doit être accompagnée d'un cas dans
// tests/fixtures/pal-rules.json (exécuté côté JS ET côté PHP).

const ENS_RANK = Object.freeze({ E1: 1, E2: 2, E3: 3, E4: 4 });

// Qualifications mélanges, de la moins à la plus étendue (III-17 a, III-18 a).
const GAS_QUAL_RANK = Object.freeze({ PN: 1, 'PN-C': 2, 'PTH-40': 3, 'PTH-70': 4, 'PTH-120': 5 });

// A322-76 — limites absolues.
const LIMITS = Object.freeze({
  AIR_MAX: 60,
  TRIMIX_ENCADRE_MAX: 80,
  TRIMIX_AUTONOME_MAX: 120,
  BASSIN_DEROGATION_MAX: 6, // A322-98
  PPO2_MAX: 1.6, // A322-92
  PPO2_MIN: 0.16,
});

// A322-73 / A322-89 — âge minimal pour l'autonomie.
const AUTONOMIE_AGE_MIN = Object.freeze({ 12: 16, 20: 16, 40: 17, 60: 18 });

// Annexe III-16 a — enseignement à l'air en milieu naturel.
// minE : compétence minimale de l'encadrant ; max : effectif hors encadrant ;
// extra : (*) un plongeur supplémentaire GP/P4 possible.
const AIR_ENSEIGNEMENT = Object.freeze({
  6: { minE: 'E1', max: 4, maxBapteme: 1, extra: true },
  12: { minE: 'E2', max: 4, extra: true },
  20: { minE: 'E2', max: 4, extra: true },
  40: { minE: 'E3', max: 4, extra: true },
  60: { minE: 'E4', max: 4, extra: false },
});

// Annexe III-16 b — exploration à l'air en milieu naturel (plongée encadrée).
// gp : un guide de palanquée (GP/P4) peut encadrer ; debutants : admis.
const AIR_EXPLORATION = Object.freeze({
  6: { minE: 'E1', gp: true, max: 4, extra: true, debutants: true },
  12: { minE: 'E2', gp: true, max: 4, extra: true },
  20: { minE: 'E2', gp: true, max: 4, extra: true },
  40: { minE: 'E3', gp: true, max: 4, extra: true },
  60: { minE: 'E4', gp: false, max: 4, extra: false },
});

// Annexe III-16 b — plongée autonome : effectif maximal.
const AUTONOMIE_MAX = 3;

// Annexe III-17 b — enseignement au nitrox (encadrant + PN-C).
// elevePN : les élèves doivent déjà justifier de PN.
const NITROX_ENSEIGNEMENT = Object.freeze({
  6: { minE: 'E2', max: 4, maxBapteme: 1, extra: true, elevePN: false },
  12: { minE: 'E2', max: 4, extra: true, elevePN: false },
  20: { minE: 'E2', max: 4, extra: true, elevePN: false },
  40: { minE: 'E3', max: 4, extra: true, elevePN: true },
  60: { minE: 'E4', max: 4, extra: false, elevePN: true },
});

// Annexe III-17 c — exploration au nitrox (encadrant + PN-C, plongeurs + PN).
// Pas de ligne 0-6 m : les débutants ne plongent pas au nitrox en exploration.
const NITROX_EXPLORATION = Object.freeze({
  12: { minE: 'E2', gp: true, max: 4, extra: true },
  20: { minE: 'E2', gp: true, max: 4, extra: true },
  40: { minE: 'E3', gp: true, max: 4, extra: true },
  60: { minE: 'E4', gp: false, max: 4, extra: false },
});

// Annexe III-18 b — enseignement au trimix / héliox.
// eleveAir : aptitude PE minimale ; eleveQual : qualification déjà acquise.
const TRIMIX_ENSEIGNEMENT = Object.freeze({
  40: { minE: 'E3', encadrantQual: 'PTH-70', eleveAir: 40, eleveQual: 'PN-C', max: 4 },
  70: { minE: 'E4', encadrantQual: 'PTH-120', eleveAir: 60, eleveQual: 'PTH-40', max: 4 },
  80: { minE: 'E4', encadrantQual: 'PTH-120', eleveAir: 60, eleveQual: 'PTH-70', max: 4 },
});

// Annexe III-18 c — exploration au trimix / héliox.
const TRIMIX_EXPLORATION = Object.freeze({
  40: { minE: 'E3', encadrantQual: 'PTH-40', air: 40, qual: 'PTH-40', max: 4 },
  70: { minE: 'E4', encadrantQual: 'PTH-70', air: 60, qual: 'PTH-70', max: 4 },
  80: { minE: 'E4', encadrantQual: 'PTH-120', air: 60, qual: 'PTH-120', max: 4 },
});
const TRIMIX_AUTONOMIE = Object.freeze({
  40: { air: 40, qual: 'PTH-40' },
  70: { air: 60, qual: 'PTH-70' },
  80: { air: 60, qual: 'PTH-120' },
  120: { air: 60, qual: 'PTH-120' },
});

// Annexe III-15 a (+ A322-98) — qualification minimale du directeur de plongée.
// naturel : peut diriger en milieu naturel ; bassin : piscine/fosse ≤ 6 m ;
// trimix : profondeur max par mode (null = trimix interdit).
const DP_QUALIF = Object.freeze({
  N5: { naturel: true, bassin: false, enseignement: false, trimix: null },
  E1: { naturel: false, bassin: true, enseignement: true, trimix: null },
  E2: { naturel: false, bassin: true, enseignement: true, trimix: null },
  E3: { naturel: true, bassin: true, enseignement: true, trimix: { enseignement: 40, exploration: 70 } },
  E4: { naturel: true, bassin: true, enseignement: true, trimix: { enseignement: 80, exploration: 120 } },
});

export const CDS = Object.freeze({
  ENS_RANK,
  GAS_QUAL_RANK,
  LIMITS,
  AUTONOMIE_AGE_MIN,
  AUTONOMIE_MAX,
  AIR_ENSEIGNEMENT,
  AIR_EXPLORATION,
  NITROX_ENSEIGNEMENT,
  NITROX_EXPLORATION,
  TRIMIX_ENSEIGNEMENT,
  TRIMIX_EXPLORATION,
  TRIMIX_AUTONOMIE,
  DP_QUALIF,
});
