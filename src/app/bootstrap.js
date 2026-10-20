// DP Assistant — Amorçage des services non-React, avant le premier rendu.
//
// Ordre (identique à l'ancien chargement par <script>) :
//   1. détecteur réseau (net.js) : écouteurs + ping initial ;
//   2. décoration offline-first de `api` (offline-api.js) — AVANT tout usage ;
//   3. démarrage de l'orchestrateur de sync au tick suivant ;
//   4. lien d'invitation (#invitation=…) mis de côté et retiré de l'adresse.

import { api } from '../api/api.js';
import { startNetMonitor } from '../offline/net.js';
import { decorateApiForOffline } from '../offline/offline-api.js';
import { sync } from '../offline/sync.js';
import { captureInvitationFromUrl } from '../club/invitation.js';

let _booted = false;

export function bootstrap() {
  if (_booted) return;
  _booted = true;
  startNetMonitor();
  decorateApiForOffline(api);
  setTimeout(() => sync.start(), 0);
  captureInvitationFromUrl();
}
