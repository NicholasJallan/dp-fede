// @ts-check
// DP Assistant — Numéros d'urgence selon le pays et le milieu.

export function getEmergencyInfo(paysCode, milieu) {
  const isMer = milieu && /^en mer$/i.test((milieu || '').trim());
  if (paysCode === 'CH') {
    return {
      secondaryNums: '1414 (REGA · évacuation aérienne) · 117 (Police) · 112 (Europe)',
      vhf: null,
    };
  }
  if (paysCode === 'FR') {
    const parts = ['15 (SAMU)', '112 (Europe)'];
    if (isMer) parts.push('196 (CROSS)');
    return {
      secondaryNums: parts.join(' · '),
      vhf: isMer ? 'Canal 16 (CROSS)' : null,
    };
  }
  const parts = ['112 (Europe)'];
  if (isMer) parts.push('196 (CROSS)');
  parts.push('15 (SAMU FR)', '18 (Pompiers FR)', '144 (CH)', '1414 (REGA CH)');
  return {
    secondaryNums: parts.join(' · '),
    vhf: isMer ? 'Canal 16' : null,
  };
}

// Numéro principal (bouton URGENCE, fiche) selon le pays du site. Pays
// inconnu : numéro réglé par le club, sinon 112 (valable dans toute l'Europe).
export const URGENCE_PAR_PAYS = Object.freeze({ CH: '144', FR: '18' });
export const URGENCE_INCONNUE = '112';

const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * @param {string | null | undefined} paysCode
 * @param {string | null | undefined} clubDefault
 * @returns {string}
 */
export function defaultUrgenceNumber(paysCode, clubDefault) {
  return URGENCE_PAR_PAYS[paysCode || ''] || trimmed(clubDefault) || URGENCE_INCONNUE;
}

/**
 * Numéro d'urgence d'une plongée : la saisie du DP (`manual`) est conservée,
 * sinon le numéro suit le pays du site, même après un changement de site.
 * @param {{ paysCode?: string | null, clubDefault?: string | null, current?: string | null, manual?: boolean }} p
 * @returns {string}
 */
export function resolveUrgenceNumber({ paysCode, clubDefault, current, manual }) {
  if (manual === true && trimmed(current)) return trimmed(current);
  return defaultUrgenceNumber(paysCode, clubDefault);
}
