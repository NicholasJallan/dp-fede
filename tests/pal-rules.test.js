// Tests réglementaires — validatePal (Code du sport, annexes III-15 a à III-18 c).
//
// Les cas vivent dans tests/fixtures/pal-rules.json, partagés avec PHPUnit
// (backend/tests-php/RulesFixturesTest.php) : le front et l'API appliquent
// exactement les mêmes règles.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import win from './setup.js';
import { readFileSync } from 'node:fs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/pal-rules.json', import.meta.url), 'utf8'));

const { validatePal, derivePalMode, hasGasQual } = win;

function buildCase(c) {
  const diversById = {};
  let baptemeSeq = 0;
  const membres = c.pal.membres.map((spec) => {
    if (!Array.isArray(spec)) {
      baptemeSeq += 1;
      return { id: `b${baptemeSeq}`, _bapteme: true, aptitude: 'Baptême', prenom: 'Baptisé', nom: String(baptemeSeq) };
    }
    const [key, aptitude] = spec;
    const preset = fixtures.divers[key.split('#')[0]];
    assert.ok(preset, `preset plongeur inconnu : ${key}`);
    diversById[key] = { id: key, nom: key.toUpperCase(), prenom: 'Test', ...preset };
    return { diverId: key, aptitude };
  });
  const pal = { melanges: ['Air'], ...c.pal, membres };
  const dp = fixtures.dps[c.dp] || null;
  const answers = { ...fixtures.defaults, dp_qual: dp?.niveau_encadrant, ...(c.answers || {}) };
  return { pal, diversById, answers, dp };
}

const codes = (issues, tone) => [...new Set(issues.filter((i) => i.tone === tone).map((i) => i.code))].sort();

describe('validatePal — cas réglementaires partagés', () => {
  for (const c of fixtures.cases) {
    test(`${c.name}${c.ref ? ` (${c.ref})` : ''}`, () => {
      const { pal, diversById, answers, dp } = buildCase(c);
      const issues = validatePal(pal, diversById, answers, dp);
      assert.deepEqual(
        codes(issues, 'err'),
        [...c.errors].sort(),
        issues.map((i) => `${i.tone} ${i.code} ${i.text}`).join('\n'),
      );
      for (const w of c.warnings || []) {
        assert.ok(codes(issues, 'warn').includes(w), `avertissement ${w} attendu`);
      }
      if (c.errors.length === 0) assert.ok(issues.some((i) => i.code === 'OK'));
    });
  }
});

describe('validatePal — forme des issues', () => {
  test('chaque issue porte code, ref et ids', () => {
    const c = fixtures.cases.find((x) => x.errors.includes('EFFECTIF_ENCADRES'));
    const { pal, diversById, answers, dp } = buildCase(c);
    const err = validatePal(pal, diversById, answers, dp).find((i) => i.code === 'EFFECTIF_ENCADRES');
    assert.equal(typeof err.text, 'string');
    assert.equal(err.ref, 'III-16 b');
    assert.ok(err.ids.length >= 5);
  });

  test('palanquée vide → avertissement seul', () => {
    const issues = validatePal({ membres: [] }, {}, fixtures.defaults, fixtures.dps.e3);
    assert.deepEqual(
      issues.map((i) => i.code),
      ['PAL_EMPTY'],
    );
  });
});

describe('derivePalMode', () => {
  test('baptême → enseignement, même si exploration demandée', () => {
    assert.equal(derivePalMode({ mode: 'exploration', membres: [{ aptitude: 'Baptême' }] }), 'enseignement');
  });
  test('choix explicite du DP respecté', () => {
    assert.equal(derivePalMode({ mode: 'exploration', membres: [{ aptitude: 'E3' }] }), 'exploration');
  });
  test('par défaut : enseignant présent → enseignement', () => {
    assert.equal(derivePalMode({ membres: [{ aptitude: 'E2' }, { aptitude: 'PE20' }] }), 'enseignement');
    assert.equal(derivePalMode({ membres: [{ aptitude: 'GP' }, { aptitude: 'PE20' }] }), 'exploration');
  });
});

describe('hasGasQual — hiérarchie PN < PN-C < PTH-40 < PTH-70 < PTH-120', () => {
  test('PTH-70 couvre PTH-40 et PN-C', () => {
    const d = { trimix: ['PTH-70'] };
    assert.ok(hasGasQual(d, 'PTH-40'));
    assert.ok(hasGasQual(d, 'PN-C'));
    assert.ok(!hasGasQual(d, 'PTH-120'));
  });
  test('sans qualification', () => {
    assert.ok(!hasGasQual({}, 'PN'));
    assert.ok(!hasGasQual(null, 'PN'));
  });
});

describe('withDecoO2 — ancienne saisie : O₂ du gaz de déco dans le champ unique', () => {
  const { withDecoO2 } = win;

  test('Air + Nx > 40 %, O₂ 100 % → reporté en gaz de déco', () => {
    const pal = withDecoO2({ melanges: ['Air', 'Nx > 40%'], o2: 100 });
    assert.equal(pal.o2, undefined);
    assert.equal(pal.o2_deco, 100);
  });

  test('Nx ≤ 40 % + Nx > 40 %, O₂ 80 % → déco, gaz fond à saisir', () => {
    const pal = withDecoO2({ melanges: ['Nx ≤ 40%', 'Nx > 40%'], o2: 80 });
    assert.equal(pal.o2, undefined);
    assert.equal(pal.o2_deco, 80);
  });

  test('inchangé : gaz fond ≤ 40 %, Nx > 40 % seul, ou O₂ déco déjà saisi', () => {
    const fond = { melanges: ['Nx ≤ 40%', 'Nx > 40%'], o2: 32 };
    const seul = { melanges: ['Nx > 40%'], o2: 50 };
    const deja = { melanges: ['Air', 'Nx > 40%'], o2: 80, o2_deco: 50 };
    assert.equal(withDecoO2(fond), fond);
    assert.equal(withDecoO2(seul), seul);
    assert.equal(withDecoO2(deja), deja);
  });
});
