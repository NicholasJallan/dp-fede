// DP Assistant — Périmètre « club » des données locales.
//
// Le store local (plongeurs, sites, plongées) ne contient que les données du
// club courant : meta['club'] mémorise ce club. Quand il change (switch,
// invitation acceptée, retrait, club modifié sur un autre appareil — détecté
// par GET /api/sync/state), les données de l'ancien club sont purgées avec
// leurs curseurs ?since= puis resynchronisées. On ne montre jamais les
// données d'un club dans un autre.
//
// L'outbox n'est PAS purgée : chaque item porte le club de sa mise en file
// (club_id) et repart vers ce club (en-tête X-DP-Club), cf. sync.js.

import { STORAGE_KEYS } from '../api/storage-keys.js';
import { setCurrentClubId } from '../api/club-header.js';

export const CLUB_DATA_STORES = ['divers', 'sites', 'dives', 'archives'];
const META_CLUB = 'club';
const META_SYNC = 'sync';

/** Club auquel appartiennent les données locales (null si inconnu). */
export async function localClubId(store) {
  return (await store.get('meta', META_CLUB)) || null;
}

/**
 * Vide les données de club de l'appareil (stores + curseurs + pré-caches)
 * et prévient les écrans (dp:dataChanged). L'outbox est conservée.
 */
export async function purgeClubData(store) {
  for (const name of CLUB_DATA_STORES) await store.clear(name);
  await store.del('meta', META_SYNC);
  try {
    [STORAGE_KEYS.CACHE_DIVERS, STORAGE_KEYS.CACHE_SITES].forEach(k => localStorage.removeItem(k));
  } catch { /* stockage indisponible : rien à purger */ }
  for (const name of ['divers', 'sites', 'dives']) {
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: name } }));
  }
}

/**
 * Rattache les données locales au club `clubId` (devient aussi le club
 * courant des prochaines écritures). Purge celles d'un autre club.
 * Premier rattachement (appareil antérieur au socle club) : aucune purge,
 * les données locales sont celles du club courant.
 * @returns {Promise<boolean>} true si le club a changé (purge effectuée)
 */
export async function bindLocalDataToClub(store, clubId) {
  if (!clubId) return false;
  // Les prochaines écritures (outbox) visent ce club.
  setCurrentClubId(clubId);
  const previous = await localClubId(store);
  if (previous === clubId) return false;
  if (previous) await purgeClubData(store);
  await store.put('meta', META_CLUB, clubId);
  if (previous) {
    window.dispatchEvent(new CustomEvent('dp:clubChanged', { detail: { from: previous, to: clubId } }));
  }
  return !!previous;
}

/**
 * Une écriture d'outbox concerne-t-elle les données affichées ? Un item mis
 * en file pour un autre club est envoyé à ce club, mais sa réponse ne doit
 * pas revenir dans le store local du club courant.
 */
export async function isInLocalScope(store, itemClubId) {
  if (!itemClubId) return true;
  const local = await localClubId(store);
  return !local || local === itemClubId;
}
