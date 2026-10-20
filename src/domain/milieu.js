// @ts-check
// DP Assistant — Normalisation du milieu de plongée (mer / lac / piscine / fosse).

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
  if (m.includes('fosse'))   return 'fosse';
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
