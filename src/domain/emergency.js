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
