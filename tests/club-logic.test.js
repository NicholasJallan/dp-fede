// Tests — logique pure du socle club côté interface : droits par rôle,
// saison et mineurs, alertes, rapport d'import, suppressions, lien
// d'invitation, champs club du formulaire plongeur, téléchargements.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { can, PERMISSIONS, ROLES, roleLabel, describeApiError } from '../src/club/permissions.js';
import { seasonLabel, seasonRange, isSeason, ageOn, isMinor, seasonChoices } from '../src/club/season.js';
import { summarizeAlerts, groupAlertsByDiver, describeAlert, alertTone, alertsSentence } from '../src/club/alerts.js';
import {
  importRows, summarizeImport, filterImportRows, countByFilter, describeFormat, checkImportFile, fieldLabel,
} from '../src/club/import-report.js';
import { isDeleteConfirmed, describeDeletion, describeAccountDeletionError } from '../src/club/deletion.js';
import { parseInvitationHash } from '../src/club/invitation.js';
import { diverToForm, formToPayload, emptyDiver, sourceLabel } from '../src/components/diver-payload.js';
import { filenameFromDisposition } from '../src/api/download.js';

describe('droits par rôle (matrice docs/api-club.md)', () => {
  const expect = {
    responsable: { 'club.manage': true, 'divers.write': true, 'divers.import': true, 'documents.generate': true, 'alerts.read': true, 'stats.read': true },
    dp:          { 'club.manage': false, 'divers.write': true, 'divers.import': true, 'documents.generate': true, 'alerts.read': true, 'stats.read': true },
    encadrant:   { 'club.manage': false, 'divers.write': false, 'divers.import': false, 'documents.generate': false, 'alerts.read': true, 'stats.read': true },
    lecture:     { 'club.manage': false, 'divers.write': false, 'divers.import': false, 'documents.generate': false, 'alerts.read': false, 'stats.read': true },
  };
  for (const role of ROLES) {
    test(`rôle ${role}`, () => {
      for (const [perm, allowed] of Object.entries(expect[role])) {
        assert.equal(can(role, perm), allowed, `${role} / ${perm}`);
      }
      assert.equal(can(role, 'club.read'), true);
      assert.equal(can(role, 'documents.read'), true);
    });
  }

  test('les permissions calculées par le serveur priment', () => {
    assert.equal(can('lecture', 'divers.write', { 'divers.write': true }), true);
    assert.equal(can('responsable', 'club.manage', { 'club.manage': false }), false);
    // Permission absente de la réponse serveur : matrice locale.
    assert.equal(can('dp', 'alerts.read', { 'club.read': true }), true);
  });

  test('rôle inconnu (serveur antérieur) : rien de masqué ; permission inconnue : refusée', () => {
    assert.equal(can(null, 'club.manage'), true);
    assert.equal(can('dp', 'inexistante'), false);
  });

  test('chaque permission est une liste de rôles connus', () => {
    for (const roles of Object.values(PERMISSIONS)) {
      assert.ok(roles.every(r => ROLES.includes(r)));
    }
    assert.equal(roleLabel('dp'), 'DP');
    assert.equal(roleLabel('inconnu'), 'inconnu');
  });

  test('describeApiError : 403 explicite et actionnable', () => {
    const msg = describeApiError({ status: 403, message: 'Action non autorisée pour votre rôle dans le club' }, 'modifier le club');
    assert.match(msg, /Action non autorisée/);
    assert.match(msg, /modifier le club/);
    assert.match(msg, /responsable du club/);
    assert.match(describeApiError({ status: 403, message: 'Jeton CSRF invalide' }), /refusée par le serveur/);
    assert.match(describeApiError(new Error('Failed to fetch')), /connexion réseau/);
    assert.equal(describeApiError({ status: 422, message: 'Champ invalide' }), 'Champ invalide');
  });
});

