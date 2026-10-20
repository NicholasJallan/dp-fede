// DP Assistant — Demande de stockage persistant (best-effort), une fois par
// session après connexion : évite que le navigateur purge IndexedDB (outbox,
// plongées hors-ligne) sous pression d'espace disque.

import { useEffect } from 'react';

let asked = false;

export function useStoragePersist(user) {
  useEffect(() => {
    if (!user || asked) return;
    asked = true;
    try {
      const storage = navigator.storage;
      if (!storage?.persist) return;
      Promise.resolve(storage.persisted ? storage.persisted() : false)
        .then((already) => (already ? true : storage.persist()))
        .catch((err) => console.warn('[DP] stockage persistant indisponible :', err?.message || err));
    } catch (err) {
      console.warn('[DP] stockage persistant indisponible :', err?.message || err);
    }
  }, [user]);
}
