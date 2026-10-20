// DP Assistant — Règles de saisie de la fin de plongée (pures, testées) :
// durée ≤ temps écoulé depuis l'entrée, profondeur ≤ maximum du site,
// DTR réalisée ≤ durée de plongée.

const toInt = (v) => parseInt(v, 10);

// Durée bornée au temps écoulé ; la DTR suit si elle dépasse la nouvelle durée.
export function applyDuree(form, raw, maxElapsed) {
  const v = toInt(raw);
  const duree = maxElapsed !== null && v > maxElapsed ? String(maxElapsed) : raw;
  const d = toInt(duree),
    dtr = toInt(form.dtr);
  return { ...form, duree, dtr: isFinite(dtr) && isFinite(d) && dtr > d ? String(d) : form.dtr };
}

export function applyProf(form, raw, siteMax) {
  const v = toInt(raw);
  return { ...form, profMax: siteMax && isFinite(v) && v > siteMax ? String(siteMax) : raw };
}

export function applyDtr(form, raw) {
  const v = toInt(raw),
    max = toInt(form.duree);
  return { ...form, dtr: isFinite(max) && isFinite(v) && v > max ? String(max) : raw };
}

// Paliers réalisés (minutes, tranches de 3 m) et palier de confort : bornes de
// saisie, valeur vide autorisée (palier non effectué).
export const PALIER_MAX_MIN = 99;
export const CONFORT_DEPTH = { min: 1, max: 12 };
export const CONFORT_MAX_MIN = 30;

const bounded = (raw, min, max) => {
  if (raw === '' || raw == null) return '';
  const v = toInt(raw);
  if (!isFinite(v)) return '';
  return String(Math.min(max, Math.max(min, v)));
};

export function applyPalier(form, depth, raw) {
  return { ...form, paliers: { ...form.paliers, [depth]: bounded(raw, 0, PALIER_MAX_MIN) } };
}

export function applyConfort(form, patch) {
  const next = { ...form.confort, ...patch };
  if ('profondeur' in patch) next.profondeur = bounded(patch.profondeur, CONFORT_DEPTH.min, CONFORT_DEPTH.max);
  if ('duree' in patch) next.duree = bounded(patch.duree, 0, CONFORT_MAX_MIN);
  return { ...form, confort: next };
}
