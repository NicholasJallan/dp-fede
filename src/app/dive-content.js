// DP Assistant — Helpers purs autour du contenu d'une plongée (sans React).

// Les colonnes JSON peuvent arriver sérialisées (serveur) ou déjà objets (store local).
export function parseJsonField(value, fallback) {
  return typeof value === 'string' ? JSON.parse(value) : (value || fallback);
}

// Contenu exploitable d'une plongée : { answers, palanquees, renderState }.
export function parseDiveContent(dive) {
  return {
    answers:     parseJsonField(dive.answers, {}),
    palanquees:  parseJsonField(dive.palanquees, []),
    renderState: parseJsonField(dive.render_state, {}),
  };
}

const pad = n => String(n).padStart(2, '0');

// Date locale au format <input type="datetime-local"> : YYYY-MM-DDTHH:mm.
export function toLocalInputValue(t) {
  return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

// Prochaine heure pleine (ex. 14:20 → 15:00), date de mise à l'eau par défaut.
export function nextFullHourInputValue(now = new Date()) {
  const t = new Date(now); t.setMinutes(0, 0, 0); t.setHours(t.getHours() + 1);
  return toLocalInputValue(t);
}

export const THREE_HOURS_MS = 3 * 3_600_000;
