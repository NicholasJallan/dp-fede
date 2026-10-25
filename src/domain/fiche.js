// @ts-check
// DP Assistant — Ordonnancement des membres sur la fiche de sécurité.

/** @typedef {import('./types.js').PalMembre} PalMembre */

// Rôles de la Polynésie, au rang de leurs équivalents (plus élevé d'abord).
const PF_PRIORITY = Object.freeze({
  'ENS-50': 0,
  'ENS-40': 0.5,
  'ENS-30': 1,
  'ENS-20': 2,
  'ENS-06': 3,
  'GP-50': 4,
  'GP-40': 4.5,
  'PE-50': 5,
  'PE-40': 6,
  'PE-30': 6.5,
  'PE-20': 7,
  'PE-12': 7.5,
  'PA-12': 10,
  'PA-20': 10,
  'PA-30': 10,
  'PA-40': 10,
  'PA-50': 10,
  Débutant: 10.5,
});

const isGp = (apt) => apt === 'GP' || (typeof apt === 'string' && apt.startsWith('GP-'));

/**
 * Tri canonique des membres d'une palanquée pour la fiche de sécurité.
 * E4→E1, GP, PE60→PE20, PTH120→PTH70, PA, Baptême ; rôles de la Polynésie
 * (arrêté n° 199 CM) aux mêmes rangs : ENS-50→ENS-06, GP-50/40, PE-50→PE-12,
 * PA-xx, Débutant.
 * Cas particulier : 2+ GP → le second GP devient serre-file (fin de liste).
 * @param {PalMembre[]} membres
 * @returns {PalMembre[]}
 */
export function sortMembresForFiche(membres) {
  const priorityOf = (apt) => {
    switch (apt) {
      case 'E4':
        return 0;
      case 'E3':
        return 1;
      case 'E2':
        return 2;
      case 'E1':
        return 3;
      case 'GP':
        return 4;
      case 'PE60':
        return 5;
      case 'PE40':
        return 6;
      case 'PE20':
        return 7;
      case 'PE12':
        return 7;
      case 'PTH120':
        return 8;
      case 'PTH70':
        return 9;
      case 'PA12':
      case 'PA20':
      case 'PA40':
      case 'PA60':
        return 10; // pas de tri interne
      case 'Baptême':
        return 11;
      default:
        return PF_PRIORITY[apt] ?? 99;
    }
  };
  const sorted = [...membres].sort((a, b) => priorityOf(a.aptitude || '') - priorityOf(b.aptitude || ''));
  // 2 GP : le dernier GP du bloc devient serre-file (déplacé en queue)
  const gpCount = sorted.filter((m) => isGp(m.aptitude)).length;
  if (gpCount >= 2) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (isGp(sorted[i].aptitude)) {
        const sf = sorted.splice(i, 1)[0];
        sorted.push(sf);
        break;
      }
    }
  }
  return sorted;
}