describe('saison FFESSM et mineurs', () => {
  test('saison du 15/09 au 14/09', () => {
    assert.equal(seasonLabel(new Date(2026, 8, 14)), '2025-2026');
    assert.equal(seasonLabel(new Date(2026, 8, 15)), '2026-2027');
    assert.equal(seasonLabel(new Date(2026, 9, 20)), '2026-2027');
    assert.equal(seasonLabel(new Date(2027, 0, 5)), '2026-2027');
    assert.equal(seasonLabel(new Date(2026, 9, 20), -1), '2025-2026');
    assert.deepEqual(seasonRange(new Date(2026, 9, 20)), { from: '2026-09-15', to: '2027-09-14' });
  });

  test('format de saison', () => {
    assert.equal(isSeason('2026-2027'), true);
    assert.equal(isSeason('2026-2028'), false);
    assert.equal(isSeason('26-27'), false);
    assert.deepEqual(seasonChoices(new Date(2026, 9, 20)), ['2025-2026', '2026-2027', '2027-2028']);
    assert.deepEqual(seasonChoices(new Date(2026, 9, 20), '2020-2021')[0], '2020-2021');
  });

  test('âge révolu et minorité', () => {
    const today = new Date(2026, 9, 20);
    assert.equal(ageOn('2012-10-21', today), 13);
    assert.equal(ageOn('2012-10-20', today), 14);
    assert.equal(isMinor('2008-10-21', today), true);
    assert.equal(isMinor('2008-10-20', today), false);
    assert.equal(isMinor('', today), false);
    assert.equal(ageOn(null, today), null);
  });
});

describe('alertes du club', () => {
  const data = {
    season: '2026-2027', days: 30,
    counts: { caci_expire: 2, licence_expire_bientot: 1, autorisation_parentale_manquante: 1 },
    items: [
      { diver_id: 'a', nom: 'Dupont', prenom: 'Jean', type: 'caci_expire', severity: 'error', date: '2026-10-01', days: -19 },
      { diver_id: 'b', nom: 'Petit', prenom: 'Léa', type: 'autorisation_parentale_manquante', severity: 'error', date: null, days: null, season: '2026-2027', age: 14 },
      { diver_id: 'c', nom: 'Moreau', prenom: 'Paul', type: 'caci_expire', severity: 'error', date: '2026-09-01', days: -49 },
      { diver_id: 'a', nom: 'Dupont', prenom: 'Jean', type: 'licence_expire_bientot', severity: 'warn', date: '2026-11-01', days: 12 },
    ],
  };

  test('synthèse : total, bloquants, plongeurs concernés, ordre des types', () => {
    const s = summarizeAlerts(data);
    assert.equal(s.total, 4);
    assert.equal(s.errors, 3);
    assert.equal(s.warnings, 1);
    assert.equal(s.divers, 3);
    assert.equal(s.tone, 'err');
    assert.deepEqual(s.byType.map(t => t.type), ['caci_expire', 'licence_expire_bientot', 'autorisation_parentale_manquante']);
    assert.equal(alertsSentence(s), '2 CACI expirés, 1 licence expirant bientôt, 1 autorisation parentale manquante');
  });

  test('sans alerte : ton nul ; seulement des avertissements : ▲', () => {
    assert.equal(summarizeAlerts({ counts: {}, items: [] }).tone, null);
    assert.equal(summarizeAlerts(null).total, 0);
    const warnOnly = { items: [{ diver_id: 'x', type: 'caci_absent', severity: 'warn' }] };
    assert.equal(summarizeAlerts(warnOnly).tone, 'warn');
    assert.equal(summarizeAlerts(warnOnly).total, 1);
  });

  test('regroupement par plongeur, forme ■ si au moins une alerte bloquante', () => {
    const groups = groupAlertsByDiver(data.items);
    assert.deepEqual(groups.map(g => g.diver_id), ['a', 'b', 'c']);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[0].tone, 'err');
    assert.equal(alertTone(data.items[3]), 'warn');
  });

  test('échéances lisibles', () => {
    assert.match(describeAlert(data.items[0]), /échu depuis 19 jours/);
    assert.match(describeAlert(data.items[3]), /échéance dans 12 jours/);
    assert.match(describeAlert(data.items[1]), /14 ans, aucune autorisation pour la saison 2026-2027/);
    assert.match(describeAlert({ type: 'caci_absent' }), /non renseignée/);
    assert.match(describeAlert({ type: 'licence_expiree', date: '2026-10-20', days: 0 }), /aujourd'hui/);
  });
});

