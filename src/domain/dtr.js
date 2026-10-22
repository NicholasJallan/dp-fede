// @ts-check
// DP Assistant — DTR prévue proposée par défaut.
//
// Minimum : 1 min par tranche de 10 m entamée. Le DP peut la relever
// (paliers, remontée lente) ; elle n'est jamais rabaissée sous ce minimum
// lorsque la profondeur change.

/**
 * DTR minimale (min) pour une profondeur prévue.
 * @param {number | null | undefined} profMax
 * @returns {number}
 */
export function minDtr(profMax) {
  return Math.ceil((Number(profMax) || 0) / 10);
}

/**
 * DTR prévue après un changement de profondeur : suit le minimum tant que le
 * DP ne l'a pas relevée, sinon conservée et au moins égale au minimum.
 * @param {number | null | undefined} dtr      DTR prévue actuelle
 * @param {number | null | undefined} oldProf  Profondeur prévue précédente
 * @param {number | null | undefined} newProf  Nouvelle profondeur prévue
 * @returns {number}
 */
export function dtrForProf(dtr, oldProf, newProf) {
  const min = minDtr(newProf);
  if (dtr == null || dtr === minDtr(oldProf)) return min;
  return Math.max(dtr, min);
}
