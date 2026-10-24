// @ts-check
// DP Assistant — Niveau d'encadrement selon le cadre de la plongée.
//
// Un encadrant peut tenir ses prérogatives de deux sources :
// - ses brevets fédéraux (MF1 = E3, MF2 / BEPPA = E4), valables dans le
//   cadre associatif : c'est `niveau_encadrant` ;
// - son diplôme d'État (annexe III-15 b) : `diplome_pro`, seul valable
//   quand il encadre contre rémunération, en structure commerciale (SCA).
// Le DEJEPS seul donne E3 ; complété du certificat complémentaire (obtenu à
// la demande par équivalence avec le MF2) ou obtenu avant la réforme, E4.
//
// Exemple : MF1 + BEPPA + DEJEPS sans CC → E4 en club, E3 en SCA.
// En SCA, seul le titulaire d'un diplôme d'État peut être DP (L212-1) : ni un
// P5 / DPE, ni un enseignant fédéral (E1 → E4) sans diplôme pro. En club, N5
// et E1 → E4 dirigent selon leurs prérogatives (III-15 a).
// Portage PHP : backend/lib/Encadrement.php.

import { CDS } from './cds-tables.js';

/** @typedef {import('./types.js').Diver} Diver */

/** Diplômes professionnels : code stocké → libellé et niveau E (III-15 b). */
export const DIPLOMES_PRO = Object.freeze({
  BEES1: { label: 'BEES1', level: 'E3' },
  BEES2: { label: 'BEES2', level: 'E4' },
  DEJEPS: { label: 'DEJEPS E3', level: 'E3' },
  'DEJEPS-E4': { label: 'DEJEPS E4 (CC ou avant réforme)', level: 'E4' },
  DESJEPS: { label: 'DESJEPS', level: 'E4' },
  Autre: { label: 'Autre', level: null },
});

/**
 * @param {string|null|undefined} code
 * @returns {string} libellé affichable ('' sans diplôme)
 */
export function diplomeProLabel(code) {
  if (!code) return '';
  return DIPLOMES_PRO[/** @type {keyof typeof DIPLOMES_PRO} */ (code)]?.label || code;
}

/**
 * @param {string|null|undefined} code
 * @returns {string|null} niveau E donné par le diplôme pro, null si aucun
 */
export function diplomeProLevel(code) {
  if (!code) return null;
  return DIPLOMES_PRO[/** @type {keyof typeof DIPLOMES_PRO} */ (code)]?.level || null;
}

/**
 * Cadre professionnel : la structure est commerciale (SCA).
 * @param {string|null|undefined} structureType
 * @returns {boolean}
 */
export function isCadrePro(structureType) {
  return structureType === 'sca';
}

const rank = (/** @type {string|null|undefined} */ lvl) =>
  CDS.ENS_RANK[/** @type {keyof typeof CDS.ENS_RANK} */ (lvl || '')] || 0;

/**
 * Niveau encadrant retenu dans le cadre de la plongée.
 * - Associatif : le plus élevé du niveau fédéral et du diplôme pro.
 * - Pro : le niveau du diplôme pro ; sans diplôme pro qualifiant, le niveau
 *   fédéral (l'app ne sait pas si l'encadrant est rémunéré).
 * @param {Partial<Diver>|null|undefined} diver
 * @param {boolean} cadrePro
 * @returns {string|null}
 */
export function encadrantLevel(diver, cadrePro) {
  const ne = diver?.niveau_encadrant || null;
  const pro = diplomeProLevel(diver?.diplome_pro);
  if (!pro) return ne;
  if (cadrePro) return pro;
  return rank(pro) > rank(ne) ? pro : ne;
}

/**
 * Candidat DP (N5, E1 → E4) sans diplôme professionnel en structure
 * commerciale : il ne peut pas être directeur de plongée (L212-1). « Autre »
 * compte comme diplôme (BPJEPS…).
 * @param {Partial<Diver>|null|undefined} diver
 * @param {boolean} cadrePro
 * @returns {boolean}
 */
export function dpDiplomeProRequis(diver, cadrePro) {
  const ne = /** @type {keyof typeof CDS.DP_QUALIF} */ (diver?.niveau_encadrant || '');
  return cadrePro && !!CDS.DP_QUALIF[ne] && !diver?.diplome_pro;
}

/**
 * Plongeur tel que vu par les règles de la plongée : `niveau_encadrant`
 * remplacé par le niveau du cadre. La valeur saisie à l'annuaire reste dans
 * `niveau_encadrant_annuaire` (relue par diverToForm avant toute écriture).
 * `dp_diplome_pro_requis` signale un candidat DP sans diplôme pro en SCA
 * (refusé comme DP par validatePal). Renvoie l'objet d'origine quand rien ne
 * change.
 * @template {Partial<Diver>} T
 * @param {T} diver
 * @param {boolean} cadrePro
 * @returns {T}
 */
export function diverForCadre(diver, cadrePro) {
  const level = encadrantLevel(diver, cadrePro);
  const levelChanged = level !== (diver.niveau_encadrant || null);
  const dpRefuse = dpDiplomeProRequis(diver, cadrePro);
  if (!levelChanged && !dpRefuse) return diver;
  return {
    ...diver,
    ...(levelChanged && { niveau_encadrant: level, niveau_encadrant_annuaire: diver.niveau_encadrant || null }),
    ...(dpRefuse && { dp_diplome_pro_requis: true }),
  };
}
