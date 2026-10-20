// DP Assistant — Helpers de format pour l'affichage (dates, noms de plongeurs).

// =========================================================================
// Helpers de format
// =========================================================================
export function formatDateTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      + " — " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

export function diverFullName(d) {
  return `${d.prenom} ${d.nom.toUpperCase()}`;
}

export function getDiver(diversById, id) {
  return diversById[id] || { prenom: "?", nom: "?", niveau: "?" };
}
