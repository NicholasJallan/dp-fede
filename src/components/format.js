// DP Assistant — Formats d'affichage (dates fr-FR, noms de plongeurs).
//
// Toutes les dates affichées passent par ce module : un seul format par
// usage, quel que soit le format d'origine (datetime-local du formulaire,
// DATETIME MySQL « YYYY-MM-DD HH:mm:ss », ISO UTC, date seule).

const LOCALE = 'fr-FR';

const FMT = {
  date:      new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
  dateLong:  new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  dayMonth:  new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' }),
  time:      new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }),
};

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Convertit une valeur date en Date locale. Les chaînes sans fuseau
 * (« 2026-10-20 », « 2026-10-20T14:00 », « 2026-10-20 14:00:00 ») sont lues
 * en heure locale — new Date('2026-10-20') les lirait en UTC.
 * @returns {Date|null}
 */
export function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const m = LOCAL_RE.exec(s);
  const d = m
    ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
    : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function hasTime(value) {
  if (value instanceof Date) return true;
  return /[T ]\d{2}:\d{2}/.test(String(value || ''));
}

/** « 20 oct. 2026 » */
export function formatDate(value) {
  const d = parseDateLike(value);
  return d ? FMT.date.format(d) : '—';
}

/** « mardi 20 octobre 2026 » */
export function formatDateLong(value) {
  const d = parseDateLike(value);
  return d ? FMT.dateLong.format(d) : '—';
}

/** « 14:00 » (chaîne vide si la valeur n'a pas d'heure) */
export function formatTime(value) {
  const d = parseDateLike(value);
  return d && hasTime(value) ? FMT.time.format(d) : '';
}

/** « 20/10 » */
export function formatDayMonth(value) {
  const d = parseDateLike(value);
  return d ? FMT.dayMonth.format(d) : '—';
}

/** « 20 oct. 2026, 14:00 » (sans heure si la valeur n'en a pas) */
export function formatDateTime(value) {
  const d = parseDateLike(value);
  if (!d) return '—';
  return hasTime(value) ? `${FMT.date.format(d)}, ${FMT.time.format(d)}` : FMT.date.format(d);
}

export function diverFullName(d) {
  return `${d.prenom || ''} ${(d.nom || '').toUpperCase()}`.trim();
}

export function getDiver(diversById, id) {
  return diversById[id] || { prenom: '?', nom: '?', niveau: '?' };
}
