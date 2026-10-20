// Tests — logique pure de l'interface : compteurs de check-list et verrou de
// décision finale, avancement de l'exécution, chronomètre, règles de fin de
// plongée, formats de date fr-FR, signal de session expirée.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { visibleChecklist, checklistProgress, exitProgress, GO_DECISION_ID } from '../src/app/derive.js';
import { elapsedSeconds, formatChrono, diffMinutes, addMinutes } from '../src/screens/fiche/time.js';
import { applyDuree, applyProf, applyDtr } from '../src/screens/fiche/fin-rules.js';
import { parseDateLike, formatDate, formatDateTime, formatTime, formatDayMonth } from '../src/components/format.js';
import { notifyIfAuthExpired } from '../src/api/auth-events.js';

describe('check-list : compteurs par mode', () => {
  const answers = { milieu: 'Lac', depart_bord: true };

  test('le mode préparation ne compte que la phase 1, le mode exécution que la phase 2', () => {
    const prep = visibleChecklist(answers, 'prepare');
    const exec = visibleChecklist(answers, 'execute');
    assert.deepEqual(prep.map(p => p.phase), [1]);
    assert.deepEqual(exec.map(p => p.phase), [2]);
    assert.equal(checklistProgress(answers, {}, 'prepare').total, prep[0].items.length);
    assert.equal(checklistProgress(answers, {}, 'execute').total, exec[0].items.length);
  });

  test("un item coché d'une autre phase ou masqué ne gonfle pas le compteur", () => {
    const checked = { p1_blocs: true, p2_appel: true, p2_pavillon: true /* bateau : masqué */ };
    assert.deepEqual(checklistProgress(answers, checked, 'execute'), {
      total: visibleChecklist(answers, 'execute')[0].items.length, doneCount: 1,
    });
    assert.equal(checklistProgress(answers, checked, 'prepare').doneCount, 1);
  });

  test('la décision finale du DP figure toujours en phase 2', () => {
    const ids = visibleChecklist({}, 'execute')[0].items.map(i => i.id);
    assert.ok(ids.includes(GO_DECISION_ID));
  });
});

describe('exécution : avancement des palanquées', () => {
  test('compte les palanquées à l\'eau et sorties', () => {
    const pals = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    assert.deepEqual(exitProgress(pals, { p1: '10:00', p2: '10:05' }, { p1: '10:40' }), { total: 3, out: 1, water: 1 });
  });
});

describe('chronomètre', () => {
  test('secondes écoulées depuis une heure HH:MM', () => {
    const now = new Date(2026, 9, 20, 10, 23, 41);
    assert.equal(elapsedSeconds('10:00', now), 23 * 60 + 41);
    assert.equal(formatChrono(23 * 60 + 41), '00:23:41');
  });

  test('passage de minuit', () => {
    const now = new Date(2026, 9, 21, 0, 10, 0);
    assert.equal(elapsedSeconds('23:50', now), 20 * 60);
    assert.equal(diffMinutes('23:50', '00:10'), 20);
    assert.equal(addMinutes('23:50', 25), '00:15');
  });

  test('heure d\'entrée absente : zéro', () => {
    assert.equal(elapsedSeconds('', new Date()), 0);
  });
});

describe('fin de plongée : bornes de saisie', () => {
  const base = { duree: '40', profMax: '20', dtr: '6', commentaire: '' };

  test('la durée ne dépasse pas le temps écoulé et la DTR suit', () => {
    const f = applyDuree(base, '55', 42);
    assert.equal(f.duree, '42');
    const g = applyDuree({ ...base, dtr: '30' }, '20', 42);
    assert.equal(g.dtr, '20');
  });

  test('la profondeur est plafonnée au maximum du site', () => {
    assert.equal(applyProf(base, '45', 30).profMax, '30');
    assert.equal(applyProf(base, '45', null).profMax, '45');
  });

  test('la DTR réalisée ne dépasse pas la durée', () => {
    assert.equal(applyDtr(base, '50').dtr, '40');
    assert.equal(applyDtr(base, '3').dtr, '3');
  });
});

describe('dates fr-FR', () => {
  test('les chaînes sans fuseau sont lues en heure locale', () => {
    const d = parseDateLike('2026-10-20');
    assert.equal(d.getDate(), 20);
    assert.equal(d.getHours(), 0);
    assert.equal(parseDateLike('2026-10-20 14:05:00').getMinutes(), 5);
    assert.equal(parseDateLike('pas une date'), null);
  });

  test('un seul format par usage', () => {
    assert.equal(formatTime('2026-10-20T14:00'), '14:00');
    assert.equal(formatTime('2026-10-20'), '');
    assert.equal(formatDayMonth('2026-10-20T14:00'), '20/10');
    assert.match(formatDate('2026-10-20'), /^20 oct\.? 2026$/);
    assert.match(formatDateTime('2026-10-20T14:00'), /^20 oct\.? 2026, 14:00$/);
    assert.equal(formatDateTime(''), '—');
  });
});

describe('session expirée', () => {
  test('un 401 hors /auth/ émet dp:authExpired', () => {
    const events = [];
    const saved = globalThis.window;
    globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
    try {
      notifyIfAuthExpired(401, '/dives');
      notifyIfAuthExpired(401, '/auth/me');
      notifyIfAuthExpired(500, '/dives');
    } finally {
      globalThis.window = saved;
    }
    assert.deepEqual(events, ['dp:authExpired']);
  });
});
