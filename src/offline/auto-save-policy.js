// DP Assistant — Décisions de l'auto-save (pures, testées) : patch envoyé et
// quand l'envoyer. Une plongée figée (archivée, ou en cours d'archivage) ne
// pousse plus rien : le serveur refuse tout render_state différent sur une
// plongée archivée (422 ARCHIVED_IMMUTABLE) et l'archivage envoie lui-même
// l'état final (src/screens/screen-archive.jsx).

// Champs `answers` également stockés en colonnes top-level de `dives` (liste
// sans parser le JSON) : recopiés au moment du save.
function summarize(answers) {
  const summary = {};
  if (answers.site_nom) summary.site_nom    = answers.site_nom;
  if (answers.dp_nom)   summary.dp_nom      = answers.dp_nom;
  if (answers.dp_qual)  summary.dp_qual     = answers.dp_qual;
  if (answers.date)   { summary.date_plongee = answers.date; summary.planned_at = answers.date; }
  return summary;
}

export function buildAutoSavePatch(s) {
  return {
    answers:      s.answers,
    palanquees:   s.palanquees,
    render_state: {
      checked: s.checked, comments: s.comments,
      pressions: s.pressions, realises: s.realises,
      heuresDebut: s.heuresDebut, heuresFin: s.heuresFin,
    },
    ...summarize(s.answers),
  };
}

/**
 * Envoi différé (debounce) : 'skip' | 'baseline' (premier état observé de la
 * plongée, jamais renvoyé) | 'send'.
 * @param {{ user: any, diveId: string|null, plongeeFigee: boolean,
 *           saved: { diveId: string|null, json: string|null }, json: string }} s
 */
export function autoSaveAction({ user, diveId, plongeeFigee, saved, json }) {
  if (!user || !diveId || plongeeFigee) return 'skip';
  if (saved.diveId !== diveId) return 'baseline';
  return saved.json === json ? 'skip' : 'send';
}

/**
 * Envoi immédiat (retour accueil, bascule de plongée) : 'skip' | 'send'.
 * @param {{ diveId: string|null, plongeeFigee: boolean,
 *           saved: { diveId: string|null, json: string|null }, json: string }} s
 */
export function flushAction({ diveId, plongeeFigee, saved, json }) {
  if (!diveId || plongeeFigee) return 'skip';
  if (saved.diveId !== diveId) return 'skip';
  return saved.json === json ? 'skip' : 'send';
}
