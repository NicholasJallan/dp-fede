// DP Assistant — Actions sur les plongées depuis le shell : ouvrir, créer,
// démarrer (contrôle ±4 h), supprimer, cloner, terminer la préparation / la plongée.

import { useState, useCallback, useRef } from 'react';
import { api } from '../../api/api.js';
import { offlineStore } from '../../offline/offline-store.js';
import { randomUUID } from '../../offline/uuid.js';
import {
  parseDiveContent,
  parseJsonField,
  toLocalInputValue,
  nextFullHourInputValue,
  THREE_HOURS_MS,
} from '../dive-content.js';

const START_WINDOW_H = 4;

const scrollTop = () => window.scrollTo({ top: 0 });

// Lit une plongée (réseau puis store local) ; null si introuvable.
async function fetchDive(clientUuid) {
  try {
    return await api.dives.get(clientUuid);
  } catch {
    return await offlineStore.get('dives', clientUuid);
  }
}

// Réponses initiales d'une nouvelle plongée (vierge ou clonée).
function buildInitialAnswers(prefill, newDate) {
  const lastRappel = localStorage.getItem('dp-rappel-moyen') || '';
  if (prefill) {
    return {
      ...prefill.answers,
      date: newDate,
      meteo: '',
      maree_horaire: '',
      fiche_observations: '',
      maree_heure: '',
      maree_coef: '',
    };
  }
  return lastRappel ? { moyen_rappel: lastRappel, date: newDate } : { date: newDate };
}

function useLoadDive({ session, flushSave, refreshDiversAndSites, showToast, setScreen, setDiveMode }) {
  const { currentDiveId, setArchiveDone, setConfirmModal, applyDive } = session;
  return useCallback(
    async (clientUuid, targetScreen, mode = 'prepare') => {
      if (currentDiveId && currentDiveId !== clientUuid) {
        await flushSave(currentDiveId);
      }
      const target = targetScreen || (mode === 'execute' ? 'checklist' : 'profil');

      // Même plongée déjà en mémoire : l'état React est plus à jour que le store.
      if (currentDiveId === clientUuid) {
        setDiveMode(mode);
        setArchiveDone(false);
        setConfirmModal(false);
        setScreen(target);
        scrollTop();
        return;
      }

      const dive = await fetchDive(clientUuid);
      if (!dive) {
        showToast({ tone: 'err', title: 'Plongée introuvable', body: clientUuid });
        return;
      }
      // Un résumé de liste (sans contenu) ne doit jamais être ouvert : l'état
      // vide serait ensuite pris pour la vérité et écraserait le serveur.
      if (!('answers' in dive) && !('palanquees' in dive)) {
        showToast({
          tone: 'warn',
          title: 'Contenu non disponible hors-ligne',
          body: "Cette plongée n'a pas encore été téléchargée sur cet appareil. Reconnectez-vous pour l'ouvrir.",
        });
        return;
      }

      applyDive(clientUuid, parseDiveContent(dive), dive.status === 'archived');
      setDiveMode(mode);
      refreshDiversAndSites();
      setScreen(target);
      scrollTop();
    },
    [
      currentDiveId,
      flushSave,
      refreshDiversAndSites,
      showToast,
      setScreen,
      setDiveMode,
      setArchiveDone,
      setConfirmModal,
      applyDive,
    ],
  );
}

function useStartPreparation({ session, flushSave, refreshDiversAndSites, setScreen, setDiveMode, showToast }) {
  const { currentDiveId, resetDiveState, setAnswers, setPalanquees, setCurrentDiveId } = session;
  // Double appui sur « Nouvelle plongée » : une seule création (sinon une
  // plongée « prepared » orpheline en plus).
  const busy = useRef(false);
  return useCallback(
    async (prefill = null, overrideDate = null) => {
      if (busy.current) return false;
      busy.current = true;
      try {
        if (currentDiveId) flushSave(currentDiveId);

        const client_uuid = randomUUID();
        const newDate = overrideDate || nextFullHourInputValue();
        const initialAnswers = buildInitialAnswers(prefill, newDate);
        const initialPals = prefill ? prefill.palanquees : [];

        await api.dives.create({
          client_uuid,
          status: 'prepared',
          site_nom: initialAnswers.site_nom || '',
          date_plongee: newDate,
          planned_at: newDate,
          dp_nom: initialAnswers.dp_nom || '',
          dp_qual: initialAnswers.dp_qual || '',
          activite: '',
          answers: initialAnswers,
          palanquees: initialPals,
          render_state: {},
        });

        resetDiveState();
        setAnswers(initialAnswers);
        setPalanquees(initialPals);
        setCurrentDiveId(client_uuid);
        setDiveMode('prepare');
        refreshDiversAndSites();
        setScreen('profil');
        scrollTop();
        return true;
      } catch (err) {
        showToast({ tone: 'err', title: 'Création de la plongée impossible', body: err.message });
        return false;
      } finally {
        busy.current = false;
      }
    },
    [
      currentDiveId,
      flushSave,
      resetDiveState,
      refreshDiversAndSites,
      setAnswers,
      setPalanquees,
      setCurrentDiveId,
      setDiveMode,
      setScreen,
      showToast,
    ],
  );
}