describe("rapport d'import", () => {
  const report = {
    dry_run: true, encoding: 'UTF-8 (BOM)', separator: ';', total: 5, created: 1, updated: 1, unchanged: 1,
    errors: [{ line: 4, message: 'Date invalide pour caci : « 31/02/2026 »' }, { line: 6, message: 'Niveau inconnu' }],
    warnings: [{ line: 3, message: 'Qualification trimix : PN-C ajouté (prérequis)' }, { line: 6, message: 'Aptitude ignorée' }],
    items: [
      { line: 5, action: 'unchanged', nom: 'Moreau', prenom: 'Paul', changes: [] },
      { line: 2, action: 'create', nom: 'Dupont', prenom: 'Jean', changes: ['nom', 'licence'] },
      { line: 3, action: 'update', nom: 'Petit', prenom: 'Léa', changes: ['medical', 'external_id', 'source'] },
    ],
  };

  test('lignes triées par numéro, erreurs comprises, avec leur message', () => {
    const rows = importRows(report);
    assert.deepEqual(rows.map(r => [r.line, r.action]), [[2, 'create'], [3, 'update'], [4, 'error'], [5, 'unchanged'], [6, 'error']]);
    assert.equal(rows[0].name, 'Jean DUPONT');
    assert.equal(rows[0].detail, 'Nouvelle fiche');
    assert.equal(rows[1].detail, 'Modifié : CACI, identifiant externe, source');
    assert.equal(rows[2].detail, 'Date invalide pour caci : « 31/02/2026 »');
    assert.equal(rows[3].detail, 'Aucune modification');
  });

  test('avertissements rattachés à leur ligne (fiche ou erreur)', () => {
    const rows = importRows(report);
    assert.deepEqual(rows.find(r => r.line === 3).warnings, ['Qualification trimix : PN-C ajouté (prérequis)']);
    assert.deepEqual(rows.find(r => r.line === 6).warnings, ['Aptitude ignorée']);
    assert.deepEqual(rows.find(r => r.line === 2).warnings, []);
  });

  test('synthèse : confirmation possible seulement en simulation avec des changements', () => {
    const s = summarizeImport(report);
    assert.equal(s.changes, 2);
    assert.equal(s.errors, 2);
    assert.equal(s.errorLines, 2);
    assert.equal(s.canConfirm, true);
    assert.equal(summarizeImport({ ...report, dry_run: false }).canConfirm, false);
    assert.equal(summarizeImport({ ...report, created: 0, updated: 0 }).canConfirm, false);
  });

  test('filtres et compteurs par onglet', () => {
    const rows = importRows(report);
    assert.equal(filterImportRows(rows, 'error').length, 2);
    assert.equal(filterImportRows(rows, 'all').length, 5);
    assert.deepEqual(countByFilter(rows), { all: 5, create: 1, update: 1, error: 2, unchanged: 1 });
  });

  test('format détecté, libellés de champs, contrôle du fichier', () => {
    assert.equal(describeFormat(report), 'UTF-8 (BOM), séparateur point-virgule');
    assert.equal(describeFormat({ separator: 'tab' }), 'séparateur tabulation');
    assert.equal(fieldLabel('licence_fin'), 'fin de licence');
    assert.equal(fieldLabel('champ_inconnu'), 'champ inconnu');
    assert.match(checkImportFile(null), /Choisissez/);
    assert.match(checkImportFile({ name: 'a.csv', size: 0 }), /vide/);
    assert.match(checkImportFile({ name: 'a.csv', size: 2 * 1024 * 1024 }), /1 Mo/);
    assert.match(checkImportFile({ name: 'photo.png', size: 10, type: 'image/png' }), /CSV/);
    assert.equal(checkImportFile({ name: 'export.CSV', size: 10, type: '' }), '');
  });
});

