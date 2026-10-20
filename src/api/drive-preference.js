// DP Assistant — Copie des fiches archivées dans Google Drive : facultative.
//
// Le serveur archive lui-même la fiche de sécurité et la check-list en PDF
// (conservation d'un an, A322-72) : Google Drive n'est qu'une copie
// personnelle. Préférence propre à l'appareil (localStorage) : activée par
// défaut (comportement historique) ; désactivée, l'application ne demande
// plus d'autorisation Google ni ne signale de « dépôt Drive à faire ».

import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from './storage-keys.js';

export const DRIVE_PREF_EVENT = 'dp:drivePrefChanged';

/** Copie Drive activée sur cet appareil ? (vrai si le stockage est indisponible) */
export function isDriveExportEnabled() {
  try { return localStorage.getItem(STORAGE_KEYS.DRIVE_EXPORT) !== 'off'; }
  catch { return true; }
}

export function setDriveExportEnabled(on) {
  try { localStorage.setItem(STORAGE_KEYS.DRIVE_EXPORT, on ? 'on' : 'off'); }
  catch { /* stockage indisponible : préférence non mémorisée */ }
  window.dispatchEvent(new CustomEvent(DRIVE_PREF_EVENT, { detail: { on: !!on } }));
}

/** [activée, modifier] — suit les changements faits ailleurs dans l'application. */
export function useDriveExport() {
  const [on, setOn] = useState(isDriveExportEnabled);
  useEffect(() => {
    const sync = () => setOn(isDriveExportEnabled());
    window.addEventListener(DRIVE_PREF_EVENT, sync);
    return () => window.removeEventListener(DRIVE_PREF_EVENT, sync);
  }, []);
  return [on, setDriveExportEnabled];
}
