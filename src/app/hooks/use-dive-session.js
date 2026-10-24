// DP Assistant — État mémoire de la plongée ouverte (réponses, palanquées,
// check-list, suivi temps réel) et ses mutateurs.

import { useState, useCallback, useRef } from 'react';

export function useDiveSession() {
  const [currentDiveId, setCurrentDiveId] = useState(null); // client_uuid de la plongée ouverte
  const [answers, setAnswers] = useState({});
  const [palanquees, setPalanquees] = useState([]);
  const [checked, setChecked] = useState({});
  const [comments, setComments] = useState({});
  const [pressions, setPressions] = useState({});
  const [realises, setRealises] = useState({});
  const [heuresDebut, setHeuresDebut] = useState({});
  // Instant exact (ms) de chaque mise à l'eau : chronomètre à la seconde.
  const [departs, setDeparts] = useState({});
  const [heuresFin, setHeuresFin] = useState({});
  const [plongeeFigee, setPlongeeFigee] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [archiveDone, setArchiveDone] = useState(false);
  // Nombre de palanquées démarrées connu : sert à détecter le 1er départ
  // (transition prepared → in_progress, cf. useDiveLifecycle).
  const startedCountRef = useRef(0);

  const setAnswer = useCallback((id, v) => setAnswers((prev) => ({ ...prev, [id]: v })), []);
  const updateChecked = useCallback((id, v) => setChecked((prev) => ({ ...prev, [id]: v })), []);
  const updateComment = useCallback((id, v) => setComments((prev) => ({ ...prev, [id]: v })), []);

  // Vide l'état mémoire (ne modifie pas currentDiveId)
  const resetDiveState = useCallback(() => {
    setAnswers({});
    setPalanquees([]);
    setChecked({});
    setComments({});
    setPressions({});
    setRealises({});
    setHeuresDebut({});
    setDeparts({});
    setHeuresFin({});
    setPlongeeFigee(false);
    setConfirmModal(false);
    setArchiveDone(false);
    startedCountRef.current = 0;
  }, []);

  // Remplace l'état par le contenu d'une plongée chargée (cf. parseDiveContent).
  const applyDive = useCallback((clientUuid, content, archived) => {
    const rs = content.renderState;
    setAnswers(content.answers);
    setPalanquees(content.palanquees);
    setChecked(rs.checked || {});
    setComments(rs.comments || {});
    setPressions(rs.pressions || {});
    setRealises(rs.realises || {});
    setHeuresDebut(rs.heuresDebut || {});
    setDeparts(rs.departs || {});
    setHeuresFin(rs.heuresFin || {});
    setPlongeeFigee(archived);
    startedCountRef.current = Object.keys(rs.heuresDebut || {}).length;
    setCurrentDiveId(clientUuid);
    setArchiveDone(false);
    setConfirmModal(false);
  }, []);

  return {
    currentDiveId,
    setCurrentDiveId,
    answers,
    setAnswers,
    setAnswer,
    palanquees,
    setPalanquees,
    checked,
    updateChecked,
    comments,
    updateComment,
    pressions,
    setPressions,
    realises,
    setRealises,
    heuresDebut,
    setHeuresDebut,
    departs,
    setDeparts,
    heuresFin,
    setHeuresFin,
    plongeeFigee,
    setPlongeeFigee,
    confirmModal,
    setConfirmModal,
    archiveDone,
    setArchiveDone,
    startedCountRef,
    resetDiveState,
    applyDive,
  };
}
