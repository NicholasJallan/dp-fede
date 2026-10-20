// DP Assistant — Composants UI partagés (point d'entrée historique).
//
// Les implémentations vivent dans des modules dédiés ; ce fichier les
// ré-exporte pour que les écrans gardent un import unique.

export { Pill, Ref, Alert, Notice, Opt, Toggle, Field, Question } from './ui.jsx';
export { CdsBadge, CdsLink, withCdsLinks } from './cds-link.jsx';
export {
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDayMonth,
  formatTime,
  parseDateLike,
  diverFullName,
  getDiver,
} from './format.js';
export { KIND_LABELS, formatAge, describePayload, SyncDrawer } from './sync-drawer.jsx';
export { Dialog, ConfirmDialog } from './dialog.jsx';
export { StatusIcon, Icon, BrandMark } from './icons.jsx';
