// DP Assistant — Lien d'invitation « #invitation=<jeton> ».
//
// Le jeton est dans le fragment : jamais envoyé au serveur par le
// navigateur ni journalisé. Il est lu au démarrage, retiré de la barre
// d'adresse (historique) et gardé en sessionStorage le temps de la
// connexion Google — y compris après une déconnexion pour changer de compte.

import { STORAGE_KEYS } from '../api/storage-keys.js';

const TOKEN_RE = /^[0-9a-f]{64}$/i;

/** Jeton d'un fragment d'URL (« #invitation=… »), ou null s'il est absent ou mal formé. */
export function parseInvitationHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = (params.get('invitation') || '').trim();
  return TOKEN_RE.test(token) ? token.toLowerCase() : null;
}

export function readPendingInvitation() {
  try {
    const t = sessionStorage.getItem(STORAGE_KEYS.INVITATION);
    return TOKEN_RE.test(t || '') ? t : null;
  } catch { return null; }
}

export function clearPendingInvitation() {
  try { sessionStorage.removeItem(STORAGE_KEYS.INVITATION); } catch { /* stockage indisponible */ }
}

/**
 * Lit un éventuel jeton dans l'URL courante, le met de côté et nettoie
 * l'adresse. Retourne le jeton en attente (URL ou session), ou null.
 */
export function captureInvitationFromUrl() {
  const token = parseInvitationHash(window.location.hash);
  if (token) {
    try { sessionStorage.setItem(STORAGE_KEYS.INVITATION, token); } catch { /* gardé en mémoire par l'appelant */ }
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* historique indisponible */ }
    return token;
  }
  return readPendingInvitation();
}
