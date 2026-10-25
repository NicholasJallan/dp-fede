// @ts-check
// DP Assistant — Juridiction réglementaire d'une plongée.
//
// 'FR' : Code du sport ; 'PF' : Polynésie française (loi du pays
// n° 2017-44, arrêté n° 199 CM). La réglementation applicable est celle du
// LIEU : le pays du site prime, la juridiction du club ne sert que de repli
// quand ce pays est inconnu (site saisi hors ligne, ancien site).
// Portage PHP : backend/lib/Jurisdiction.php, cas communs dans
// tests/fixtures/jurisdiction.json.

/** @typedef {'FR'|'PF'} Jurisdiction */

export const JURISDICTIONS = Object.freeze(/** @type {const} */ (['FR', 'PF']));
export const DEFAULT_JURISDICTION = 'FR';

// Codes pays (ISO 3166 alpha-2 et alpha-3) de la Polynésie française.
const PF_COUNTRY_CODES = Object.freeze(['PF', 'PYF']);

/** @param {unknown} value */
const upperTrimmed = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

/**
 * @param {unknown} value
 * @returns {Jurisdiction|null}
 */
export function normalizeJurisdiction(value) {
  const v = upperTrimmed(value);
  return v === 'FR' || v === 'PF' ? v : null;
}

/**
 * Juridiction d'un pays de site ; null si le pays est inconnu.
 * @param {string|null|undefined} paysCode
 * @returns {Jurisdiction|null}
 */
export function jurisdictionForCountry(paysCode) {
  const code = upperTrimmed(paysCode);
  if (!code) return null;
  return PF_COUNTRY_CODES.includes(code) ? 'PF' : 'FR';
}

/**
 * @param {string|null|undefined} paysCode
 * @param {unknown} clubJurisdiction
 * @returns {Jurisdiction}
 */
export function resolveJurisdiction(paysCode, clubJurisdiction) {
  return jurisdictionForCountry(paysCode) ?? normalizeJurisdiction(clubJurisdiction) ?? DEFAULT_JURISDICTION;
}
