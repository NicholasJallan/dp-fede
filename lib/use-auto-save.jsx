// DP Assistant — Hook useAutoSave : debounce + flush vers api.dives.update
//
// Avant : auto-save inline dans app.jsx (~50 lignes mêlées à 15 autres effets).
// Maintenant : hook isolé, testable, et la logique de "résumé" (champs
// hoistés en colonnes pour le list-view) est documentée.
//
// Usage :
//   const flushSave = useAutoSave({
//     diveId, user, plongeeFigee,
//     answers, palanquees, checked, comments,
//     pressions, realises, heuresDebut, heuresFin,
//   });
//   // flushSave(diveId) force un envoi immédiat (avant unmount / navigation).

(function (root) {
  const { useEffect, useRef, useCallback } = React;

  // Champs `answers` qui sont également stockés en colonnes top-level de
  // `dives` (pour l'affichage de la liste sans parser le JSON). On les
  // recopie au moment du save pour éviter une dérive d'affichage.
  function summarize(answers) {
    const summary = {};
    if (answers.site_nom) summary.site_nom    = answers.site_nom;
    if (answers.dp_nom)   summary.dp_nom      = answers.dp_nom;
    if (answers.dp_qual)  summary.dp_qual     = answers.dp_qual;
    if (answers.date)   { summary.date_plongee = answers.date; summary.planned_at = answers.date; }
    return summary;
  }

  function useAutoSave(state) {
    const {
      diveId, user, plongeeFigee,
      answers, palanquees, checked, comments,
      pressions, realises, heuresDebut, heuresFin,
    } = state;

    // Snapshot ref — mise à jour inline (PAS dans un useEffect) pour que
    // flushSave lise toujours l'état courant même si l'utilisateur quitte
    // la fiche juste après un setState.
    const stateRef = useRef({});
    stateRef.current = { answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin };

    const timerRef = useRef(null);

    // Debounce 500 ms vers le serveur.
    useEffect(() => {
      if (!user || !diveId || plongeeFigee) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        window.api.dives.update(diveId, {
          answers,
          palanquees,
          render_state: { checked, comments, pressions, realises, heuresDebut, heuresFin },
          ...summarize(answers),
        }).catch(err => console.warn('[DP] auto-save:', err?.message));
      }, 500);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin, diveId, user, plongeeFigee]);

    // Flush immédiat — appelé avant unmount / navigation entre plongées.
    const flushSave = useCallback((forcedDiveId) => {
      const id = forcedDiveId || diveId;
      if (!id) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      const s = stateRef.current;
      window.api.dives.update(id, {
        answers:      s.answers,
        palanquees:   s.palanquees,
        render_state: {
          checked: s.checked, comments: s.comments,
          pressions: s.pressions, realises: s.realises,
          heuresDebut: s.heuresDebut, heuresFin: s.heuresFin,
        },
        ...summarize(s.answers),
      }).catch(() => {});
    }, [diveId]);

    return flushSave;
  }

  const api = { useAutoSave, _summarize: summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
