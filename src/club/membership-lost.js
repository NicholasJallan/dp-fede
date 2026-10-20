// DP Assistant — Club quitté ou retiré (403 CLUB_NOT_MEMBER, départ,
// suppression du club) : les actions « à revoir » de ce club ne pourront
// jamais être envoyées et sont retirées de l'outbox ; si c'était le club
// courant, il est oublié pour que la requête suivante laisse le serveur
// choisir le club courant (resynchronisation, cf. club-context.jsx).

import { outbox as defaultOutbox } from '../offline/outbox.js';
import { getCurrentClubId, setCurrentClubId } from '../api/club-header.js';

/**
 * @param {{ clubId: string|null, outbox?: { purgeClub: Function } }} args
 * @returns {Promise<{ removed: number, wasCurrent: boolean }>}
 */
export async function handleClubNotMember({ clubId, outbox = defaultOutbox }) {
  const removed = clubId ? await outbox.purgeClub(clubId) : 0;
  const wasCurrent = !clubId || getCurrentClubId() === clubId;
  if (wasCurrent) setCurrentClubId(null);
  return { removed, wasCurrent };
}
