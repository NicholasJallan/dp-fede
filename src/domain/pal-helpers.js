// @ts-check
// DP Assistant — Helpers de validation d'une palanquée : rangs d'aptitude,
// qualifications mélanges, âge, espaces d'évolution et contexte (mode,
// encadrant, gaz) consommé par les règles de ./pal-rules.js.
//
// Module pur (sans React ni DOM). Ne dépend que des tableaux réglementaires
// et du milieu : ./aptitudes.js peut l'importer sans cycle.

import { CDS } from './cds-tables.js';
import { getMilieuType } from './milieu.js';

export const ENS_LEVELS = ['E1', 'E2', 'E3', 'E4'];
export const tables = () => CDS;

// ── Helpers d'aptitude ──────────────────────────────────────────────────

/** Niveau enseignant le plus élevé parmi les membres ('E1'..'E4' ou null). */
export function getMaxEnsLevel(membres) {
  let maxIdx = -1;
  for (const m of membres || []) {
    const idx = ENS_LEVELS.indexOf(m.aptitude);
    if (idx > maxIdx) maxIdx = idx;
  }
  return maxIdx >= 0 ? ENS_LEVELS[maxIdx] : null;
}

/** PE12/PE20/PE40/PE60 → nombre, sinon null. */
export function peLevel(apt) {
  const m = /^PE(\d+)$/.exec(apt || '');
  return m ? parseInt(m[1], 10) : null;
}

/** PA12/PA20/PA40/PA60 → nombre, sinon null. */
export function paLevel(apt) {
  const m = /^PA(\d+)$/.exec(apt || '');
  return m ? parseInt(m[1], 10) : null;
}

/** Aptitude « air » d'un plongeur encadré ou autonome (PTH-xx ⇒ 60). */
export function airLevel(apt) {
  if (apt === 'PTH70' || apt === 'PTH120') return 60;
  return peLevel(apt) ?? paLevel(apt) ?? 0;
}

export function isEncadrantRole(apt) {
  return apt === 'GP' || ENS_LEVELS.includes(apt);
}

export function ensRank(apt) {
  return tables().ENS_RANK[apt] || 0;
}

/** Niveau d'enseignement de la PERSONNE (rôle choisi ou brevet détenu). */
export function personRank(m) {
  return Math.max(ensRank(m.aptitude), ensRank(m.diver?.niveau_encadrant));
}

/** Affichage canonique du nom d'un plongeur. */
export function diverFullName(d) {
  return `${d?.prenom || ''} ${(d?.nom || '').toUpperCase()}`.trim();
}

export function memberName(m) {
  return m._bapteme ? diverFullName(m) : diverFullName(m.diver);
}

export function memberId(m) {
  return m._bapteme ? m.id || '' : m.diverId || m.id || '';
}

export function isDebutant(m) {
  return !m._bapteme && !!m.diver && !m.diver.niveau_plongeur && !m.diver.niveau_encadrant;
}

function gasQualRank(diver) {
  const rank = tables().GAS_QUAL_RANK;
  const quals = [...(diver?.nitrox || []), ...(diver?.trimix || [])];
  return quals.reduce((max, q) => Math.max(max, rank[q] || 0), 0);
}

/**
 * Qualification mélange la plus élevée d'une liste (ex. `diver.trimix`), selon
 * GAS_QUAL_RANK et non l'ordre de saisie : ['PTH-120', 'PTH-70'] → 'PTH-120'.
 * @param {string[] | undefined} quals
 * @returns {string | null}
 */
export function highestGasQual(quals) {
  const rank = tables().GAS_QUAL_RANK;
  return (quals || []).reduce((best, q) => ((rank[q] || 0) > (rank[best] || 0) ? q : best), null);
}

/** Vrai si le plongeur justifie au moins la qualification mélange `req`. */
export function hasGasQual(diver, req) {
  return gasQualRank(diver) >= tables().GAS_QUAL_RANK[req];
}

/**
 * GP ou P4 au minimum (III-15 b : un E-2 est initiateur ET guide de
 * palanquée ; un P5 / DPE suppose le P4).
 */
export function isGpQualified(m) {
  if (m.aptitude === 'GP' || ['E2', 'E3', 'E4'].includes(m.aptitude)) return true;
  const d = m.diver || {};
  return ['N4', 'N5', 'E2', 'E3', 'E4'].includes(d.niveau_encadrant) || (d.aptitudes_sup || []).includes('GP');
}

