// Tests réglementaires — validatePalPf (Arrêté n° 199 CM, annexes X et XI).
//
// Les cas vivent dans tests/fixtures/pal-rules-pf.json, partagés avec PHPUnit
// (backend/tests-php/PfRulesFixturesTest.php) : le front et l'API appliquent
// exactement les mêmes règles.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePalPf } from '../src/domain/pf/pf-rules.js';
import win from './setup.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/pal-rules-pf.json', import.meta.url), 'utf8'));

function buildCase(c) {
  const diversById = {};
  let baptemeSeq = 0;
  const membres = c.pal.membres.map((spec) => {
    if (!Array.isArray(spec)) {
      baptemeSeq += 1;
      return { id: `b${baptemeSeq}`, _bapteme: true, aptitude: 'Baptême', prenom: 'Baptisé', nom: String(baptemeSeq) };
    }
    const [key, aptitude] = spec;
    const presetKey = key.split('#')[0];
    const preset = fixtures.divers[presetKey];
    assert.ok(preset, `preset plongeur inconnu : ${key}`);
    diversById[key] = { id: key, nom: key.toUpperCase(), prenom: 'Test', ...preset };
    return { diverId: key, aptitude };
  });
  const pal = { melanges: ['Air'], ...c.pal, membres };
  const dp = fixtures.dps[c.dp] || null;
  const answers = { ...fixtures.defaults, ...(c.answers || {}) };
  return { pal, diversById, answers, dp };
}

const codes = (issues, tone) => [...new Set(issues.filter((i) => i.tone === tone).map((i) => i.code))].sort();

describe('validatePalPf — export du domaine', () => {
  test('validatePalPf est exporté par src/domain/index.js via setup.js', () => {
    assert.equal(typeof win.validatePalPf, 'function');
  });
});

describe('validatePalPf — cas réglementaires partagés', () => {
  for (const c of fixtures.cases) {
    test(`${c.name}${c.ref ? ` (${c.ref})` : ''}`, () => {
      const { pal, diversById, answers, dp } = buildCase(c);
      const issues = validatePalPf(pal, diversById, answers, dp);
      assert.deepEqual(
        codes(issues, 'err'),
        [...c.errors].sort(),
        issues.map((i) => `${i.tone} ${i.code} ${i.text}`).join('\n'),
      );
      for (const w of c.warnings || []) {
        assert.ok(codes(issues, 'warn').includes(w), `avertissement ${w} attendu`);
      }
      if (c.errors.length === 0) {
        assert.ok(
          issues.some((i) => i.code === 'OK'),
          `issue OK attendue : ${JSON.stringify(issues)}`,
        );
      }
    });
  }
});

describe('validatePalPf — forme des issues', () => {
  test('chaque issue porte code, ref, text et ids', () => {
    const c = fixtures.cases.find((x) => x.errors.includes('PF_EFFECTIF'));
    assert.ok(c, 'cas PF_EFFECTIF introuvable');
    const { pal, diversById, answers, dp } = buildCase(c);
    const err = validatePalPf(pal, diversById, answers, dp).find((i) => i.code === 'PF_EFFECTIF');
    assert.ok(err, 'issue PF_EFFECTIF introuvable');
    assert.equal(typeof err.text, 'string');
    assert.ok(err.text.length > 0);
    assert.equal(typeof err.ref, 'string');
    assert.ok(Array.isArray(err.ids));
    assert.ok(err.ids.length >= 1);
  });

  test('palanquée vide → avertissement seul PAL_EMPTY', () => {
    const issues = validatePalPf({ membres: [] }, {}, fixtures.defaults, fixtures.dps.dp40);
    assert.deepEqual(
      issues.map((i) => i.code),
      ['PAL_EMPTY'],
    );
    assert.equal(issues[0].tone, 'warn');
  });
});
