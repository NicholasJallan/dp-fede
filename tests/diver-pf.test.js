// Tests front — Profil PF et formulaire plongeur (Lot 1b)
// Saisie du profil PF, bascule des codes, adaptation de la validation par juridiction.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { emptyDiver, diverToForm, formToPayload } from '../src/components/diver-payload.js';
import { validateDiverForm, togglePfCode } from '../src/components/diver-form-rules.js';

describe('diver-payload — gestion du champ pf', () => {
  test('emptyDiver initialise pf à null', () => {
    const d = emptyDiver();
    assert.equal(d.pf, null);
  });

  test('diverToForm : pf absent de la fiche lue va dans _absent et vaut null', () => {
    const raw = { nom: 'Dupont', prenom: 'Jean' };
    const form = diverToForm(raw);
    assert.equal(form.pf, null);
    assert.ok(form._absent.includes('pf'), 'pf doit être marqué dans _absent');
  });

  test('diverToForm : pf présent (null ou objet) n est pas dans _absent', () => {
    const rawWithNull = { nom: 'Dupont', pf: null };
    const formNull = diverToForm(rawWithNull);
    assert.equal(formNull.pf, null);
    assert.ok(!formNull._absent.includes('pf'));

    const rawWithObj = { nom: 'Dupont', pf: { aptitudes: ['PE-12'] } };
    const formObj = diverToForm(rawWithObj);
    assert.deepEqual(formObj.pf, { aptitudes: ['PE-12'] });
    assert.ok(!formObj._absent.includes('pf'));
  });

  test('formToPayload : omet pf si absent à la lecture ET resté null', () => {
    const form = diverToForm({ nom: 'Dupont' }); // pf est dans _absent
    assert.equal(form.pf, null);
    const payload = formToPayload(form);
    assert.equal('pf' in payload, false, 'pf ne doit pas être envoyé dans le payload');
  });

  test('formToPayload : envoie pf si absent à la lecture mais renseigné par l utilisateur', () => {
    const form = diverToForm({ nom: 'Dupont' });
    form.pf = { aptitudes: ['PE-20'] };
    const payload = formToPayload(form);
    assert.deepEqual(payload.pf, { aptitudes: ['PE-20'] });
  });

  test('formToPayload : envoie pf (même null) s il était présent à la lecture', () => {
    const form = diverToForm({ nom: 'Dupont', pf: null });
    const payload = formToPayload(form);
    assert.equal('pf' in payload, true);
    assert.equal(payload.pf, null);
  });
});

describe('diver-form-rules — validateDiverForm par juridiction', () => {
  test('En FR (par défaut), le certificat médical est obligatoire', () => {
    const fNoMed = { nom: 'Dupont', medical: '' };
    assert.equal(validateDiverForm(fNoMed), 'La date du certificat médical est obligatoire.');
    assert.equal(validateDiverForm(fNoMed, 'FR'), 'La date du certificat médical est obligatoire.');
  });

  test('En PF, le certificat médical est facultatif (attestation sur l honneur)', () => {
    const fNoMed = { nom: 'Dupont', medical: '' };
    assert.equal(validateDiverForm(fNoMed, 'PF'), '');
  });

  test('En PF comme en FR, le nom reste obligatoire', () => {
    assert.equal(validateDiverForm({ nom: '', medical: '' }, 'PF'), 'Le nom est obligatoire.');
    assert.equal(validateDiverForm({ nom: '   ', medical: '' }, 'PF'), 'Le nom est obligatoire.');
  });
});

describe('diver-form-rules — togglePfCode', () => {
  test('togglePfCode sur pf null initialise l objet complet avec le code coché', () => {
    const next = togglePfCode(null, 'aptitudes', 'PE-20');
    assert.deepEqual(next, {
      aptitudes: ['PE-20'],
      gaz: [],
      fonctions: [],
      diplome_homologue: null,
      stagiaire: false,
      patente: false,
      brevets: '',
      attestation: null,
    });
  });

  test('togglePfCode ajoute un code et conserve l ordre canonique de PF_CODES', () => {
    const base = {
      aptitudes: ['PA-20'],
      gaz: [],
      fonctions: [],
      diplome_homologue: null,
      stagiaire: false,
      patente: false,
      brevets: '',
      attestation: null,
    };
    // PE-12 précède PA-20 dans PF_CODES.aptitudes
    const res = togglePfCode(base, 'aptitudes', 'PE-12');
    assert.deepEqual(res.aptitudes, ['PE-12', 'PA-20']);

    // DP-40 après ENS-06
    const fct1 = togglePfCode(base, 'fonctions', 'DP-40');
    const fct2 = togglePfCode(fct1, 'fonctions', 'ENS-06');
    assert.deepEqual(fct2.fonctions, ['ENS-06', 'DP-40']);
  });

  test('togglePfCode retire un code déjà présent', () => {
    const base = {
      aptitudes: ['PE-12', 'PE-20', 'PA-20'],
      gaz: [],
      fonctions: [],
      diplome_homologue: null,
      stagiaire: false,
      patente: false,
      brevets: '',
      attestation: null,
    };
    const res = togglePfCode(base, 'aptitudes', 'PE-20');
    assert.deepEqual(res.aptitudes, ['PE-12', 'PA-20']);
  });

  test('togglePfCode est une fonction pure (immuable)', () => {
    const original = Object.freeze({
      aptitudes: Object.freeze(['PE-12']),
      gaz: Object.freeze(['PN']),
      fonctions: Object.freeze([]),
      diplome_homologue: null,
      stagiaire: false,
      patente: false,
      brevets: '',
      attestation: null,
    });

    const next = togglePfCode(original, 'aptitudes', 'PE-20');
    assert.notEqual(next, original);
    assert.deepEqual(original.aptitudes, ['PE-12']);
    assert.deepEqual(next.aptitudes, ['PE-12', 'PE-20']);
  });
});
