// @ts-check
// DP Assistant — Rôles d'une palanquée au sens de l'arrêté n° 199 CM
// (aptitudes PE/PA, fonctions ENS/GP/DP), partagés par pf-rules.js et
// pf-gas-rules.js.

export const DP_RANK = Object.freeze(['DP-40', 'DP-60', 'DP-70', 'DP-100', 'DP-120']);

/** Niveau d'un code « XX-nn » (ENS-06 → 6, GP-50 → 50, PE-20 → 20) ; 0 sinon. */
export const level = (code, prefix) =>
  typeof code === 'string' && code.startsWith(`${prefix}-`) ? Number(code.slice(prefix.length + 1)) : 0;
export const ensLevel = (role) => level(role, 'ENS');
export const gpLevel = (role) => level(role, 'GP');
export const airLevel = (role) => level(role, 'PE') || level(role, 'PA');
export const isEncadrantRole = (role) => ensLevel(role) > 0 || gpLevel(role) > 0;
export const isNovice = (role) => role === 'Baptême' || role === 'Débutant';

/** Le profil porte une fonction DP au moins égale à `required`. */
export const hasDp = (profile, required) =>
  !!profile && profile.fonctions.some((f) => DP_RANK.indexOf(f) >= DP_RANK.indexOf(required));

/** Le profil porte toutes les aptitudes et tous les mélanges demandés. */
export const hasAll = (profile, aptitudes = [], gaz = []) =>
  !!profile && aptitudes.every((a) => profile.aptitudes.includes(a)) && gaz.every((g) => profile.gaz.includes(g));

/** Membre au rôle le plus élevé (le premier en cas d'égalité). */
export const best = (membres, levelOf) =>
  membres.reduce((acc, m) => (!acc || levelOf(m.aptitude) > levelOf(acc.aptitude) ? m : acc), null);
