// Check-list : le portage PHP du PDF (backend/lib/ChecklistRules.php) reste
// aligné sur src/domain/checklist.js — mêmes identifiants et textes, dans le
// même ordre, et mêmes items visibles pour les scénarios partagés de
// tests/fixtures/checklist.json (rejoués par PHPUnit, ChecklistRulesTest).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import win from './setup.js';
const { CHECKLIST_RULES, matchCondition } = win;

const php = readFileSync(new URL('../backend/lib/ChecklistRules.php', import.meta.url), 'utf8');
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/checklist.json', import.meta.url), 'utf8'));

const unquote = (lit) =>
  lit[0] === "'" ? lit.slice(1, -1).replace(/\\(['\\])/g, '$1') : lit.slice(1, -1).replace(/\\(["\\$])/g, '$1');

const phpItems = [...php.matchAll(/\['id' => '([^']+)', 'text' => ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)].map(
  ([, id, text]) => ({ id, text: unquote(text) }),
);
const jsItems = CHECKLIST_RULES.flatMap((p) => p.items);

describe('ChecklistRules.php ↔ checklist.js', () => {
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
});
