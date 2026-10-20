// DP Assistant — Téléchargement de fichiers produits par l'API (PDF archivés,
// export RGPD, statistiques CSV).

/**
 * Nom de fichier d'un en-tête Content-Disposition (filename* RFC 5987
 * prioritaire), ou `fallback`.
 * @param {string|null|undefined} header
 * @param {string} [fallback]
 * @returns {string}
 */
export function filenameFromDisposition(header, fallback = 'document') {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(header);
  if (star) {
    try { return decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')); } catch { /* encodage invalide */ }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const name = plain ? (plain[2] ?? plain[1]).trim() : '';
  // Pas de chemin : seul le nom de fichier est retenu.
  const base = name.split(/[\\/]/).pop();
  return base || fallback;
}

/** Propose `blob` au téléchargement sous `filename`. */
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Propose un objet au téléchargement en JSON lisible (UTF-8). */
export function saveJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  saveBlob(blob, filename);
}
