// DP Assistant — Annuaire des clubs : recherche, création, demandes
// d'adhésion (logique pure, testée par tests/club-directory.test.js).
//
// Le serveur tranche l'unicité (nom sans casse ni accents, numéro de club,
// SIRET / N° TAHITI : 409 CLUB_*_TAKEN) ; la comparaison locale n'est
// qu'un avertissement immédiat dans le formulaire de création.
// Normalisation identique à Club::normalizeName / normalizeIdentifier
// (fixture commune tests/fixtures/club-identity.json).

export const MIN_CLUB_NAME_LENGTH = 2;

/** Nom d'un club sans espaces superflus. */
export function normalizeClubName(nom) {
  return String(nom ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Numéro de club / SIRET : sans espaces, points, tirets ni barres obliques, en majuscules. */
export function normalizeClubIdentifier(value) {
  return String(value ?? '')
    .replace(/[\s./-]+/gu, '')
    .toUpperCase();
}

/** Clé de comparaison d'un nom : sans casse, accents ni espaces superflus (≈ collation du serveur). */
export function clubNameKey(nom) {
  return normalizeClubName(nom)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** Club jamais nommé (club personnel créé à la première connexion). */
export function isUnnamedClub(club) {
  return normalizeClubName(club?.nom) === '';
}

/**
 * Clubs de l'annuaire correspondant à la recherche (nom sans casse ni
 * accents, ou numéro de club).
 * @template {{nom: string, numero_ffessm?: string}} T
 * @param {T[]} clubs
 * @param {string} query
 * @returns {T[]}
 */
export function filterClubs(clubs, query) {
  const key = clubNameKey(query);
  if (!key) return clubs;
  const id = normalizeClubIdentifier(query);
  return clubs.filter(
    (c) => clubNameKey(c.nom).includes(key) || (id !== '' && normalizeClubIdentifier(c.numero_ffessm).includes(id)),
  );
}

/** Champs saisis pour un nouveau club → corps de POST /api/clubs (valeurs vides omises). */
export function newClubPayload(form) {
  const out = {
    nom: normalizeClubName(form.nom),
    structure_type: form.structure_type || '',
    jurisdiction: form.jurisdiction || 'FR',
  };
  const numero = normalizeClubIdentifier(form.numero_ffessm);
  const siret = normalizeClubIdentifier(form.siret);
  if (numero) out.numero_ffessm = numero;
  if (siret) out.siret = siret;
  return out;
}

/**
 * Erreurs bloquantes du formulaire de création, par champ, avant envoi :
 * champs obligatoires, puis nom ou numéro déjà présent dans l'annuaire.
 * @param {{nom?: string, structure_type?: string, numero_ffessm?: string}} form
 * @param {{club_id: string, nom: string, numero_ffessm?: string}[]} [directory]
 * @returns {Record<string, string>}
 */
export function validateNewClub(form, directory = []) {
  const errors = {};
  const nom = normalizeClubName(form.nom);
  if (nom.length < MIN_CLUB_NAME_LENGTH) errors.nom = 'Indiquez le nom du club ou de la structure.';
  if (!form.structure_type) errors.structure_type = 'Choisissez le type de structure.';
  const key = clubNameKey(nom);
  const taken = directory.find((c) => key && clubNameKey(c.nom) === key);
  if (!errors.nom && taken) errors.nom = `Le club « ${taken.nom} » existe déjà : demandez plutôt à le rejoindre.`;
  const numero = normalizeClubIdentifier(form.numero_ffessm);
  const numeroTaken = numero && directory.find((c) => normalizeClubIdentifier(c.numero_ffessm) === numero);
  if (numeroTaken) errors.numero_ffessm = `Ce numéro est déjà celui du club « ${numeroTaken.nom} ».`;
  return errors;
}

/** Champ du formulaire visé par un refus serveur (409), ou null. */
export const CLUB_CONFLICT_FIELDS = Object.freeze({
  CLUB_NAME_TAKEN: 'nom',
  CLUB_NUMBER_TAKEN: 'numero_ffessm',
  CLUB_SIRET_TAKEN: 'siret',
});

export function conflictField(err) {
  return (err?.status === 409 && CLUB_CONFLICT_FIELDS[err?.code]) || null;
}

export const JOIN_STATUS_LABELS = Object.freeze({
  pending: 'En attente',
  accepted: 'Acceptée',
  refused: 'Refusée',
  cancelled: 'Retirée',
});

/** Ton de la pastille d'une demande d'adhésion. */
export function joinStatusTone(status) {
  if (status === 'accepted') return 'ok';
  if (status === 'refused') return 'err';
  return 'default';
}

/**
 * État d'un club de l'annuaire pour l'utilisateur : 'member', 'pending' ou 'none'.
 * @param {{is_member?: boolean, pending_request_id?: string|null}} club
 */
export function membershipState(club) {
  if (club?.is_member) return 'member';
  if (club?.pending_request_id) return 'pending';
  return 'none';
}

/** Nom affichable d'un demandeur. */
export function requesterName(r) {
  const name = [r?.prenom, r?.nom].filter(Boolean).join(' ');
  return name || r?.email || 'Utilisateur';
}
