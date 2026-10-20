// @ts-check
// DP Assistant — Ordonnancement des membres sur la fiche de sécurité.

/** @typedef {import('./types.js').PalMembre} PalMembre */

/**
 * Tri canonique des membres d'une palanquée pour la fiche de sécurité.
 * E4→E1, GP, PE60→PE20, PTH120→PTH70, PA, Baptême.
 * Cas particulier : 2+ GP → le second GP devient serre-file (fin de liste).
 * @param {PalMembre[]} membres
 * @returns {PalMembre[]}
 */
export function sortMembresForFiche(membres) {
  const priorityOf = (apt) => {
    switch (apt) {
      case 'E4': return 0;
      case 'E3': return 1;
      case 'E2': return 2;
      case 'E1': return 3;
      case 'GP': return 4;
      case 'PE60': return 5;
      case 'PE40': return 6;
      case 'PE20': return 7;
      case 'PE12': return 7;
      case 'PTH120': return 8;
      case 'PTH70': return 9;
      case 'PA12': case 'PA20': case 'PA40': case 'PA60': return 10; // pas de tri interne
      case 'Baptême': return 11;
      default: return 99;
    }
  };
  const sorted = [...membres].sort((a, b) =>
    priorityOf(a.aptitude || '') - priorityOf(b.aptitude || '')
  );
  // 2 GP : le dernier GP du bloc devient serre-file (déplacé en queue)
  const gpCount = sorted.filter(m => m.aptitude === 'GP').length;
  if (gpCount >= 2) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].aptitude === 'GP') {
        const sf = sorted.splice(i, 1)[0];
        sorted.push(sf);
        break;
      }
    }
  }
  return sorted;
}
