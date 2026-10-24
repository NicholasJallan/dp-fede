// Tests métier — numéros et résolutions d'urgence (src/domain/emergency.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import win from './setup.js';
const { getEmergencyInfo, defaultUrgenceNumber, resolveUrgenceNumber, URGENCE_INCONNUE, URGENCE_PAR_PAYS } = win;

const fixture = JSON.parse(readFileSync(new URL('./fixtures/emergency.json', import.meta.url), 'utf8'));

describe("Constantes d'urgence", () => {
  test('URGENCE_INCONNUE vaut 112', () => {
    assert.equal(URGENCE_INCONNUE, '112');
  });

  test('URGENCE_PAR_PAYS définit les numéros par défaut pour CH et FR', () => {
    assert.deepEqual(URGENCE_PAR_PAYS, { CH: '144', FR: '18' });
  });
});

describe('getEmergencyInfo — numéros secondaires et VHF', () => {
  test('Suisse (CH) : secondaryNums contient 1414 et 112, vhf null', () => {
    const info = getEmergencyInfo('CH', 'Lac');
    assert.ok(info.secondaryNums.includes('1414'));
    assert.ok(info.secondaryNums.includes('112'));
    assert.equal(info.vhf, null);
  });

  test('France (FR) en mer : contient 15, 112, 196 et vhf Canal 16 (CROSS)', () => {
    const info = getEmergencyInfo('FR', 'En mer');
    assert.ok(info.secondaryNums.includes('15'));
    assert.ok(info.secondaryNums.includes('112'));
    assert.ok(info.secondaryNums.includes('196'));
    assert.equal(info.vhf, 'Canal 16 (CROSS)');
  });

  test('France (FR) hors mer (ex. Lac) : pas de 196, vhf null', () => {
    const info = getEmergencyInfo('FR', 'Lac');
    assert.ok(!info.secondaryNums.includes('196'));
    assert.equal(info.vhf, null);
  });

  test('Milieu insensible à la casse et aux espaces', () => {
    const info = getEmergencyInfo('FR', '  en MER ');
    assert.ok(info.secondaryNums.includes('196'));
    assert.equal(info.vhf, 'Canal 16 (CROSS)');
  });

  test('Pays inconnu ou null : contient 112, vhf null hors mer', () => {
    const infoNull = getEmergencyInfo(null, 'Carrière');
    assert.ok(infoNull.secondaryNums.includes('112'));
    assert.equal(infoNull.vhf, null);

    const infoInconnu = getEmergencyInfo('XX', 'Piscine');
    assert.ok(infoInconnu.secondaryNums.includes('112'));
    assert.equal(infoInconnu.vhf, null);
  });
});

describe("defaultUrgenceNumber — numéro d'urgence par défaut selon pays et club", () => {
  test('CH renvoie 144, ignorant clubDefault', () => {
    assert.equal(defaultUrgenceNumber('CH', '18'), '144');
    assert.equal(defaultUrgenceNumber('CH', undefined), '144');
  });

  test('FR renvoie 18, ignorant clubDefault', () => {
    assert.equal(defaultUrgenceNumber('FR', '112'), '18');
    assert.equal(defaultUrgenceNumber('FR', undefined), '18');
  });

  test('Autre pays / pays non renseigné : renvoie clubDefault si non vide après trim', () => {
    assert.equal(defaultUrgenceNumber('IT', ' 118 '), '118');
    assert.equal(defaultUrgenceNumber('', ' 15 '), '15');
    assert.equal(defaultUrgenceNumber(null, ' 18 '), '18');
    assert.equal(defaultUrgenceNumber(undefined, ' 112 '), '112');
  });

  test('Autre pays / pays non renseigné sans clubDefault valide : renvoie 112', () => {
    assert.equal(defaultUrgenceNumber('IT', ''), '112');
    assert.equal(defaultUrgenceNumber('IT', '   '), '112');
    assert.equal(defaultUrgenceNumber('IT', null), '112');
    assert.equal(defaultUrgenceNumber(null, null), '112');
    assert.equal(defaultUrgenceNumber(undefined, undefined), '112');
  });
});

describe('resolveUrgenceNumber — résolution avec statut de saisie manuelle', () => {
  test('manual === true et current non vide après trim : conserve current trimé', () => {
    assert.equal(resolveUrgenceNumber({ paysCode: 'CH', clubDefault: '18', current: ' 117 ', manual: true }), '117');
    assert.equal(
      resolveUrgenceNumber({ paysCode: 'FR', clubDefault: '18', current: '01 23 45 67 89', manual: true }),
      '01 23 45 67 89',
    );
  });

  test('manual === true mais current vide après trim : bascule sur defaultUrgenceNumber', () => {
    assert.equal(resolveUrgenceNumber({ paysCode: 'CH', clubDefault: '18', current: '   ', manual: true }), '144');
    assert.equal(resolveUrgenceNumber({ paysCode: null, clubDefault: ' 15 ', current: '', manual: true }), '15');
  });

  test('manual falsy ou absent : applique defaultUrgenceNumber selon le pays du site', () => {
    assert.equal(resolveUrgenceNumber({ paysCode: 'CH', clubDefault: '18', current: '18', manual: false }), '144');
    assert.equal(resolveUrgenceNumber({ paysCode: 'FR', clubDefault: '112', current: '144', manual: false }), '18');
    assert.equal(resolveUrgenceNumber({ paysCode: null, clubDefault: '15', current: '18', manual: false }), '15');
  });
});

describe('Rejeu de la fixture partagée (tests/fixtures/emergency.json)', () => {
  describe('info', () => {
    for (const c of fixture.info) {
      test(`info: pays=${c.pays} milieu=${c.milieu}`, () => {
        const res = getEmergencyInfo(c.pays, c.milieu);
        assert.deepEqual(res, { secondaryNums: c.secondaryNums, vhf: c.vhf });
      });
    }
  });

  describe('defaultNumber', () => {
    for (const c of fixture.defaultNumber) {
      test(`defaultNumber: pays=${c.pays} clubDefault=${c.clubDefault}`, () => {
        const res = defaultUrgenceNumber(c.pays, c.clubDefault);
        assert.equal(res, c.expected);
      });
    }
  });

  describe('resolve', () => {
    for (const c of fixture.resolve) {
      test(`resolve: pays=${c.pays} current=${c.current} manual=${c.manual}`, () => {
        const res = resolveUrgenceNumber({
          paysCode: c.pays,
          clubDefault: c.clubDefault,
          current: c.current,
          manual: c.manual,
        });
        assert.equal(res, c.expected);
      });
    }
  });
});
