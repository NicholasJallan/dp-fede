// Tests métier — contextualisation des questions et items de check-list
// selon le milieu (piscine/fosse vs naturel) et la logistique (bateau).
//
// Verrouille le nettoyage de l'axe E :
//   - suppression des items auto-référents fiche (ex-`p1_fiche_init`/`p2_fiche`)
//   - masquage des items sans objet en bassin (météo, marée, bouée)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const win = require('./setup');
const { QUESTIONS, CHECKLIST_RULES, matchCondition, isMilieuNaturel, getMilieuType, REGLEMENTATION } = win;

describe('REGLEMENTATION — veille réglementaire', () => {
  test('constante présente avec date ISO et libellés', () => {
    assert.ok(REGLEMENTATION, 'window.REGLEMENTATION manquant');
    assert.match(REGLEMENTATION.aJour, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(typeof REGLEMENTATION.label === 'string' && REGLEMENTATION.label.length > 0);
    assert.ok(typeof REGLEMENTATION.textes === 'string' && REGLEMENTATION.textes.length > 0);
  });
  test('date à jour valide et non antérieure aux derniers textes 2025', () => {
    const d = new Date(REGLEMENTATION.aJour);
    assert.ok(!isNaN(d.getTime()), 'date invalide');
    assert.ok(d >= new Date('2025-11-24'), 'doit intégrer l\'arrêté du 24 nov. 2025');
  });
});

// Aplatit toutes les questions / items en un seul tableau d'objets {id, when}.
const allQuestions = QUESTIONS.flatMap(s => s.questions);
const allChecklistItems = CHECKLIST_RULES.flatMap(p => p.items);

const findQuestion = (id) => allQuestions.find(q => q.id === id);
const findItem = (id) => allChecklistItems.find(i => i.id === id);

// Renvoie les ids visibles (matchCondition vrai) pour un jeu de réponses donné.
const visibleIds = (items, answers) =>
  items.filter(it => matchCondition(it.when, answers)).map(it => it.id);

describe('isMilieuNaturel', () => {
  test('mer / lac / carrière → naturel', () => {
    assert.equal(isMilieuNaturel('En mer'), true);
    assert.equal(isMilieuNaturel('Lac'), true);
    assert.equal(isMilieuNaturel('Carrière'), true);
  });
  test('piscine / fosse → non naturel', () => {
    assert.equal(isMilieuNaturel('Piscine'), false);
    assert.equal(isMilieuNaturel('Fosse'), false);
  });
  test('défaut (null) → naturel (mer)', () => {
    assert.equal(isMilieuNaturel(null), true);
  });
});

describe('Items fiche auto-référents supprimés', () => {
  test('p1_fiche_init n\'existe plus', () => {
    assert.equal(findItem('p1_fiche_init'), undefined);
  });
  test('p2_fiche n\'existe plus', () => {
    assert.equal(findItem('p2_fiche'), undefined);
  });
});

describe('Contextualisation par milieu — piscine/fosse masque le non pertinent', () => {
  const pool = { milieu: 'Piscine' };
  const fosse = { milieu: 'Fosse' };
  const mer = { milieu: 'En mer' };

  test('météo (question + check-list) masquée en piscine/fosse, visible en mer', () => {
    assert.equal(matchCondition(findQuestion('meteo').when, pool), false);
    assert.equal(matchCondition(findItem('p1_meteo').when, fosse), false);
    assert.equal(matchCondition(findQuestion('meteo').when, mer), true);
    assert.equal(matchCondition(findItem('p1_meteo').when, mer), true);
  });

  test('bouée de surface masquée en piscine/fosse, visible en milieu naturel', () => {
    assert.equal(matchCondition(findQuestion('bouee_surface').when, pool), false);
    assert.equal(matchCondition(findQuestion('bouee_surface').when, fosse), false);
    assert.equal(matchCondition(findQuestion('bouee_surface').when, { milieu: 'Lac' }), true);
  });

  test('marée jamais pertinente sans maree_relevant (faux par défaut en bassin)', () => {
    // p1_maree dépend de maree_relevant ; en piscine maree_relevant reste faux.
    assert.equal(matchCondition(findItem('p1_maree').when, pool), false);
  });
});

describe('Contextualisation logistique — items bateau', () => {
  const bord = { milieu: 'En mer', depart_bord: true };
  const bateau = { milieu: 'En mer', depart_bateau: true };

  test('items bateau masqués depuis le bord', () => {
    const ids = visibleIds(allChecklistItems, bord);
    for (const id of ['p1_vhf_test', 'p1_carburant', 'p2_pavillon', 'p2_echelle']) {
      assert.ok(!ids.includes(id), `${id} ne devrait pas s'afficher depuis le bord`);
    }
  });

  test('items bateau visibles au départ bateau', () => {
    const ids = visibleIds(allChecklistItems, bateau);
    for (const id of ['p1_vhf_test', 'p1_carburant', 'p2_pavillon', 'p2_echelle']) {
      assert.ok(ids.includes(id), `${id} devrait s'afficher au départ bateau`);
    }
  });

  test('questions bateau (vhf, chef_bord, distance_cote) masquées hors bateau', () => {
    for (const id of ['vhf', 'chef_bord', 'distance_cote', 'pavillon_alpha']) {
      assert.equal(matchCondition(findQuestion(id).when, bord), false, `${id} hors bateau`);
      assert.equal(matchCondition(findQuestion(id).when, bateau), true, `${id} au bateau`);
    }
  });
});

describe('Plongée en piscine — jeu d\'items minimal cohérent', () => {
  const pool = { milieu: 'Piscine' };
  test('aucun item météo/marée/bouée ne ressort en piscine', () => {
    const qIds = allQuestions.filter(q => matchCondition(q.when, pool)).map(q => q.id);
    const cIds = visibleIds(allChecklistItems, pool);
    assert.ok(!qIds.includes('meteo'));
    assert.ok(!qIds.includes('bouee_surface'));
    assert.ok(!cIds.includes('p1_meteo'));
    assert.ok(!cIds.includes('p1_maree'));
  });
});
