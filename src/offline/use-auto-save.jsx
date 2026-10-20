// DP Assistant — Hook useAutoSave : debounce + flush vers api.dives.update
//
// Usage :
//   const flushSave = useAutoSave({
//     diveId, user, plongeeFigee,
//     answers, palanquees, checked, comments,
//     pressions, realises, heuresDebut, heuresFin,
//   });
//   // flushSave(diveId) force un envoi immédiat (avant unmount / navigation).
//
// Garde-fou anti-écrasement : le premier état observé pour une plongée
// (celui issu du chargement) sert de référence et n'est JAMAIS renvoyé.
// Seule une modification réelle de l'utilisateur déclenche un envoi. Sans
// ça, une plongée chargée vide (ex. hors-ligne) écrasait la version serveur.

import { useEffect, useRef, useCallback } from 'react';
import { api } from '../api/api.js';

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

function serialize(s) {
  return JSON.stringify(s);
}

function buildPatch(s) {
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

export function useAutoSave(state) {
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
  // { diveId, json } du dernier état connu côté stockage (chargé ou envoyé).
  const savedRef = useRef({ diveId: null, json: null });

  const send = useCallback((id, s, json) => {
    savedRef.current = { diveId: id, json };
    return api.dives.update(id, buildPatch(s))
      .catch(err => console.error('[DP] auto-save :', err?.message || err));
  }, []);

  // Debounce 500 ms vers le serveur.
  useEffect(() => {
    if (!user || !diveId || plongeeFigee) return;
    const json = serialize(stateRef.current);
    if (savedRef.current.diveId !== diveId) {
      // Premier rendu de cette plongée : état de référence, pas d'envoi.
      savedRef.current = { diveId, json };
      return;
    }
    if (savedRef.current.json === json) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => send(diveId, stateRef.current, json), 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin, diveId, user, plongeeFigee, send]);

  // Flush immédiat — appelé avant unmount / navigation entre plongées.
  // N'envoie rien si l'état n'a pas changé depuis le chargement.
  const flushSave = useCallback((forcedDiveId) => {
    const id = forcedDiveId || diveId;
    if (!id) return Promise.resolve();
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const json = serialize(stateRef.current);
    if (savedRef.current.diveId === id && savedRef.current.json === json) return Promise.resolve();
    if (savedRef.current.diveId !== id) return Promise.resolve();
    return send(id, stateRef.current, json);
  }, [diveId, send]);

  return flushSave;
}
