// Tests — tri et split des plongées par statut (logique home screen)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Reproduit la logique de split/tri de screen-home.jsx (pure function)
function splitAndSort(dives) {
  const inProgress = dives
    .filter(d => d.status === 'in_progress')
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  const prepared = dives
    .filter(d => d.status === 'prepared')
    .sort((a, b) => {
      const cmp = (a.planned_at || a.date_plongee || '').localeCompare(b.planned_at || b.date_plongee || '');
      return cmp !== 0 ? cmp : (a.dp_nom || '').localeCompare(b.dp_nom || '');
    });
  const archived = dives
    .filter(d => !d.status || d.status === 'archived')
    .sort((a, b) => (b.date_plongee || '').localeCompare(a.date_plongee || ''));
  return { inProgress, prepared, archived };
}

describe('home buckets — split par statut', () => {
  const dives = [
    { id: 'a1', status: 'archived',   date_plongee: '2026-06-01T09:00' },
    { id: 'a2', status: 'archived',   date_plongee: '2026-06-03T14:00' },
    { id: 'p1', status: 'prepared',   planned_at: '2026-06-08T09:00', dp_nom: 'Dupont' },
    { id: 'p2', status: 'prepared',   planned_at: '2026-06-08T14:00', dp_nom: 'Martin' },
    { id: 'p3', status: 'prepared',   planned_at: '2026-06-09T10:00', dp_nom: 'Durand' },
    { id: 'i1', status: 'in_progress', started_at: '2026-06-08T09:12', planned_at: '2026-06-08T09:00' },
    { id: 'i2', status: 'in_progress', started_at: '2026-06-08T14:05', planned_at: '2026-06-08T14:00' },
  ];

  test('plongées en cours triées par started_at DESC (la dernière en tête)', () => {
    const { inProgress } = splitAndSort(dives);
    assert.equal(inProgress.length, 2);
    assert.equal(inProgress[0].id, 'i2', 'dernière démarrée en premier');
    assert.equal(inProgress[1].id, 'i1');
  });

  test('plongées préparées triées par planned_at ASC (prochaine en tête)', () => {
    const { prepared } = splitAndSort(dives);
    assert.equal(prepared.length, 3);
    assert.equal(prepared[0].id, 'p1', 'la plus tôt en premier');
    assert.equal(prepared[2].id, 'p3', 'la plus loin en dernier');
  });

  test('2 plongées préparées à la même heure : tri secondaire par dp_nom', () => {
    const tied = [
      { id: 'x1', status: 'prepared', planned_at: '2026-06-08T09:00', dp_nom: 'Zola' },
      { id: 'x2', status: 'prepared', planned_at: '2026-06-08T09:00', dp_nom: 'Albert' },
    ];
    const { prepared } = splitAndSort(tied);
    assert.equal(prepared[0].dp_nom, 'Albert');
    assert.equal(prepared[1].dp_nom, 'Zola');
  });

  test('plongées archivées triées par date_plongee DESC', () => {
    const { archived } = splitAndSort(dives);
    assert.equal(archived.length, 2);
    assert.equal(archived[0].id, 'a2', 'la plus récente en tête');
    assert.equal(archived[1].id, 'a1');
  });

  test('plongées sans status traitées comme archivées (rétro-compat)', () => {
    const legacy = [{ id: 'l1', date_plongee: '2026-05-20T10:00' }];
    const { archived } = splitAndSort(legacy);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].id, 'l1');
  });

  test('seuls les 3 statuts sont bien séparés', () => {
    const { inProgress, prepared, archived } = splitAndSort(dives);
    assert.equal(inProgress.length + prepared.length + archived.length, dives.length);
  });
});

describe('home buckets — cas limites', () => {
  test('liste vide → tous les buckets sont vides', () => {
    const { inProgress, prepared, archived } = splitAndSort([]);
    assert.equal(inProgress.length, 0);
    assert.equal(prepared.length, 0);
    assert.equal(archived.length, 0);
  });

  test('que des plongées préparées → archived et inProgress sont vides', () => {
    const only = [
      { id: 'p1', status: 'prepared', planned_at: '2026-06-10T08:00' },
    ];
    const { inProgress, prepared, archived } = splitAndSort(only);
    assert.equal(inProgress.length, 0);
    assert.equal(prepared.length, 1);
    assert.equal(archived.length, 0);
  });
});
