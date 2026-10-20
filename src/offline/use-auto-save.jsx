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
// Plongée figée (plongeeFigee : archivée ou en cours d'archivage) : plus
// aucun envoi, ni différé ni immédiat — le serveur refuse un render_state
// modifié sur une fiche archivée (422 ARCHIVED_IMMUTABLE) ; l'archivage
// envoie lui-même l'état final. Décisions : ./auto-save-policy.js (testées).
//
// Garde-fou anti-écrasement : le premier état observé pour une plongée
// (celui issu du chargement) sert de référence et n'est JAMAIS renvoyé.
// Seule une modification réelle de l'utilisateur déclenche un envoi. Sans
// ça, une plongée chargée vide (ex. hors-ligne) écrasait la version serveur.

import { useEffect, useRef, useCallback } from 'react';
import { api } from '../api/api.js';
import { autoSaveAction, flushAction, buildAutoSavePatch } from './auto-save-policy.js';

function serialize(s) {
  return JSON.stringify(s);
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
  // Lu par flushSave au moment de l'appel (pas de fermeture périmée).
  const figeeRef = useRef(plongeeFigee);
  figeeRef.current = plongeeFigee;
  // { diveId, json } du dernier état connu côté stockage (chargé ou envoyé).
  const savedRef = useRef({ diveId: null, json: null });

  const send = useCallback((id, s, json) => {
    savedRef.current = { diveId: id, json };
    return api.dives.update(id, buildAutoSavePatch(s))
      .catch(err => console.error('[DP] auto-save :', err?.message || err));
  }, []);

  // Debounce 500 ms vers le serveur.
  useEffect(() => {
    const json = serialize(stateRef.current);
    const action = autoSaveAction({ user, diveId, plongeeFigee, saved: savedRef.current, json });
    if (action === 'baseline') {
      // Premier rendu de cette plongée : état de référence, pas d'envoi.
      savedRef.current = { diveId, json };
      return;
    }
    if (action !== 'send') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => send(diveId, stateRef.current, json), 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin, diveId, user, plongeeFigee, send]);

  // Flush immédiat — appelé avant unmount / navigation entre plongées.
  // N'envoie rien si l'état n'a pas changé depuis le chargement, ni pour une
  // plongée figée.
  const flushSave = useCallback((forcedDiveId) => {
    const id = forcedDiveId || diveId;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const json = serialize(stateRef.current);
    if (flushAction({ diveId: id, plongeeFigee: figeeRef.current, saved: savedRef.current, json }) !== 'send') {
      return Promise.resolve();
    }
    return send(id, stateRef.current, json);
  }, [diveId, send]);

  return flushSave;
}
