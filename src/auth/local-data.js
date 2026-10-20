// DP Assistant — Données de l'application sur cet appareil (IndexedDB,
// pré-caches localStorage, club courant, caches API du Service Worker).
//
// purgeLocalData : déconnexion, changement d'utilisateur, suppression du
// compte, et bouton « Supprimer les données de cet appareil » (session
// expirée, club quitté, changement de compte Google).

import { offlineStore } from '../offline/offline-store.js';
import { STORAGE_KEYS } from '../api/storage-keys.js';
import { setCurrentClubId } from '../api/club-header.js';

// Pré-caches et instantané du club (l'instantané de session LAST_USER est
// géré par auth-context : réécrit juste avant une purge de changement
// d'utilisateur, il n'est effacé que par wipeDeviceData / la déconnexion).
const LOCAL_KEYS = [STORAGE_KEYS.CACHE_DIVERS, STORAGE_KEYS.CACHE_SITES, STORAGE_KEYS.CLUB_SNAPSHOT];
const DATA_STORES = ['outbox', 'dives', 'divers', 'sites', 'archives'];

/** Reste-t-il des données de l'application sur l'appareil ? */
export async function hasLocalData(store = offlineStore) {
  try {
    if (await store.get('meta', 'owner')) return true;
    for (const name of DATA_STORES) {
      if ((await store.allKeys(name)).length > 0) return true;
    }
  } catch {
    /* stockage indisponible : rien de lisible */
  }
  try {
    return [...LOCAL_KEYS, STORAGE_KEYS.LAST_USER].some((k) => localStorage.getItem(k) !== null);
  } catch {
    return false;
  }
}

/** Efface toutes les données locales de l'application (outbox comprise). */
export async function purgeLocalData({ store = offlineStore } = {}) {
  try {
    if (store?.clearAll) await store.clearAll();
  } catch (err) {
    console.error('[auth] purge IndexedDB :', err?.message || err);
  }
  try {
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* stockage indisponible : rien à purger */
  }
  setCurrentClubId(null);
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.endsWith('-api')).map((n) => caches.delete(n)));
    }
  } catch {
    /* Cache API indisponible */
  }
}

/**
 * « Supprimer les données de cet appareil » : tout ce que purgeLocalData
 * efface, plus l'instantané de session hors ligne. L'appelant recharge
 * ensuite la page (une session encore valide resynchronise le club courant
 * depuis le serveur).
 */
export async function wipeDeviceData({ store = offlineStore } = {}) {
  await purgeLocalData({ store });
  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_USER);
  } catch {
    /* stockage indisponible */
  }
}
