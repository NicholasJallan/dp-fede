// @ts-check
// DP Assistant — Polynésie française : fonctions de l'interface des
// palanquées (rôles proposés, plafonds de profondeur, mélanges permis, DP),
// pendant de getDiverAptitudes / computePalHardLimit / getDpMaxDepth /
// getAvailableMelanges côté Code du sport. Exposées par rulesFor('PF').

import { FORMATION_MAX_PAR_ROLE } from './pf-rules.js';
import { pfProfile } from './pf-profile.js';
import { ensLevel, gpLevel, hasDp, isEncadrantRole, isNovice, level } from './pf-roles.js';

const AIR_MAX = 50; // art. 4
const AIR_FORMATION_MAX = 60; // art. 4 et 26
const TRIMIX_MAX = 120; // art. 4
const BAPTEME_MAX = 6; // art. 25
const DEBUTANT_MAX = 12; // annexe XI

const finite = (n) => (Number.isFinite(n) ? n : Infinity);

/**
 * Rôles qu'un plongeur peut prendre dans une palanquée : ses aptitudes et ses
 * fonctions d'encadrement (ENS, GP) ; sans aucune aptitude, baptême ou débutant.
 * @param {any} diver
 * @returns {string[]}
 */
export function pfRolesFor(diver) {
  const profile = pfProfile(diver);
  const encadrement = profile.fonctions.filter((f) => ensLevel(f) > 0 || gpLevel(f) > 0);
  return profile.aptitudes.length === 0
    ? ['Baptême', 'Débutant', ...encadrement]
    : [...profile.aptitudes, ...encadrement];
}

/** Profondeur maximale permise par un rôle (Infinity pour un encadrant). */
export function pfRoleMaxDepth(role, mode) {
  if (isEncadrantRole(role)) return Infinity;
  if (mode === 'enseignement') return FORMATION_MAX_PAR_ROLE[role] ?? 0;
  if (role === 'Baptême') return BAPTEME_MAX;
  if (role === 'Débutant') return DEBUTANT_MAX;
  return level(role, 'PE') || level(role, 'PA');
}

/**
 * Profondeur maximale qu'un DP peut diriger (0 : il ne le peut pas).
 * Formation à 6 m : DP-40, ou un enseignant en espace aquatique restreint
 * (art. 7, contrôlé finement par validatePalPf).
 */
export function pfDpMaxDepth(mode, dp, melanges) {
  if (!dp) return 0;
  const profile = pfProfile(dp);
  if ((melanges || []).includes('Tx')) {
    if (hasDp(profile, 'DP-120')) return 120;
    if (hasDp(profile, 'DP-100')) return 100;
    return hasDp(profile, 'DP-70') ? 70 : 0;
  }
  if (hasDp(profile, 'DP-60')) return AIR_MAX;
  if (mode === 'enseignement') {
    return hasDp(profile, 'DP-40') || profile.fonctions.some((f) => ensLevel(f) > 0) ? BAPTEME_MAX : 0;
  }
  return hasDp(profile, 'DP-40') ? 40 : 0;
}

/**
 * Plafond de profondeur d'une palanquée : rôles des plongeurs, gaz, DP,
 * session et site.
 */
export function pfPalHardLimit({ membres, dp, melanges, mode, derogation, sessionMax, siteMax }) {
  const trimix = (melanges || []).includes('Tx');
  const derog = mode === 'enseignement' && !!derogation;
  const roles = (membres || []).map((m) => m.aptitude).filter((r) => r && !isEncadrantRole(r));
  // Dérogation (art. 26, ann. XI note f) : les élèves admis dans l'espace
  // 0-50 m peuvent descendre jusqu'à 60 m.
  const roleMax = (r) => {
    const max = pfRoleMaxDepth(r, mode);
    return derog && max >= AIR_MAX ? AIR_FORMATION_MAX : max;
  };
  const roleLimit = trimix || roles.length === 0 ? Infinity : Math.min(...roles.map(roleMax));
  const gasLimit = trimix ? TRIMIX_MAX : derog ? AIR_FORMATION_MAX : AIR_MAX;
  let dpLimit = pfDpMaxDepth(mode, dp, melanges) || Infinity;
  if (derog && dpLimit === AIR_MAX) dpLimit = AIR_FORMATION_MAX;
  return Math.min(roleLimit, gasLimit, dpLimit, finite(sessionMax), finite(siteMax));
}

/** Mode de la palanquée (baptême ou débutant : formation, art. 25). */
export function pfPalMode(pal) {
  const roles = (pal?.membres || []).map((m) => m.aptitude);
  if (roles.some(isNovice)) return 'enseignement';
  if (pal?.mode === 'enseignement' || pal?.mode === 'exploration') return pal.mode;
  return roles.some((r) => ensLevel(r) > 0) ? 'enseignement' : 'exploration';
}

/** Type affiché : 'bapteme' | 'formation' | 'guidee' | 'exploration'. */
export function pfPalType(membres, mode) {
  const list = membres || [];
  if (list.some((m) => m._bapteme || m.aptitude === 'Baptême')) return 'bapteme';
  if (mode === 'enseignement') return 'formation';
  return list.some((m) => isEncadrantRole(m.aptitude)) ? 'guidee' : 'exploration';
}

/** Mélanges que le DP peut autoriser (même forme que getAvailableMelanges). */
export function pfAvailableMelanges(dp) {
  const profile = dp ? pfProfile(dp) : null;
  const gaz = profile?.gaz || [];
  return [
    { value: 'Air', allowed: true, reason: null },
    { value: 'Nx ≤ 40%', allowed: gaz.includes('PN'), reason: 'DP doit être PN' },
    { value: 'Nx > 40%', allowed: gaz.includes('PN-C'), reason: 'DP doit être PN-C' },
    { value: 'Tx', allowed: hasDp(profile, 'DP-70'), reason: 'DP doit être DP-70 (PTH-70)' },
  ];
}

/** Peut être désigné DP : une fonction DP, ou un enseignant (espace aquatique restreint). */
export function pfIsDpCandidate(diver) {
  return pfProfile(diver).fonctions.some((f) => level(f, 'DP') > 0 || ensLevel(f) > 0);
}

export const pfIsEnseignantRole = (role) => ensLevel(role) > 0;