describe('suppressions définitives', () => {
  test('saisie exacte de SUPPRIMER', () => {
    assert.equal(isDeleteConfirmed('SUPPRIMER'), true);
    assert.equal(isDeleteConfirmed('  SUPPRIMER '), true);
    assert.equal(isDeleteConfirmed('supprimer'), false);
    assert.equal(isDeleteConfirmed(''), false);
  });

  test('message serveur et fiches conservées (A322-72)', () => {
    const d = describeDeletion({
      deleted: true, retained: { fiches: 3, until: '2027-07-14', clubs: 1 },
      message: '3 fiches de sécurité archivées conservées jusqu\'au 14/07/2027.',
    }, 'Votre compte a été supprimé.');
    assert.equal(d.message, '3 fiches de sécurité archivées conservées jusqu\'au 14/07/2027.');
    assert.equal(d.retained.fiches, 3);
    assert.equal(d.retained.until, '2027-07-14');
    assert.equal(d.retained.clubs, 1);
    assert.match(d.retained.untilLabel, /2027/);
  });

  test('sans fiche conservée ni message : texte par défaut', () => {
    const d = describeDeletion({ deleted: true, retained: { fiches: 0, until: null } }, 'Votre compte a été supprimé.');
    assert.equal(d.message, 'Votre compte a été supprimé.');
    assert.equal(d.retained, null);
    const legacy = describeDeletion({ deleted: true, retained: { fiches: 2, until: '2027-01-01' } }, 'Club supprimé.');
    assert.match(legacy.message, /2 fiches de sécurité archivées conservées/);
  });

  test('409 seul responsable : action « écran Club » ; 409 dernier admin : sans', () => {
    const club = describeAccountDeletionError({ status: 409, message: 'Vous êtes le seul responsable du club « X », qui compte d\'autres membres' });
    assert.equal(club.clubAction, true);
    assert.match(club.body, /écran Club/);
    const admin = describeAccountDeletionError({ status: 409, message: 'Vous êtes le seul administrateur' });
    assert.equal(admin.clubAction, false);
    assert.match(describeAccountDeletionError(new Error('réseau')).body, /connexion réseau/);
  });
});

describe("lien d'invitation", () => {
  const token = 'a'.repeat(64);
  test('jeton de 64 caractères hexadécimaux dans le fragment', () => {
    assert.equal(parseInvitationHash(`#invitation=${token}`), token);
    assert.equal(parseInvitationHash(`#invitation=${token.toUpperCase()}`), token);
    assert.equal(parseInvitationHash(`invitation=${token}&x=1`), token);
    assert.equal(parseInvitationHash('#invitation=court'), null);
    assert.equal(parseInvitationHash('#autre=1'), null);
    assert.equal(parseInvitationHash(''), null);
  });
});

describe('formulaire plongeur : champs club', () => {
  test('fiche importée : provenance lue, jamais renvoyée', () => {
    const form = diverToForm({ id: 'd', nom: 'Dupont', source: 'vpdive', external_id: '1042', licence_fin: '2027-09-14',
      representant_legal: null, autorisation_parentale_saison: '2026-2027' });
    assert.equal(form.source, 'vpdive');
    const payload = formToPayload(form);
    assert.equal('source' in payload, false);
    assert.equal('external_id' in payload, false);
    assert.equal('_absent' in payload, false);
    assert.equal(payload.licence_fin, '2027-09-14');
    assert.equal(payload.representant_legal, '');
  });

  test('fiche en cache sans les nouveaux champs : clés vides non envoyées (pas d\'effacement)', () => {
    const payload = formToPayload(diverToForm({ id: 'd', nom: 'Dupont', medical: '2026-01-01' }));
    assert.equal('licence_fin' in payload, false);
    assert.equal('representant_legal' in payload, false);
    assert.equal('autorisation_parentale_saison' in payload, false);
  });

  test('valeur saisie sur une fiche en cache : envoyée', () => {
    const form = { ...diverToForm({ id: 'd', nom: 'Dupont' }), licence_fin: '2027-09-14' };
    assert.equal(formToPayload(form).licence_fin, '2027-09-14');
  });

  test('création : champs club présents (vides)', () => {
    const payload = formToPayload({ ...emptyDiver(), nom: 'Neuf' });
    assert.equal(payload.licence_fin, '');
    assert.equal(payload.niveau_plongeur, null);
    assert.equal(sourceLabel('vpdive'), 'VPDive');
    assert.equal(sourceLabel(''), 'Saisie manuelle');
  });
});

describe('téléchargements', () => {
  test('nom de fichier de Content-Disposition', () => {
    assert.equal(filenameFromDisposition('attachment; filename="2026-10-20-fiche-lac.pdf"'), '2026-10-20-fiche-lac.pdf');
    assert.equal(filenameFromDisposition("attachment; filename*=UTF-8''statistiques-%C3%A9t%C3%A9.csv"), 'statistiques-été.csv');
    assert.equal(filenameFromDisposition('attachment; filename=export.json'), 'export.json');
    assert.equal(filenameFromDisposition('attachment; filename="../../etc/passwd"'), 'passwd');
    assert.equal(filenameFromDisposition(null, 'fiche.pdf'), 'fiche.pdf');
  });
});
