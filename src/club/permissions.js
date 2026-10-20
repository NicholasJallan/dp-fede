// DP Assistant — Rôles et droits dans un club (miroir de Club::PERMISSIONS,
// backend/lib/Club.php ; matrice dans docs/api-club.md).
//
// Le serveur reste seul juge : GET /api/club renvoie les permissions
// calculées, utilisées en priorité. La matrice locale sert hors ligne (rôle
// du dernier /api/auth/me) et pour masquer les actions avant la réponse.

export const ROLES = ['responsable', 'dp', 'encadrant', 'lecture'];

export const ROLE_LABELS = Object.freeze({
  responsable: 'Responsable',
  dp: 'DP',
  encadrant: 'Encadrant',
  lecture: 'Lecture',
});

export const ROLE_HINTS = Object.freeze({
  responsable: 'Gère le club, les membres et les invitations ; toutes les actions.',
  dp: 'Prépare et dirige les plongées, tient l\'annuaire et les sites, importe.',
  encadrant: 'Consulte plongées, annuaire et alertes ; ne modifie rien.',
  lecture: 'Consultation seule, sans les alertes médicales.',
});

const ALL = ROLES;
const WRITERS = ['responsable', 'dp'];

export const PERMISSIONS = Object.freeze({
  'club.read': ALL,
  'club.manage': ['responsable'],
  'members.read': ALL,
  'divers.read': ALL,
  'divers.write': WRITERS,
  'divers.import': WRITERS,
  'sites.read': ALL,
  'sites.write': WRITERS,
  'dives.read': ALL,
  'dives.write': WRITERS,
  'documents.read': ALL,
  'documents.generate': WRITERS,
  'alerts.read': ['responsable', 'dp', 'encadrant'],
  'stats.read': ALL,
});

/** Libellé d'un rôle (le code brut si inconnu). */
export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '—';
}

/**
 * L'utilisateur peut-il effectuer `permission` ?
 * @param {string|null|undefined} role  rôle dans le club courant
 * @param {string} permission           ex. 'divers.write'
 * @param {Record<string, boolean>|null} [serverPermissions]  GET /api/club
 * @returns {boolean}
 */
export function can(role, permission, serverPermissions = null) {
  if (serverPermissions && Object.prototype.hasOwnProperty.call(serverPermissions, permission)) {
    return serverPermissions[permission] === true;
  }
  // Rôle inconnu (serveur antérieur au socle club) : chacun gérait ses
  // propres données, rien n'est masqué — le serveur tranche (403).
  if (!role) return true;
  return (PERMISSIONS[permission] || []).includes(role);
}

const FORBIDDEN_RE = /non autoris|réservé|restreint|membre de ce club/i;

/**
 * Message d'erreur lisible pour une action refusée (403) ou en conflit.
 * @param {{status?: number, message?: string}} err
 * @param {string} [action]  ex. « modifier le club »
 */
export function describeApiError(err, action = 'effectuer cette action') {
  const message = err?.message || 'Erreur inconnue';
  if (err?.status === 403 && err?.code === 'CLUB_NOT_MEMBER') {
    return 'Vous n\'êtes plus membre de ce club : l\'application revient à votre club courant.';
  }
  if (err?.status === 403) {
    const detail = FORBIDDEN_RE.test(message) ? message : 'Action refusée par le serveur';
    return `${detail}. Votre rôle dans le club ne permet pas de ${action} : demandez au responsable du club.`;
  }
  if (err?.status === 429) return `${message} (limite de sécurité atteinte, réessayez plus tard).`;
  if (!err?.status) return `${message}. Vérifiez la connexion réseau.`;
  return message;
}
