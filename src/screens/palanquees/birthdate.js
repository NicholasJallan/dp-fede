// DP Assistant — Saisie rapide de la date de naissance (logique pure) :
// masque JJ/MM/AAAA au fil de la frappe, conversion ISO et âge.

const MIN_YEAR = 1900;

/** Chiffres saisis mis au format JJ/MM/AAAA (8 chiffres au plus). */
export function maskBirthdate(raw) {
  const digits = String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

function ageOn(birth, today) {
  const age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  return beforeBirthday ? age - 1 : age;
}

/**
 * Date JJ/MM/AAAA → `{ iso, age }` ; `{ error }` si elle est impossible ;
 * `{}` tant que la saisie est incomplète.
 * @param {string} text
 * @param {Date} [today]
 * @returns {{ iso?: string, age?: number, error?: string }}
 */
export function parseBirthdate(text, today = new Date()) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || '');
  if (!m) return {};
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return { error: "Cette date n'existe pas." };
  }
  if (birth > today) return { error: 'La date est dans le futur.' };
  if (year < MIN_YEAR) return { error: 'Vérifiez l’année.' };
  return { iso: `${m[3]}-${m[2]}-${m[1]}`, age: ageOn(birth, today) };
}
