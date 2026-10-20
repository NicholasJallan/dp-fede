// DP Assistant — Confirmation serveur d'un archivage.
//
// L'archivage passe par l'outbox (api.dives.update décoré) : l'écran ne doit
// annoncer « archivée » que lorsque le serveur a réellement accepté le
// passage à status 'archived'. États :
//   pending   — actions de cette plongée encore en file (envoi en cours)
//   offline   — idem, réseau absent
//   review    — refus métier du serveur (item outbox 'review') : erreur + Réessayer
//   rejected  — plus rien en file mais le serveur n'a pas le statut archivé
//   confirmed — lecture serveur : status === 'archived'

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/api.js';
import { outbox } from '../../offline/outbox.js';
import { sync } from '../../offline/sync.js';
import { netStatus } from '../../offline/net.js';

async function readState(diveId) {
  const online = netStatus().online;
  const items = (await outbox.pending()).filter(it => it.kind.startsWith('dive.') && it.payload?.client_uuid === diveId);
  const review = items.find(it => it.status === 'review');
  if (review) return { state: 'review', error: review.lastError || 'Refus du serveur sans motif.' };
  if (items.length > 0) {
    const failed = items.find(it => it.attempts > 0 && it.lastError);
    return { state: online ? 'pending' : 'offline', error: failed?.lastError || '' };
  }
  if (!online) return { state: 'offline', error: '' };
  try {
    const remote = await api.dives.getRemote(diveId);
    if (remote?.status === 'archived') return { state: 'confirmed', driveLink: remote.drive_link || '' };
    return { state: 'rejected', error: 'Le serveur indique que la plongée n\'est pas archivée.' };
  } catch (err) {
    return { state: 'pending', error: err.message };
  }
}

export function useArchiveConfirmation(diveId, active) {
  const [info, setInfo] = useState({ state: 'pending', error: '' });
  const confirmedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!diveId || !active || confirmedRef.current) return;
    const next = await readState(diveId);
    confirmedRef.current = next.state === 'confirmed';
    setInfo(next);
  }, [diveId, active]);

  useEffect(() => {
    if (!active) return undefined;
    refresh();
    sync.trigger('archive');
    const events = ['dp:outboxChanged', 'dp:syncDone', 'dp:netchange', 'dp:dataChanged'];
    events.forEach(e => window.addEventListener(e, refresh));
    return () => events.forEach(e => window.removeEventListener(e, refresh));
  }, [active, refresh]);

  const retry = useCallback(async () => {
    await outbox.retryNow();
    sync.trigger('archive-retry');
  }, []);

  return { ...info, retry, refresh };
}
