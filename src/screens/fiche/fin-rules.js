// DP Assistant — Règles de saisie de la fin de plongée (pures, testées) :
// durée ≤ temps écoulé depuis l'entrée, profondeur ≤ maximum du site,
// DTR réalisée ≤ durée de plongée.

const toInt = (v) => parseInt(v, 10);

// Durée bornée au temps écoulé ; la DTR suit si elle dépasse la nouvelle durée.
export function applyDuree(form, raw, maxElapsed) {
  const v = toInt(raw);
  const duree = (maxElapsed !== null && v > maxElapsed) ? String(maxElapsed) : raw;
  const d = toInt(duree), dtr = toInt(form.dtr);
  return { ...form, duree, dtr: (isFinite(dtr) && isFinite(d) && dtr > d) ? String(d) : form.dtr };
}

export function applyProf(form, raw, siteMax) {
  const v = toInt(raw);
  return { ...form, profMax: (siteMax && isFinite(v) && v > siteMax) ? String(siteMax) : raw };
}

export function applyDtr(form, raw) {
  const v = toInt(raw), max = toInt(form.duree);
  return { ...form, dtr: (isFinite(max) && isFinite(v) && v > max) ? String(max) : raw };
}
