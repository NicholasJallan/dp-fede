// DP Assistant — Club courant côté client et en-tête X-DP-Club.
//
// Toute donnée métier appartient à un club (docs/api-club.md, « Club
// courant »). Le club courant est connu par /api/auth/me (club_id) puis
// mémorisé ici (et en localStorage pour un démarrage hors ligne).
//
// Usage principal : l'outbox capture le club au moment de la mise en file et
// la synchronisation rejoue chaque écriture avec `X-DP-Club: <club_id>` — une
// action saisie pour le club A reste dans le club A même si l'utilisateur
// change de club avant que le réseau revienne.

import { STORAGE_KEYS } from './storage-keys.js';

export const CLUB_HEADER = 'X-DP-Club';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant de club bien formé (UUID). Un en-tête mal formé vaut 400 côté serveur. */
export function isClubId(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function normalize(value) {
  return isClubId(value) ? value.toLowerCase() : null;
}

let current = null;
let loaded = false;

function readPersisted() {
  try {
    return localStorage.getItem(STORAGE_KEYS.CLUB_ID);
  } catch {
    return null;
  }
}

/** Club courant connu de l'appareil, ou null. */
export function getCurrentClubId() {
  if (!loaded) {
    current = normalize(readPersisted());
    loaded = true;
  }
  return current;
}

/** Mémorise le club courant (null l'oublie : déconnexion, suppression du compte). */
export function setCurrentClubId(clubId) {
  current = normalize(clubId);
  loaded = true;
  try {
    if (current) localStorage.setItem(STORAGE_KEYS.CLUB_ID, current);
    else localStorage.removeItem(STORAGE_KEYS.CLUB_ID);
  } catch {
    /* stockage indisponible : valeur gardée en mémoire */
  }
}

/** En-têtes HTTP à ajouter pour cibler un club donné ({} si inconnu). */
export function clubHeaders(clubId) {
  const id = normalize(clubId);
  return id ? { [CLUB_HEADER]: id } : {};
}
