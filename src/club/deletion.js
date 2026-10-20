// DP Assistant — Suppressions définitives (compte RGPD, club) : saisie de
// confirmation et lecture des réponses serveur.
//
// Réponse (DELETE /api/account, DELETE /api/club) :
//   { deleted: true, retained: { fiches, until, clubs? }, message }
// `retained` : fiches de sécurité archivées conservées au titre de
// l'obligation légale d'un an (art. A322-72 du Code du sport).

import { formatDate } from '../components/format.js';

export const DELETE_CONFIRMATION = 'SUPPRIMER';

/** Saisie exacte du mot de confirmation (casse comprise, espaces tolérés autour). */
export function isDeleteConfirmed(text) {
  return String(text || '').trim() === DELETE_CONFIRMATION;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * @param {{message?: string, retained?: {fiches?: number, until?: string|null, clubs?: number}}|null} res
 * @param {string} fallback message si le serveur n'en fournit pas
 * @returns {{message: string, retained: {fiches: number, until: string|null, untilLabel: string, clubs: number}|null}}
 */
export function describeDeletion(res, fallback) {
  const r = res?.retained;
  const fiches = Number(r?.fiches) || 0;
  const retained =
    fiches > 0
      ? { fiches, until: r.until || null, untilLabel: r.until ? formatDate(r.until) : '—', clubs: Number(r.clubs) || 0 }
      : null;
  let message = typeof res?.message === 'string' && res.message.trim() ? res.message.trim() : '';
  if (!message) {
    message = retained
      ? `${fallback} ${plural(fiches, 'fiche')} de sécurité archivée${fiches > 1 ? 's' : ''} conservée${fiches > 1 ? 's' : ''} jusqu'au ${retained.untilLabel} (art. A322-72 du Code du sport), puis supprimée${fiches > 1 ? 's' : ''} automatiquement.`
      : fallback;
  }
  return { message, retained };
}

/**
 * Refus de suppression du compte : 409 = seul responsable d'un club partagé
 * (action : confier le rôle dans l'écran Club) ou dernier administrateur.
 * @returns {{title: string, body: string, clubAction: boolean}}
 */
export function describeAccountDeletionError(err) {
  const body = err?.message || 'Erreur inconnue';
  if (err?.status === 409) {
    const clubAction = /club/i.test(body);
    return {
      title: "Suppression impossible pour l'instant",
      body: clubAction
        ? `${body}. Dans l'écran Club, nommez un autre membre « Responsable », ou supprimez le club, puis recommencez.`
        : body,
      clubAction,
    };
  }
  if (err?.status === 422) return { title: 'Confirmation refusée', body, clubAction: false };
  if (!err?.status)
    return { title: 'Hors ligne', body: 'La suppression du compte demande une connexion réseau.', clubAction: false };
  return { title: 'Suppression impossible', body, clubAction: false };
}
