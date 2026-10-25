// Check-list Polynésie française (arrêté n° 199 CM) : le portage PHP du PDF
// (backend/lib/PfChecklistRules.php) reste aligné sur src/domain/pf/pf-checklist.js
// — mêmes identifiants et textes, dans le même ordre, et mêmes items visibles pour
// les scénarios partagés de tests/fixtures/checklist-pf.json (rejoués par PHPUnit,
// PfChecklistRulesTest). rulesFor('PF') et visibleChecklist() utilisent ces règles.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { rulesFor } from '../src/domain/rules-for.js';
import { PF_CHECKLIST_RULES } from '../src/domain/pf/pf-checklist.js';
import { matchCondition } from '../src/domain/conditions.js';
import { visibleChecklist } from '../src/app/derive.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/checklist-pf.json', import.meta.url), 'utf8'));

const unquote = (lit) =>
  lit[0] === "'" ? lit.slice(1, -1).replace(/\\(['\\])/g, '$1') : lit.slice(1, -1).replace(/\\(["\\$])/g, '$1');

describe('PfChecklistRules.php ↔ pf-checklist.js', () => {
  const php = readFileSync(new URL('../backend/lib/PfChecklistRules.php', import.meta.url), 'utf8');
  const phpItems = [...php.matchAll(/\['id' => '([^']+)', 'text' => ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)].map(
    ([, id, text]) => ({ id, text: unquote(text) }),
  );
  const jsItems = PF_CHECKLIST_RULES.flatMap((p) => p.items);

  test("rulesFor('PF') expose PF_CHECKLIST_RULES", () => {
    assert.equal(rulesFor('PF').checklistRules, PF_CHECKLIST_RULES);
  });

  test('mêmes identifiants, dans le même ordre', () => {
    assert.deepEqual(
      phpItems.map((i) => i.id),
      jsItems.map((i) => i.id),
    );
  });

  test('mêmes textes', () => {
    for (const it of jsItems) {
      assert.equal(phpItems.find((p) => p.id === it.id)?.text, it.text, it.id);
    }
  });

  for (const s of fixtures.scenarios) {
    test(`scénario partagé : ${s.name}`, () => {
      const visible = jsItems.filter((it) => matchCondition(it.when, s.answers)).map((it) => it.id);
      assert.deepEqual(visible, s.visible);
    });
  }

  test('visibleChecklist filtre par phase selon le mode avec les règles PF', () => {
    const pfRules = rulesFor('PF');
    const answers = { milieu: 'En mer', depart_bateau: true, jurisdiction: 'PF' };
    const prep = visibleChecklist(answers, 'prepare', pfRules);
    assert.equal(prep.length, 1);
    assert.equal(prep[0].phase, 1);
    assert.ok(prep[0].items.some((it) => it.id === 'pf1_meteo'));

    const exec = visibleChecklist(answers, 'execute', pfRules);
    assert.equal(exec.length, 1);
    assert.equal(exec[0].phase, 2);
    assert.ok(exec[0].items.some((it) => it.id === 'p2_go_decision'));
  });
});
