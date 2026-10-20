// DP Assistant — Saison fédérale (hypothèse du contrat d'API : du 15/09 au
// 14/09, cf. docs/api-club.md « Alertes »), âge et format AAAA-AAAA.

const SEASON_RE = /^(\d{4})-(\d{4})$/;
const pad = (n) => String(n).padStart(2, '0');

/** Date locale au format AAAA-MM-JJ. */
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Première année de la saison contenant `date` (saison 2026-2027 → 2026). */
export function seasonStartYear(date = new Date()) {
  const y = date.getFullYear();
  const afterStart = date.getMonth() > 8 || (date.getMonth() === 8 && date.getDate() >= 15);
  return afterStart ? y : y - 1;
}

/** Saison « AAAA-AAAA » contenant `date`, décalée de `offset` saisons. */
export function seasonLabel(date = new Date(), offset = 0) {
  const start = seasonStartYear(date) + offset;
  return `${start}-${start + 1}`;
}

/** Bornes AAAA-MM-JJ d'une saison (15/09 → 14/09), décalée de `offset`. */
export function seasonRange(date = new Date(), offset = 0) {
  const start = seasonStartYear(date) + offset;
  return { from: `${start}-09-15`, to: `${start + 1}-09-14` };
}

/** Saison bien formée (années consécutives). */
export function isSeason(value) {
  const m = SEASON_RE.exec(String(value || ''));
  return !!m && Number(m[2]) === Number(m[1]) + 1;
}

/**
 * Âge révolu à `today` d'une date de naissance AAAA-MM-JJ (null si inconnue).
 * @returns {number|null}
 */
export function ageOn(birthDate, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate || ''));
  if (!m) return null;
  let age = today.getFullYear() - Number(m[1]);
  const beforeBirthday = today.getMonth() + 1 < Number(m[2])
    || (today.getMonth() + 1 === Number(m[2]) && today.getDate() < Number(m[3]));
  if (beforeBirthday) age -= 1;
  return age;
}

/** Mineur (moins de 18 ans) à la date du jour ; sans date de naissance : non. */
export function isMinor(birthDate, today = new Date()) {
  const age = ageOn(birthDate, today);
  return age !== null && age < 18;
}

/** Choix proposés pour l'autorisation parentale : saisons précédente, courante, suivante. */
export function seasonChoices(today = new Date(), current = '') {
  const list = [-1, 0, 1].map(o => seasonLabel(today, o));
  if (isSeason(current) && !list.includes(current)) list.unshift(current);
  return list;
}