export function ageAt(birthIso, when) {
  if (!birthIso) return null;
  const b = new Date(birthIso);
  if (isNaN(b.getTime())) return null;
  let age = when.getFullYear() - b.getFullYear();
  const beforeBirthday =
    when.getMonth() < b.getMonth() || (when.getMonth() === b.getMonth() && when.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Plus petit espace d'évolution du tableau qui contient `profMax`. */
export function spaceFor(profMax, table) {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  const hit = keys.find((k) => profMax <= k);
  return hit === undefined ? null : hit;
}

// ── Contexte de la palanquée ────────────────────────────────────────────

/**
 * Mode de la palanquée : 'enseignement' ou 'exploration' (A322-75).
 * Un baptême relève toujours de l'enseignement (III-16 a). Sinon le choix
 * explicite du DP (pal.mode) prime ; à défaut, la présence d'un enseignant
 * vaut enseignement.
 */
export function derivePalMode(pal) {
  const apts = (pal?.membres || []).map((m) => m.aptitude);
  if (apts.includes('Baptême')) return 'enseignement';
  if (pal?.mode === 'enseignement' || pal?.mode === 'exploration') return pal.mode;
  return apts.some((a) => ENS_LEVELS.includes(a)) ? 'enseignement' : 'exploration';
}

/**
 * Rôle des mélanges d'une palanquée. Un Nx > 40 % déclaré avec un autre gaz
 * (air, Nx ≤ 40 %, trimix) est un gaz de décompression : seul le gaz fond
 * (`pal.o2`) est soumis à la profondeur maximale d'utilisation.
 * @param {string[] | undefined} melanges
 */
export function palGas(melanges) {
  const list = melanges || [];
  const nx40 = list.includes('Nx ≤ 40%');
  const nx40plus = list.includes('Nx > 40%');
  const trimix = list.includes('Tx');
  const decoNitrox = nx40plus && (list.includes('Air') || nx40 || trimix);
  return {
    list,
    nitrox: nx40 || nx40plus,
    trimix,
    nx40plus,
    air: list.includes('Air') || list.length === 0,
    // Au trimix, le nitrox déclaré est un gaz de décompression.
    bottomNitrox: !trimix && (nx40 || (nx40plus && !decoNitrox)),
    // O₂ maximal du nitrox fond : ≤ 40 % sauf Nx > 40 % respiré au fond.
    bottomO2Max: nx40plus && !decoNitrox ? 100 : 40,
    decoNitrox,
  };
}

const gasOf = (pal) => palGas(pal.melanges);

/**
 * Ancienne saisie à champ O₂ unique : un O₂ > 40 % avec un autre gaz fond
 * était celui du gaz de déco — reporté dans `o2_deco`.
 * @param {{ melanges?: string[], o2?: number | null, o2_deco?: number | null }} pal
 */
export function withDecoO2(pal) {
  const o2 = Number(pal.o2);
  if (!palGas(pal.melanges).decoNitrox || pal.o2_deco != null || !(o2 > 40)) return pal;
  const { o2: _legacy, ...rest } = pal;
  return { ...rest, o2_deco: o2 };
}

/** A322-98 : piscine ou fosse dont la profondeur n'excède pas 6 m. */
export function isBassinDerogation(answers, profMax) {
  const type = getMilieuType(answers.milieu);
  if (type !== 'piscine' && type !== 'fosse') return false;
  const siteMax = Number(answers.site_prof_max);
  if (siteMax > 0) return siteMax <= tables().LIMITS.BASSIN_DEROGATION_MAX;
  // Profondeur du bassin inconnue : une fosse est présumée > 6 m (règles du
  // milieu naturel) ; une piscine est présumée ≤ 6 m si la plongée l'est.
  return type === 'piscine' && profMax <= tables().LIMITS.BASSIN_DEROGATION_MAX;
}

/** Encadrant de la palanquée : le plus qualifié pour le mode. */
function pickEncadrant(candidates, mode) {
  const score = (m) => {
    if (mode === 'enseignement') return personRank(m);
    return Math.max(personRank(m), isGpQualified(m) ? 2.5 : 0);
  };
  const eligible = mode === 'enseignement' ? candidates.filter((m) => ENS_LEVELS.includes(m.aptitude)) : candidates;
  return eligible.reduce((best, m) => (!best || score(m) > score(best) ? m : best), null);
}

export function resolveMembres(pal, diversById) {
  return (pal.membres || [])
    .map((m) => ({ ...m, diver: m._bapteme ? null : diversById[m.diverId] }))
    .filter((m) => m._bapteme || m.diver);
}

export function buildContext(pal, membres, answers, dp) {
  const profMax = Number(pal.profMax) || 0;
  const mode = derivePalMode(pal);
  const candidates = membres.filter((m) => isEncadrantRole(m.aptitude));
  const encadrant = pickEncadrant(candidates, mode);
  const gas = gasOf(pal);
  return {
    pal,
    answers,
    dp,
    membres,
    profMax,
    mode,
    gas,
    // III-17 b / III-18 b : au nitrox et au trimix, l'élève justifie déjà
    // l'aptitude PE de l'espace — pas de « formation vers » l'espace supérieur.
    bonusMode: mode === 'enseignement' && !gas.nitrox && !gas.trimix ? 'enseignement' : 'exploration',
    bassin: isBassinDerogation(answers, profMax),
    encadrant,
    extras: candidates.filter((m) => m !== encadrant),
    encadres: membres.filter((m) => !isEncadrantRole(m.aptitude)),
    date: answers.date ? new Date(answers.date) : new Date(),
  };
}