function useCloneActions({ startPreparation, showToast }) {
  // Clone une plongée archivée en nouvelle plongée préparée (maintenant + 3 h)
  const cloneDive = useCallback(
    async (archiveId) => {
      try {
        const data = await api.dives.get(archiveId);
        const oldAnswers = parseJsonField(data.answers, {});
        const oldPals = parseJsonField(data.palanquees, []);
        // Nettoyer les données d'exécution des palanquées clonées
        const cleanPals = oldPals.map((p) => {
          const { dtr, profMax, duree, ...rest } = p;
          return rest;
        });
        const h3Str = toLocalInputValue(new Date(Date.now() + THREE_HOURS_MS));
        await startPreparation({ answers: oldAnswers, palanquees: cleanPals }, h3Str);
      } catch (err) {
        showToast({ tone: 'err', title: 'Clonage impossible', body: err.message });
      }
    },
    [startPreparation, showToast],
  );

  // Clone une plongée préparée en nouvelle plongée H+3
  const clonePreparedH3 = useCallback(
    async (clientUuid) => {
      try {
        const data = await api.dives.get(clientUuid);
        const oldAnswers = parseJsonField(data.answers, {});
        const oldPals = parseJsonField(data.palanquees, []);
        const orig = new Date(oldAnswers.date || data.planned_at || data.date_plongee);
        const h3Str = toLocalInputValue(new Date(orig.getTime() + THREE_HOURS_MS));
        await startPreparation({ answers: oldAnswers, palanquees: oldPals }, h3Str);
      } catch (err) {
        showToast({ tone: 'err', title: 'Clonage impossible', body: err.message });
      }
    },
    [startPreparation, showToast],
  );

  return { cloneDive, clonePreparedH3 };
}

function useStartExecution(loadDive) {
  // Modal de confirmation ±4 h avant de démarrer une plongée
  const [confirmStart, setConfirmStart] = useState(null);

  const startExecution = useCallback(
    (dive) => {
      const planned = new Date(dive.planned_at || dive.date_plongee);
      const now = new Date();
      const diffH = Math.abs(now - planned) / 3_600_000;
      if (diffH > START_WINDOW_H && !isNaN(planned.getTime())) {
        setConfirmStart({ dive, diffH, planned });
        return;
      }
      loadDive(dive.client_uuid || dive.id, 'checklist', 'execute');
    },
    [loadDive],
  );

  const confirmStartExecution = useCallback(() => {
    if (!confirmStart) return;
    const dive = confirmStart.dive;
    setConfirmStart(null);
    loadDive(dive.client_uuid || dive.id, 'checklist', 'execute');
  }, [confirmStart, loadDive]);

  return { confirmStart, setConfirmStart, startExecution, confirmStartExecution };
}

export function useDiveActions(deps) {
  const { session, flushSave, showToast, setScreen } = deps;
  const { currentDiveId, resetDiveState, setCurrentDiveId } = session;

  const loadDive = useLoadDive(deps);
  const startPreparation = useStartPreparation(deps);
  const { cloneDive, clonePreparedH3 } = useCloneActions({ startPreparation, showToast });
  const execution = useStartExecution(loadDive);

  // Supprime une plongée préparée
  const deleteDive = useCallback(
    async (clientUuid) => {
      await api.dives.delete(clientUuid);
      if (currentDiveId === clientUuid) {
        resetDiveState();
        setCurrentDiveId(null);
        setScreen('home');
      }
      showToast({ tone: 'ok', title: 'Plongée supprimée' });
    },
    [currentDiveId, resetDiveState, setCurrentDiveId, setScreen, showToast],
  );

  // Fin du mode préparation → sauvegarde + retour accueil
  const finishPreparation = useCallback(() => {
    if (currentDiveId) flushSave(currentDiveId);
    setScreen('home');
    scrollTop();
    showToast({ tone: 'ok', title: 'Plongée préparée', body: 'Retrouvez-la dans la liste des plongées préparées.' });
  }, [currentDiveId, flushSave, setScreen, showToast]);

  // « Terminé » après l'archivage → retour accueil (pas de nouvelle plongée)
  const finishDive = useCallback(() => {
    if (currentDiveId) flushSave(currentDiveId);
    setScreen('home');
    scrollTop();
  }, [currentDiveId, flushSave, setScreen]);

  return {
    loadDive,
    startPreparation,
    deleteDive,
    cloneDive,
    clonePreparedH3,
    finishPreparation,
    finishDive,
    ...execution,
  };
}
