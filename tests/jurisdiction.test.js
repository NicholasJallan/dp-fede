// Tests métier — juridiction (src/domain/jurisdiction.js)
// Rejeu de tests/fixtures/jurisdiction.json partagé avec backend/tests-php/JurisdictionTest.php

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  JURISDICTIONS,
  DEFAULT_JURISDICTION,
  normalizeJurisdiction,
  jurisdictionForCountry,
  resolveJurisdiction,
} from '../src/domain/jurisdiction.js';

import win from './setup.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jurisdiction.json', import.meta.url), 'utf8'));

describe('Constantes de juridiction', () => {
  test('JURISDICTIONS liste FR et PF', () => {
    assert.deepEqual(JURISDICTIONS, ['FR', 'PF']);
    assert.ok(Object.isFrozen(JURISDICTIONS), 'JURISDICTIONS doit être gelé');
  });

  test('DEFAULT_JURISDICTION vaut FR', () => {
    assert.equal(DEFAULT_JURISDICTION, 'FR');
  });

  test('Exporté par src/domain/index.js via setup.js', () => {
    assert.equal(win.DEFAULT_JURISDICTION, 'FR');
    assert.deepEqual(win.JURISDICTIONS, ['FR', 'PF']);
    assert.equal(typeof win.normalizeJurisdiction, 'function');
    assert.equal(typeof win.jurisdictionForCountry, 'function');
    assert.equal(typeof win.resolveJurisdiction, 'function');
  });
});

describe('normalizeJurisdiction — rejeu fixture', () => {
  for (const [idx, item] of fixture.normalize.entries()) {
    test(`normalize[${idx}] : ${JSON.stringify(item.in)} → ${JSON.stringify(item.out)}`, () => {
      assert.equal(normalizeJurisdiction(item.in), item.out);
    });
  }
});

describe('jurisdictionForCountry — rejeu fixture', () => {
  for (const [idx, item] of fixture.forCountry.entries()) {
    test(`forCountry[${idx}] : ${JSON.stringify(item.in)} → ${JSON.stringify(item.out)}`, () => {
      assert.equal(jurisdictionForCountry(item.in), item.out);
    });
  }
});

describe('resolveJurisdiction — rejeu fixture', () => {
  for (const [idx, item] of fixture.resolve.entries()) {
    test(`resolve[${idx}] : pays=${JSON.stringify(item.pays)}, club=${JSON.stringify(item.club)} → ${item.out} (${item.desc})`, () => {
      assert.equal(resolveJurisdiction(item.pays, item.club), item.out);
    });
  }
});
