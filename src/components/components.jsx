// DP Assistant — Composants UI partagés (point d'entrée historique).
//
// Les implémentations vivent dans des modules dédiés ; ce fichier les
// ré-exporte pour que les écrans gardent un import unique.

export { Pill, Ref, Alert, Opt, Toggle, Field, Question } from './ui.jsx';
export { CdsBadge, CdsLink, withCdsLinks } from './cds-link.jsx';
export { formatDateTime, diverFullName, getDiver } from './format.js';
export { KIND_LABELS, formatAge, describePayload, SyncDrawer } from './sync-drawer.jsx';
