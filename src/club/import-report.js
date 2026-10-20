// DP Assistant — Rapport d'import de l'annuaire (POST /api/divers/import) :
// mise en forme pour le tableau de simulation puis de confirmation.
//
// Rapport serveur : { total, created, updated, unchanged, errors[{line,
// message}], warnings[{line, message}], items[{line, action, nom, prenom,
// changes[]}] } — `line` = numéro de ligne du fichier (1 = en-tête).

export const IMPORT_ACTIONS = Object.freeze({
  create: { label: 'Création', tone: 'ok' },
  update: { label: 'Mise à jour', tone: 'info' },
  unchanged: { label: 'Inchangé', tone: 'muted' },
  error: { label: 'Erreur', tone: 'err' },
});

// Filtres du tableau (ordre d'affichage).
export const IMPORT_FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'create', label: 'Créés' },
  { id: 'update', label: 'Mis à jour' },
  { id: 'unchanged', label: 'Inchangés' },
  { id: 'error', label: 'Erreurs' },
];

// Champs plongeur → libellés (items[].changes).
const FIELD_LABELS = {
  nom: 'nom',
  prenom: 'prénom',
  licence: 'licence',
  date_naissance: 'date de naissance',
  niveau_plongeur: 'niveau',
  niveau_encadrant: 'niveau encadrant',
  nitrox: 'nitrox',
  trimix: 'trimix',
  medical: 'CACI',
  licence_fin: 'fin de licence',
  external_id: 'identifiant externe',
  source: 'source',
  representant_legal: 'représentant légal',
  autorisation_parentale_saison: 'autorisation parentale',
  deleted_at: 'fiche réactivée',
  aptitudes_sup: 'aptitudes',
  qualifs: 'qualifications',
};

export function fieldLabel(field) {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ');
}

const fullName = (it) => [it.prenom, it.nom ? String(it.nom).toUpperCase() : ''].filter(Boolean).join(' ');

/**
 * Lignes du tableau, triées par numéro de ligne : une par plongeur (action
 * + champs modifiés + avertissements de la ligne) et une par erreur.
 * @returns {Array<{key: string, line: number, action: string, name: string, detail: string, warnings: string[]}>}
 */
export function importRows(report) {
  const warningsByLine = new Map();
  for (const w of report?.warnings || []) {
    warningsByLine.set(w.line, [...(warningsByLine.get(w.line) || []), w.message]);
  }
  const rows = (report?.items || []).map((it, i) => ({
    key: `i${i}-${it.line}`,
    line: it.line,
    action: IMPORT_ACTIONS[it.action] ? it.action : 'unchanged',
    name: fullName(it) || '—',
    detail:
      it.action === 'create'
        ? 'Nouvelle fiche'
        : (it.changes || []).length
          ? `Modifié : ${it.changes.map(fieldLabel).join(', ')}`
          : 'Aucune modification',
    warnings: warningsByLine.get(it.line) || [],
  }));
  const itemLines = new Set((report?.items || []).map((it) => it.line));
  const errorRows = (report?.errors || []).map((e, i) => ({
    key: `e${i}-${e.line}`,
    line: e.line,
    action: 'error',
    name: '',
    detail: e.message,
    // Avertissement d'une ligne sans fiche (ligne en erreur) : rattaché à l'erreur.
    warnings: itemLines.has(e.line) ? [] : warningsByLine.get(e.line) || [],
  }));
  return [...rows, ...errorRows].sort((a, b) => a.line - b.line || (a.action === 'error') - (b.action === 'error'));
}

/** Compteurs et possibilité de confirmer. */
export function summarizeImport(report) {
  const errors = (report?.errors || []).length;
  const created = report?.created || 0;
  const updated = report?.updated || 0;
  const unchanged = report?.unchanged || 0;
  const errorLines = new Set((report?.errors || []).map((e) => e.line)).size;
  return {
    total: report?.total || 0,
    created,
    updated,
    unchanged,
    errors,
    errorLines,
    warnings: (report?.warnings || []).length,
    changes: created + updated,
    // Rien à écrire : inutile de confirmer.
    canConfirm: !!report?.dry_run && created + updated > 0,
  };
}

/** Filtre les lignes selon l'onglet choisi. */
export function filterImportRows(rows, filter) {
  if (!filter || filter === 'all') return rows;
  return rows.filter((r) => r.action === filter);
}

/** Nombre de lignes par filtre (badges des onglets). */
export function countByFilter(rows) {
  const counts = { all: rows.length };
  for (const r of rows) counts[r.action] = (counts[r.action] || 0) + 1;
  return counts;
}

/** Libellé de l'encodage / séparateur détectés. */
export function describeFormat(report) {
  const sep = { ';': 'point-virgule', ',': 'virgule', tab: 'tabulation' }[report?.separator] || report?.separator;
  return [report?.encoding, sep ? `séparateur ${sep}` : null].filter(Boolean).join(', ');
}

export const IMPORT_MAX_BYTES = 1024 * 1024;

/** Contrôle local avant envoi (le serveur revalide). */
export function checkImportFile(file) {
  if (!file) return 'Choisissez un fichier CSV.';
  if (file.size === 0) return 'Le fichier est vide.';
  if (file.size > IMPORT_MAX_BYTES) return 'Fichier trop volumineux : 1 Mo maximum.';
  if (!/\.(csv|txt)$/i.test(file.name || '') && !/csv|text\/plain/i.test(file.type || '')) {
    return 'Format attendu : CSV (export tableur ou VPDive).';
  }
  return '';
}
