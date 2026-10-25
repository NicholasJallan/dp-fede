// Tests — annuaire des clubs (src/club/directory.js) : normalisation commune
// avec le serveur (tests/fixtures/club-identity.json ↔ ClubDirectoryTest),
// recherche, pré-contrôle d'unicité, payload de création, demandes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeClubName,
  normalizeClubIdentifier,
  clubNameKey,
  isUnnamedClub,
  filterClubs,
  newClubPayload,
  validateNewClub,
  conflictField,
  joinStatusTone,
  membershipState,
  requesterName,
  JOIN_STATUS_LABELS,
} from '../src/club/directory.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/club-identity.json', import.meta.url), 'utf8'));

const DIRECTORY = [
  { club_id: 'a', nom: 'Bulles en Valais', numero_ffessm: '06130045' },
  { club_id: 'b', nom: 'Territoires 2 Plongées', numero_ffessm: '02590049C' },
  { club_id: 'c', nom: 'Club Subaquatique de Lyon', numero_ffessm: '' },
];

describe('normalisation (fixture partagée avec PHP)', () => {
  for (const [input, expected] of fixture.names) {
    test(`nom ${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(normalizeClubName(input), expected);
    });
  }
  for (const [input, expected] of fixture.identifiers) {
    test(`identifiant ${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(normalizeClubIdentifier(input), expected);
    });
  }
  test('valeurs absentes : chaîne vide', () => {
    assert.equal(normalizeClubName(null), '');
    assert.equal(normalizeClubIdentifier(undefined), '');
  });
});

describe('clé de comparaison des noms (≈ collation utf8mb4_unicode_ci)', () => {
  test('ignore casse, accents et espaces superflus', () => {
    assert.equal(clubNameKey('  Territoirés  2 PLONGEES '), clubNameKey('Territoires 2 Plongées'));
  });
  test('des noms différents restent différents', () => {
    assert.notEqual(clubNameKey('Club A'), clubNameKey('Club B'));
  });
});

describe('isUnnamedClub', () => {
  test('club personnel jamais nommé', () => {
    assert.equal(isUnnamedClub({ nom: '' }), true);
    assert.equal(isUnnamedClub({ nom: '   ' }), true);
    assert.equal(isUnnamedClub(null), true);
  });
  test('club nommé', () => {
    assert.equal(isUnnamedClub({ nom: 'Bulles' }), false);
  });
});

describe('filterClubs', () => {
  test('sans recherche : tout l’annuaire', () => {
    assert.equal(filterClubs(DIRECTORY, '  ').length, 3);
  });
  test('par nom, sans casse ni accents', () => {
    assert.deepEqual(
      filterClubs(DIRECTORY, 'plongees').map((c) => c.club_id),
      ['b'],
    );
    assert.deepEqual(
      filterClubs(DIRECTORY, 'BULLES').map((c) => c.club_id),
      ['a'],
    );
  });
  test('par numéro de club, saisi avec espaces', () => {
    assert.deepEqual(
      filterClubs(DIRECTORY, '06 13').map((c) => c.club_id),
      ['a'],
    );
  });
  test('aucun résultat', () => {
    assert.deepEqual(filterClubs(DIRECTORY, 'Marseille'), []);
  });
});

describe('validateNewClub', () => {
  const ok = { nom: 'Plongée Annecy', structure_type: 'club', numero_ffessm: '' };
  test('formulaire complet et inédit : aucune erreur', () => {
    assert.deepEqual(validateNewClub(ok, DIRECTORY), {});
  });
  test('nom et type de structure obligatoires', () => {
    const errors = validateNewClub({ nom: ' x ', structure_type: '' }, DIRECTORY);
    assert.ok(errors.nom);
    assert.ok(errors.structure_type);
  });
  test('nom déjà dans l’annuaire (casse, accents, espaces) : proposer de rejoindre', () => {
    const errors = validateNewClub({ ...ok, nom: 'bulles  EN valais' }, DIRECTORY);
    assert.match(errors.nom, /Bulles en Valais/);
    assert.match(errors.nom, /rejoindre/);
  });
  test('numéro déjà enregistré pour un autre club', () => {
    const errors = validateNewClub({ ...ok, numero_ffessm: '02.59-0049c' }, DIRECTORY);
    assert.match(errors.numero_ffessm, /Territoires 2 Plongées/);
  });
  test('un numéro vide n’entre pas en conflit avec les clubs sans numéro', () => {
    assert.deepEqual(validateNewClub(ok, DIRECTORY), {});
  });
});

describe('newClubPayload', () => {
  test('normalise et omet les identifiants vides', () => {
    assert.deepEqual(
      newClubPayload({
        nom: ' Plongée  Annecy ',
        structure_type: 'club',
        jurisdiction: '',
        numero_ffessm: ' ',
        siret: '',
      }),
      { nom: 'Plongée Annecy', structure_type: 'club', jurisdiction: 'FR' },
    );
  });
  test('identifiants normalisés comme au serveur', () => {
    const p = newClubPayload({
      nom: 'Tahiti',
      structure_type: 'patente',
      jurisdiction: 'PF',
      numero_ffessm: '12 34',
      siret: 'a12-345',
    });
    assert.equal(p.numero_ffessm, '1234');
    assert.equal(p.siret, 'A12345');
    assert.equal(p.jurisdiction, 'PF');
  });
});

describe('refus serveur (409) → champ du formulaire', () => {
  test('codes d’unicité', () => {
    assert.equal(conflictField({ status: 409, code: 'CLUB_NAME_TAKEN' }), 'nom');
    assert.equal(conflictField({ status: 409, code: 'CLUB_NUMBER_TAKEN' }), 'numero_ffessm');
    assert.equal(conflictField({ status: 409, code: 'CLUB_SIRET_TAKEN' }), 'siret');
  });
  test('autres erreurs : aucun champ', () => {
    assert.equal(conflictField({ status: 409, code: 'ALREADY_MEMBER' }), null);
    assert.equal(conflictField({ status: 422, code: 'CLUB_NAME_TAKEN' }), null);
    assert.equal(conflictField(null), null);
  });
});

describe('demandes d’adhésion', () => {
  test('état d’un club de l’annuaire', () => {
    assert.equal(membershipState({ is_member: true, pending_request_id: 'r' }), 'member');
    assert.equal(membershipState({ is_member: false, pending_request_id: 'r' }), 'pending');
    assert.equal(membershipState({ is_member: false, pending_request_id: null }), 'none');
  });
  test('libellés et tons des statuts', () => {
    assert.equal(JOIN_STATUS_LABELS.refused, 'Refusée');
    assert.equal(joinStatusTone('accepted'), 'ok');
    assert.equal(joinStatusTone('refused'), 'err');
    assert.equal(joinStatusTone('pending'), 'default');
  });
  test('nom du demandeur, repli sur l’e-mail', () => {
    assert.equal(requesterName({ prenom: 'Ana', nom: 'Dupont' }), 'Ana Dupont');
    assert.equal(requesterName({ email: 'ana@example.com' }), 'ana@example.com');
    assert.equal(requesterName(null), 'Utilisateur');
  });
});
