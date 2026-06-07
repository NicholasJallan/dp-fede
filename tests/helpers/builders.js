// Builders fluents pour les tests métier — réduisent le bruit dans les cas.

let nextId = 1;
function uid(prefix = 'id') {
  return `${prefix}_${nextId++}`;
}

function resetIds() {
  nextId = 1;
}

// Plongeur (référencé par diverId dans une palanquée)
function makeDiver(overrides = {}) {
  return {
    id:               overrides.id ?? uid('d'),
    nom:              overrides.nom ?? 'DUPONT',
    prenom:           overrides.prenom ?? 'Jean',
    licence:          overrides.licence ?? '12345',
    niveau_plongeur:  overrides.niveau_plongeur ?? null,
    niveau_encadrant: overrides.niveau_encadrant ?? null,
    nitrox:           overrides.nitrox ?? [],
    trimix:           overrides.trimix ?? [],
    aptitudes_sup:    overrides.aptitudes_sup ?? [],
    medical:          overrides.medical ?? '2026-01-01',
    notes:            overrides.notes ?? '',
  };
}

// Membre de palanquée (référence un diver par diverId)
function makeMembre(diver, aptitude) {
  return { diverId: diver.id, aptitude };
}

// Baptisé inline (pas dans l'annuaire) — discriminant `_bapteme: true`
function makeBapteme({ id, prenom = 'Bébé', nom = 'TEST' } = {}) {
  return {
    id:        id ?? uid('b'),
    _bapteme:  true,
    aptitude:  'Baptême',
    prenom, nom,
  };
}

// Palanquée
function makePal(overrides = {}) {
  return {
    id:        overrides.id ?? uid('p'),
    nom:       overrides.nom ?? 'Palanquée test',
    membres:   overrides.membres ?? [],
    profMax:   overrides.profMax ?? 20,
    duree:     overrides.duree ?? 35,
    dtr:       overrides.dtr ?? 2,
    melanges:  overrides.melanges ?? ['Air'],
    no_deco:   overrides.no_deco ?? true,
    shot_line: overrides.shot_line ?? false,
  };
}

// Réponses du questionnaire profil
function makeAnswers(overrides = {}) {
  return {
    dp_id:    overrides.dp_id ?? null,
    dp_nom:   overrides.dp_nom ?? 'DP Test',
    dp_qual:  overrides.dp_qual ?? 'E3',
    date:     overrides.date ?? '2026-06-01T10:00',
    milieu:   overrides.milieu ?? 'En mer',
    activite: overrides.activite ?? 'Exploration',
    ...overrides,
  };
}

// Map { diverId -> diver } pour validatePal
function buildDiversById(...divers) {
  const map = {};
  for (const d of divers) map[d.id] = d;
  return map;
}

// Niveaux/aptitudes prêtes à l'emploi
const PRESET = {
  n1:        () => makeDiver({ niveau_plongeur: 'N1' }),
  n2:        () => makeDiver({ niveau_plongeur: 'N2' }),
  n3:        () => makeDiver({ niveau_plongeur: 'N3' }),
  n4:        () => makeDiver({ niveau_encadrant: 'N4' }),
  n5:        () => makeDiver({ niveau_encadrant: 'N5' }),
  e1:        () => makeDiver({ niveau_encadrant: 'E1' }),
  e2:        () => makeDiver({ niveau_encadrant: 'E2' }),
  e3:        () => makeDiver({ niveau_encadrant: 'E3' }),
  e4:        () => makeDiver({ niveau_encadrant: 'E4' }),
  debutant:  () => makeDiver({}),
};

// Helpers : extraire seulement les erreurs bloquantes
function errors(issues) {
  return issues.filter(i => i.tone === 'err').map(i => i.text);
}
function warnings(issues) {
  return issues.filter(i => i.tone === 'warn').map(i => i.text);
}
function isOk(issues) {
  return issues.some(i => i.tone === 'ok') && errors(issues).length === 0;
}

module.exports = {
  resetIds,
  uid,
  makeDiver,
  makeMembre,
  makeBapteme,
  makePal,
  makeAnswers,
  buildDiversById,
  PRESET,
  errors,
  warnings,
  isOk,
};
