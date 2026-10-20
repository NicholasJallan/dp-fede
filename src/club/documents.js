// DP Assistant — Règle d'affichage du bouton « Régénérer les PDF » d'une
// plongée archivée, alignée sur le serveur (POST /api/dives/:id/documents,
// docs/api-club.md) : régénération seulement si la génération a échoué
// ('error') ou si un document manque. Jamais pendant une génération en
// cours ('pending'), jamais pour des documents complets : une fiche archivée
// ne se réécrit pas (A322-72).

export const DOCUMENT_TYPES = ['fiche', 'checklist'];

/**
 * @param {{ status?: string|null, documents?: Array<{ type: string }> }} state
 * @returns {boolean}
 */
export function canRegenerateDocuments({ status, documents } = {}) {
  if (status === 'error') return true;
  if (status === 'pending') return false;
  const present = new Set((documents || []).map(d => d?.type));
  return DOCUMENT_TYPES.some(t => !present.has(t));
}
