// @ts-check
// DP Assistant — Normalisation du milieu de plongée (mer / lac / piscine / fosse).

import { CDS } from './cds-tables.js';

/**
 * Résume le milieu en : 'mer' | 'lac' | 'piscine' | 'fosse'.
 * Gère les valeurs site ('En mer', 'Lac', 'Carrière', 'Piscine') et les anciennes valeurs question.
 * @param {string|null|undefined} milieu
 * @returns {'mer'|'lac'|'piscine'|'fosse'}
 */
export function getMilieuType(milieu) {
  if (!milieu) return 'mer';
  const m = milieu.toLowerCase();
  if (m.includes('lac') || m.includes('carrière') || m.includes('carriere')) return 'lac';
  if (m.includes('piscine')) return 'piscine';
  if (m.includes('fosse')) return 'fosse';
  return 'mer';
}

/**
 * Vrai en milieu naturel (mer / lac / carrière), faux en piscine / fosse.
 * Sert à masquer les items de check-list et questions sans objet en bassin.
 * @param {string|null|undefined} milieu
 * @returns {boolean}
 */
export function isMilieuNaturel(milieu) {
  const t = getMilieuType(milieu);
  return t !== 'piscine' && t !== 'fosse';
}

/**
 * Vrai quand les règles du milieu naturel s'appliquent (A322-98) : mer / lac /
 * carrière, mais aussi piscine ou fosse de plus de 6 m. Une fosse de
 * profondeur inconnue est présumée de plus de 6 m, une piscine non (même
 * présomption que isBassinDerogation).
 * @param {{ milieu?: string|null, site_prof_max?: number|string|null }} answers
 * @returns {boolean}
 */
export function reglesMilieuNaturel(answers) {
  if (isMilieuNaturel(answers.milieu)) return true;
  const siteMax = Number(answers.site_prof_max);
  if (siteMax > 0) return siteMax > CDS.LIMITS.BASSIN_DEROGATION_MAX;
  return getMilieuType(answers.milieu) === 'fosse';
}
