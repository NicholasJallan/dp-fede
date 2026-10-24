// @ts-check
// DP Assistant — Niveaux → aptitudes, profondeurs et mélanges autorisés
// (Code du sport, annexes III-14 b à III-18 a, art. A322-xx).

import { CDS } from './cds-tables.js';
import { derivePalMode, hasGasQual } from './pal-helpers.js';

/** @typedef {import('./types.js').Diver} Diver */
/** @typedef {import('./types.js').NiveauEncadrant} NiveauEncadrant */

// =========================================================================
// MAPPING NIVEAU → APTITUDES (Annexes III-14 b, III-15 b)
// mandatory : toujours acquis avec ce niveau
// optional  : possible (aptitudes_sup dans le profil du plongeur)
// =========================================================================
export const APTITUDE_MAP = {
  N1: { mandatory: ['PE20'], optional: ['PA12', 'PA20'] },
  N2: { mandatory: ['PE20', 'PE40', 'PA12', 'PA20'], optional: ['PA40'] },
  // N3 = autonome 60 m → PA60 inclus de droit
  N3: { mandatory: ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60'], optional: [] },
  // Encadrants : toutes les aptitudes plongeur N3 (PA60 inclus) + rôle encadrant
  N4: { mandatory: ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60', 'GP'], optional: [] },
  N5: { mandatory: ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60'], optional: [] },
  // E1 (initiateur) : N2 minimum — aptitudes N3 seulement si niveau plongeur N3.
  E1: { mandatory: ['PE20', 'PE40', 'PA12', 'PA20'], optional: ['PA40', 'GP', 'Enseignant'] },
  // III-15 b : E-2 = initiateur ET guide de palanquée → GP de droit.
  E2: { mandatory: ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60', 'GP'], optional: ['Enseignant'] },
  E3: { mandatory: ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60', 'GP', 'Enseignant'], optional: [] },
  E4: { mandatory: ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60', 'GP', 'Enseignant'], optional: [] },
};

/**
 * Profondeur max qu'un DP peut diriger pour un type de palanquée
 * (annexe III-15 a, A322-76, A322-98). Sans mélange précisé, renvoie la
 * limite la plus large (air 60 m, ou trimix si le DP est PTH-120).
 *
 *   N5 (P5/DPE) : exploration uniquement, air/nitrox → 60 m
 *   E1 / E2     : piscine ou fosse ≤ 6 m uniquement → 6 m
 *   E3 (MF1)    : air/nitrox exploration 60 m, enseignement 40 m ;
 *                 trimix enseignement 40 m, exploration 70 m
 *   E4 (MF2)    : air/nitrox 60 m ; trimix enseignement 80 m, exploration 120 m
 *
 * @param {'formation'|'bapteme'|'exploration'|'guidee'} palType
 * @param {{niveau_encadrant?:string, trimix?:string[]}|null} dp
 * @returns {number} Profondeur max en mètres (0 = type interdit pour ce DP)
 */
export function getDpMaxDepth(palType, dp) {
  const q = CDS.DP_QUALIF[dp?.niveau_encadrant || ''];
  if (!q) return 0;
  const isTraining = palType === 'formation' || palType === 'bapteme';
  if (isTraining && !q.enseignement) return 0;
  if (!q.naturel) return CDS.LIMITS.BASSIN_DEROGATION_MAX;
  const air = (isTraining && q.airEnseignement) || CDS.LIMITS.AIR_MAX;
  const hasPth120 = (dp?.trimix || []).includes('PTH-120');
  if (!q.trimix || !hasPth120) return air;
  return Math.max(air, q.trimix[isTraining ? 'enseignement' : 'exploration']);
}

/**
 * Aptitudes visées en cours de formation (annexe III-16 a) : un élève peut
 * évoluer dans l'espace supérieur à ses aptitudes si l'enseignant présent a
 * la compétence requise (E3 : 0-40 m, E4 : 0-60 m). Uniquement en
 * enseignement — jamais en exploration.
 * @param {Diver|null} diver
 * @param {NiveauEncadrant|null} maxEnsLevel  niveau max enseignant dans la palanquée
 * @param {'enseignement'|'exploration'} [mode]
 * @returns {string[]}
 */
export function getFormationBonusAptitudes(diver, maxEnsLevel, mode) {
  if (!diver || !maxEnsLevel || mode === 'exploration') return [];
  const np = diver.niveau_plongeur || null;
  const ne = diver.niveau_encadrant || null;
  const sup = diver.aptitudes_sup || [];
  if (ne) return []; // les encadrants ont déjà toutes les aptitudes plongeur
  if (np === 'N1' && ['E3', 'E4'].includes(maxEnsLevel)) return sup.includes('PA20') ? ['PE40', 'PA40'] : ['PE40'];
  if (np === 'N2' && maxEnsLevel === 'E4') return sup.includes('PA40') ? ['PE60', 'PA60'] : ['PE60'];
  return [];
}

/**
 * Aptitudes disponibles pour un plongeur sur une plongée donnée.
 * Retourne la liste ordonnée des prérogatives qu'il peut avoir dans une palanquée.
 *
 * @param {object}   diver          { niveau_plongeur?, niveau_encadrant?, trimix?, aptitudes_sup? }
 * @param {boolean=} isExploration  true si la session DP est en exploration pure (N5)
 * @param {{maxEnsLevel?:string}=} palContext Étend les aptitudes en formation si la palanquée contient un E1→E4
 * @returns {string[]} Aptitudes triées dans l'ordre canonique
 */
export function getDiverAptitudes(diver, isExploration, palContext) {
  const np = diver.niveau_plongeur || null;
  const ne = diver.niveau_encadrant || null;
  const trimix = diver.trimix || [];
  const sup = diver.aptitudes_sup || [];
  const apts = new Set();
  const maxEnsLevel = palContext?.maxEnsLevel || null;

  // Licencié débutant (sans aucun niveau) : baptême, ou formation vers PE-12 /
  // PE-20 (III-16 a). La validation impose l'enseignant requis par l'espace.
  if (!np && !ne) return ['Baptême', 'PE12', 'PE20'];

  // Aptitudes du niveau plongeur (selon Annexes FFESSM / Code du Sport)
  if (np === 'N1') {
    apts.add('PE20');
    if (sup.includes('PA12')) apts.add('PA12');
    if (sup.includes('PA20')) apts.add('PA20');
  }
  if (np === 'N2') {
    apts.add('PE20');
    apts.add('PE40');
    apts.add('PA12');
    apts.add('PA20');
    if (sup.includes('PA40')) apts.add('PA40');
  }
  if (np === 'N3') {
    apts.add('PE20');
    apts.add('PE40');
    apts.add('PE60');
    apts.add('PA12');
    apts.add('PA20');
    apts.add('PA40');
    apts.add('PA60');
  }

  // Encadrants : aptitudes plongeur N3 + rôle encadrant. Exception : un E1
  // (initiateur) peut n'être que N2 — ses aptitudes plongeur suivent alors son
  // niveau plongeur (III-14 b, A322-89), N2 par défaut.
  if (ne === 'E1' && np !== 'N3') {
    apts.add('PE20');
    apts.add('PE40');
    apts.add('PA12');
    apts.add('PA20');
    if (sup.includes('PA40')) apts.add('PA40');
  } else if (ne) {
    apts.add('PE20');
    apts.add('PE40');
    apts.add('PE60');
    apts.add('PA12');
    apts.add('PA20');
    apts.add('PA40');
    apts.add('PA60');
  }
  if (ne) {
    if (ne === 'N4') apts.add('GP');
    else if (ne === 'N5') {
      /* N5 = DP plongeur, pas guide */
    } else if (ne === 'E1') {
      if (sup.includes('GP')) apts.add('GP');
      apts.add(ne); // Enseignant
    } else if (ne === 'E2') {
      apts.add('GP'); // III-15 b : initiateur ET guide de palanquée
      apts.add(ne);
    } else if (['E3', 'E4'].includes(ne)) {
      apts.add('GP');
      apts.add(ne); // Enseignant
    }
  }

  // Trimix
  if (trimix.includes('PTH-70') || trimix.includes('PTH-120')) apts.add('PTH70');
  if (trimix.includes('PTH-120')) apts.add('PTH120');

  // Bonus formation : PE niveau supérieur si enseignant suffisant dans la palanquée
  getFormationBonusAptitudes(diver, maxEnsLevel, palContext?.mode).forEach((a) => apts.add(a));

  // Ordre canonique : Baptême < PE < PA < GP < Enseignant
  const ORDER = [
    'Baptême',
    'PE12',
    'PE20',
    'PE40',
    'PE60',
    'PA12',
    'PA20',
    'PA40',
    'PA60',
    'PTH70',
    'PTH120',
    'GP',
    'E1',
    'E2',
    'E3',
    'E4',
  ];
  return ORDER.filter((a) => apts.has(a));
}

/**
 * Profondeur max accessible pour une aptitude donnée (annexes III-14 a,
 * III-16 a/b, III-18 a). Pour un encadrant : espace maximal qu'il peut
 * encadrer à l'air (GP/P4 : 0-40 m, 0-60 m réservé à l'E4).
 * Aptitude inconnue → 0 (aucune profondeur autorisée par défaut).
 *
 * @param {string} aptitude  Code aptitude (ex: 'PE40', 'PA60', 'GP', 'E3', 'PTH120')
 * @returns {number} Mètres
 */
export function aptitudeMaxDepth(aptitude) {
  const map = {
    Baptême: 6,
    PE12: 12,
    PE20: 20,
    PE40: 40,
    PE60: 60,
    PA12: 12,
    PA20: 20,
    PA40: 40,
    PA60: 60,
    GP: 40,
    E1: 6,
    E2: 20,
    E3: 40,
    E4: 60,
    PTH70: 70,
    PTH120: 120,
  };
  return map[aptitude] ?? 0;
}

/**
 * Type de palanquée (couleur et règles métier).
 *   bapteme     : contient un baptême (toujours en enseignement)
 *   formation   : enseignement (A322-75)
 *   guidee      : exploration encadrée (GP ou enseignant)
 *   exploration : exploration en autonomie
 *
 * @param {Array<{aptitude?:string}>} membres
 * @param {'enseignement'|'exploration'} [mode]  choix du DP (pal.mode)
 * @returns {'bapteme'|'formation'|'guidee'|'exploration'}
 */
export function getPalType(membres, mode) {
  const apts = (membres || []).map((m) => m.aptitude || '');
  if (apts.includes('Baptême')) return 'bapteme';
  const effective = derivePalMode({ membres, mode });
  if (effective === 'enseignement') return 'formation';
  if (apts.some((a) => a === 'GP' || ['E1', 'E2', 'E3', 'E4'].includes(a))) return 'guidee';
  return 'exploration';
}

/**
 * Mélanges disponibles selon les qualifications du Directeur de Plongée.
 *   Air        : toujours autorisé.
 *   Nx ≤ 40 %  : DP doit justifier PN-C (A322-72).
 *   Nx > 40 %  : DP doit justifier PN-C (A322-72).
 *   Tx (trimix): DP doit être PTH-120 ET E3 ou E4
 *               (E1/E2/N5 ne peuvent jamais diriger une plongée trimix).
 *
 * @param {{niveau_encadrant?:string, nitrox?:string[], trimix?:string[]}|null} dp
 * @returns {Array<{value:string, allowed:boolean, reason:string|null}>}
 */
export function getAvailableMelanges(dp) {
  const ne = dp?.niveau_encadrant || '';
  // Par rang, comme validatePal : PTH-120 suppose PN-C (III-18 a).
  const hasPNC = !!dp && hasGasQual(dp, 'PN-C');
  const hasPTH120 = (dp?.trimix || []).includes('PTH-120');
  const canTrimix = hasPTH120 && !!CDS.DP_QUALIF[ne]?.trimix;
  return [
    { value: 'Air', allowed: true, reason: null },
    { value: 'Nx ≤ 40%', allowed: hasPNC, reason: 'DP doit être PN-C' },
    { value: 'Nx > 40%', allowed: hasPNC, reason: 'DP doit être PN-C' },
    { value: 'Tx', allowed: canTrimix, reason: 'DP doit être PTH-120 (E3/E4)' },
  ];
}
