// @ts-check
// Tests métier — Quotas journaliers Polynésie française (art. 5, arrêté n° 2018-199 CM)
// Rejeu de tests/fixtures/daily-quota.json partagé avec backend/tests-php/DiveDayLoadTest.php

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { diveLoadEntries, pfDailyQuotaIssues } from '../src/domain/pf/pf-quota.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/daily-quota.json', import.meta.url), 'utf8'));

describe("diveLoadEntries — extraction de la charge d'une plongée", () => {
  for (const [idx, item] of fixture.entries.entries()) {
    test(`entries[${idx}] : ${item.desc}`, () => {
      const actual = diveLoadEntries(item.dive);
      assert.deepEqual(actual, item.expected);
    });
  }

  test("Gère les entrées invalides ou vides sans lever d'exception", () => {
    assert.deepEqual(diveLoadEntries(null), []);
    assert.deepEqual(diveLoadEntries({}), []);
    assert.deepEqual(diveLoadEntries({ palanquees: [] }), []);
  });
});

describe('pfDailyQuotaIssues — avertissements sur quotas journaliers (art. 5)', () => {
  for (const [idx, item] of fixture.scenarios.entries()) {
    test(`scenario[${idx}] : ${item.desc}`, () => {
      const issues = pfDailyQuotaIssues(item.currentDive, item.otherEntries);
      const codes = issues.map((i) => i.code);
      assert.deepEqual(codes, item.expectedCodes);

      for (const issue of issues) {
        assert.equal(issue.tone, 'warn', "Les quotas de l'art. 5 sont des avertissements");
        assert.equal(issue.ref, 'art. 5');
        assert.ok(Array.isArray(issue.ids) && issue.ids.length === 1, 'Chaque issue cible un plongeur précis');
        assert.ok(typeof issue.text === 'string' && issue.text.length > 0);
      }
    });
  }

  test('Plusieurs dépassements sur un même plongeur génèrent une issue par code', () => {
    // Plongeur avec 4 plongées air ET durée cumulée > 360 min
    const currentDive = {
      id: 'c',
      palanquees: [
        {
          id: 'p',
          profMax: 20,
          duree: 90,
          melanges: ['Air'],
          membres: [{ diverId: 'd1' }],
        },
      ],
    };
    const otherEntries = [
      { diveId: '1', diverId: 'd1', profMax: 20, duree: 100, trimix: false },
      { diveId: '2', diverId: 'd1', profMax: 20, duree: 100, trimix: false },
      { diveId: '3', diverId: 'd1', profMax: 20, duree: 100, trimix: false },
    ];
    const issues = pfDailyQuotaIssues(currentDive, otherEntries);
    const codes = issues.map((i) => i.code).sort();
    assert.deepEqual(codes, ['PF_QUOTA_DUREE', 'PF_QUOTA_PLONGEES']);
  });
});
