// @ts-check
// DP Assistant — Paliers de décompression réalisés (fiche de sécurité, A322-72).
//
// Saisis en fin de plongée de chaque palanquée (modale « Sortie de l'eau »),
// stockés dans render_state.realises[palId] :
//   paliers : { 9: 'min', 6: 'min', 3: 'min' }   (tranches de 3 m, facultatif)
//   confort : { on: bool, profondeur: 'm', duree: 'min' }  (palier de sécurité
//             non obligatoire)
// Le résumé est imprimé sur la fiche (web et PDF serveur : backend
// PdfRender::formatPaliers, même format).

export const PALIER_DEPTHS = /** @type {const} */ ([9, 6, 3]);
export const CONFORT_DEFAULT_DEPTH = '3';

const positive = (v) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Champs paliers d'un formulaire de fin, complétés depuis une saisie précédente. */
export function initialPaliers(previous) {
  return {
    paliers: { 9: '', 6: '', 3: '', ...(previous?.paliers || {}) },
    confort: { on: false, profondeur: CONFORT_DEFAULT_DEPTH, duree: '', ...(previous?.confort || {}) },
  };
}

/** Paliers réellement effectués, dans l'ordre de la remontée : [[profondeur, minutes]]. */
export function paliersDone(real) {
  if (!real) return [];
  const out = PALIER_DEPTHS
    .filter(d => positive(real.paliers?.[d]) > 0)
    .map(d => [d, positive(real.paliers[d])]);
  return out;
}

/** Durée totale passée aux paliers (obligatoires + confort), en minutes. */
export function paliersTotal(real) {
  const deco = paliersDone(real).reduce((n, [, m]) => n + m, 0);
  const confort = real?.confort?.on ? positive(real.confort.duree) : 0;
  return deco + confort;
}

/**
 * Résumé imprimable : « 6 m 2 min · 3 m 5 min · confort 5 m 3 min », ou null
 * si aucun palier n'a été saisi.
 */
export function formatPaliers(real) {
  if (!real) return null;
  const parts = paliersDone(real).map(([d, m]) => `${d} m ${m} min`);
  if (real.confort?.on && positive(real.confort.duree) > 0) {
    const depth = positive(real.confort.profondeur);
    parts.push(`confort ${depth > 0 ? `${depth} m ` : ''}${positive(real.confort.duree)} min`);
  }
  return parts.length ? parts.join(' · ') : null;
}
