// Tests unitaires — fonctions d'interface Polynésie française (src/domain/pf/pf-ui.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  pfRolesFor,
  pfRoleMaxDepth,
  pfDpMaxDepth,
  pfPalHardLimit,
  pfPalMode,
  pfPalType,
  pfAvailableMelanges,
  pfIsDpCandidate,
  pfIsEnseignantRole,
} from '../src/domain/pf/pf-ui.js';

describe('pfRolesFor — rôles sélectionnables pour un plongeur', () => {
  test('plongeur sans aucune aptitude → Baptême et Débutant', () => {
    assert.deepEqual(pfRolesFor(null), ['Baptême', 'Débutant']);
    assert.deepEqual(pfRolesFor({}), ['Baptême', 'Débutant']);
    assert.deepEqual(pfRolesFor({ pf: { aptitudes: [], fonctions: [], gaz: [] } }), ['Baptême', 'Débutant']);
  });

  test('plongeur N1 (PE-20) → aptitudes acquises sans Baptême/Débutant', () => {
    const roles = pfRolesFor({ niveau_plongeur: 'N1' });
    assert.ok(roles.includes('PE-20'));
    assert.ok(!roles.includes('Baptême'));
    assert.ok(!roles.includes('Débutant'));
    assert.ok(!roles.includes('GP-40'));
  });

  test('encadrant N4 (GP-40) → aptitudes + GP-40 mais pas DP-xx', () => {
    const roles = pfRolesFor({ niveau_encadrant: 'N4' });
    assert.ok(roles.includes('PE-40'));
    assert.ok(roles.includes('PA-40'));
    assert.ok(roles.includes('GP-40'));
    assert.ok(!roles.some((r) => r.startsWith('DP-')));
  });

  test('encadrant E3 → aptitudes + ENS-xx + GP-xx sans DP-60', () => {
    const roles = pfRolesFor({ niveau_encadrant: 'E3' });
    assert.ok(roles.includes('ENS-30'));
    assert.ok(!roles.includes('ENS-40'));
    assert.ok(roles.includes('GP-40'));
    assert.ok(!roles.includes('DP-60'));
  });
});

describe('pfRoleMaxDepth — profondeur maximale selon le rôle et le mode', () => {
  test('rôles encadrants → Infinity quel que soit le mode', () => {
    assert.equal(pfRoleMaxDepth('GP-40', 'exploration'), Infinity);
    assert.equal(pfRoleMaxDepth('GP-50', 'exploration'), Infinity);
    assert.equal(pfRoleMaxDepth('ENS-20', 'enseignement'), Infinity);
    assert.equal(pfRoleMaxDepth('ENS-50', 'enseignement'), Infinity);
  });

  test('exploration : profondeur nominale du rôle', () => {
    assert.equal(pfRoleMaxDepth('Baptême', 'exploration'), 6);
    assert.equal(pfRoleMaxDepth('Débutant', 'exploration'), 12);
    assert.equal(pfRoleMaxDepth('PE-12', 'exploration'), 12);
    assert.equal(pfRoleMaxDepth('PE-20', 'exploration'), 20);
    assert.equal(pfRoleMaxDepth('PA-40', 'exploration'), 40);
    assert.equal(pfRoleMaxDepth('PE-50', 'exploration'), 50);
  });

  test('enseignement : table Annexe XI (progression)', () => {
    assert.equal(pfRoleMaxDepth('Baptême', 'enseignement'), 6);
    assert.equal(pfRoleMaxDepth('Débutant', 'enseignement'), 12);
    assert.equal(pfRoleMaxDepth('PE-12', 'enseignement'), 20);
    assert.equal(pfRoleMaxDepth('PA-12', 'enseignement'), 20);
    assert.equal(pfRoleMaxDepth('PE-20', 'enseignement'), 40);
    assert.equal(pfRoleMaxDepth('PA-20', 'enseignement'), 40);
    assert.equal(pfRoleMaxDepth('PE-30', 'enseignement'), 40);
    assert.equal(pfRoleMaxDepth('PA-30', 'enseignement'), 40);
    assert.equal(pfRoleMaxDepth('PE-40', 'enseignement'), 50);
    assert.equal(pfRoleMaxDepth('PA-50', 'enseignement'), 50);
  });
});

describe('pfDpMaxDepth — plafond selon les prérogatives du DP', () => {
  test('DP null ou non qualifié → 0', () => {
    assert.equal(pfDpMaxDepth('exploration', null, ['Air']), 0);
    assert.equal(pfDpMaxDepth('exploration', { pf: { fonctions: [] } }, ['Air']), 0);
  });

  test('trimix : DP-120 → 120, DP-100 → 100, DP-70 → 70, sinon 0', () => {
    const dp120 = { pf: { fonctions: ['DP-120'] } };
    const dp100 = { pf: { fonctions: ['DP-100'] } };
    const dp70 = { pf: { fonctions: ['DP-70'] } };
    const dp60 = { pf: { fonctions: ['DP-60'] } };
    assert.equal(pfDpMaxDepth('exploration', dp120, ['Tx']), 120);
    assert.equal(pfDpMaxDepth('exploration', dp100, ['Tx']), 100);
    assert.equal(pfDpMaxDepth('exploration', dp70, ['Tx']), 70);
    assert.equal(pfDpMaxDepth('exploration', dp60, ['Tx']), 0);
    assert.equal(pfDpMaxDepth('enseignement', dp70, ['Tx']), 70);
  });

  test('air / nitrox en exploration : DP-60+ → 50, DP-40 → 40', () => {
    const dp60 = { pf: { fonctions: ['DP-60'] } };
    const dp40 = { pf: { fonctions: ['DP-40'] } };
    assert.equal(pfDpMaxDepth('exploration', dp60, ['Air']), 50);
    assert.equal(pfDpMaxDepth('exploration', dp40, ['Air']), 40);
  });

  test('air / nitrox en enseignement : DP-60+ → 50, DP-40 → 6, ENS-xx seul → 6 (EAR)', () => {
    const dp60 = { pf: { fonctions: ['DP-60'] } };
    const dp40 = { pf: { fonctions: ['DP-40'] } };
    const ens06 = { pf: { fonctions: ['ENS-06'] } };
    assert.equal(pfDpMaxDepth('enseignement', dp60, ['Air']), 50);
    assert.equal(pfDpMaxDepth('enseignement', dp40, ['Air']), 6);
    assert.equal(pfDpMaxDepth('enseignement', ens06, ['Air']), 6);
  });
});

describe('pfPalHardLimit — borne stricte sur la profondeur', () => {
  test('exploration air : borné par le rôle non encadrant', () => {
    const limit = pfPalHardLimit({
      membres: [{ aptitude: 'GP-40' }, { aptitude: 'PE-20' }],
      dp: { pf: { fonctions: ['DP-60'] } },
      melanges: ['Air'],
      mode: 'exploration',
    });
    assert.equal(limit, 20);
  });

  test('exploration air : encadrants seuls → plafonné au gaz 50 m', () => {
    const limit = pfPalHardLimit({
      membres: [{ aptitude: 'GP-50' }, { aptitude: 'GP-40' }],
      dp: { pf: { fonctions: ['DP-60'] } },
      melanges: ['Air'],
      mode: 'exploration',
    });
    assert.equal(limit, 50);
  });

  test('enseignement air : dérogation avec DP-60+ porte la limite à 60 m', () => {
    const sansDerog = pfPalHardLimit({
      membres: [{ aptitude: 'ENS-50' }, { aptitude: 'PE-40' }],
      dp: { pf: { fonctions: ['DP-60'] } },
      melanges: ['Air'],
      mode: 'enseignement',
      derogation: false,
    });
    assert.equal(sansDerog, 50);

    const limit = pfPalHardLimit({
      membres: [{ aptitude: 'ENS-50' }, { aptitude: 'PE-40' }],
      dp: { pf: { fonctions: ['DP-60'] } },
      melanges: ['Air'],
      mode: 'enseignement',
      derogation: true,
    });
    assert.equal(limit, 60);

    const limitPA50 = pfPalHardLimit({
      membres: [{ aptitude: 'ENS-50' }, { aptitude: 'PA-50' }],
      dp: { pf: { fonctions: ['DP-60'] } },
      melanges: ['Air'],
      mode: 'enseignement',
      derogation: true,
    });
    assert.equal(limitPA50, 60);
  });

  test('trimix : rôles non encadrants ignorés, plafond trimix 120 m', () => {
    const limit = pfPalHardLimit({
      membres: [{ aptitude: 'GP-50' }, { aptitude: 'PA-50' }],
      dp: { pf: { fonctions: ['DP-120'] } },
      melanges: ['Tx'],
      mode: 'exploration',
    });
    assert.equal(limit, 120);
  });

  test('sessionMax et siteMax respectés', () => {
    const limit = pfPalHardLimit({
      membres: [{ aptitude: 'GP-40' }, { aptitude: 'PA-40' }],
      dp: { pf: { fonctions: ['DP-60'] } },
      melanges: ['Air'],
      mode: 'exploration',
      siteMax: 35,
    });
    assert.equal(limit, 35);
  });
});

describe('pfPalMode — déduction du mode', () => {
  test('mode explicite préservé sauf si novice en exploration', () => {
    assert.equal(pfPalMode({ mode: 'exploration', membres: [{ aptitude: 'PE-20' }] }), 'exploration');
    assert.equal(pfPalMode({ mode: 'enseignement', membres: [{ aptitude: 'PE-20' }] }), 'enseignement');
    assert.equal(pfPalMode({ mode: 'exploration', membres: [{ aptitude: 'Baptême' }] }), 'enseignement');
    assert.equal(pfPalMode({ mode: 'exploration', membres: [{ aptitude: 'Débutant' }] }), 'enseignement');
  });

  test('déduction par défaut selon rôles présents', () => {
    assert.equal(pfPalMode({ membres: [{ aptitude: 'PE-20' }] }), 'exploration');
    assert.equal(pfPalMode({ membres: [{ aptitude: 'ENS-20' }, { aptitude: 'PE-20' }] }), 'enseignement');
    assert.equal(pfPalMode({ membres: [{ aptitude: 'GP-40' }, { aptitude: 'PE-20' }] }), 'exploration');
  });
});

describe('pfPalType — typologie d’affichage de palanquée', () => {
  test('baptême présent → bapteme', () => {
    assert.equal(pfPalType([{ aptitude: 'Baptême' }], 'enseignement'), 'bapteme');
    assert.equal(pfPalType([{ _bapteme: true }], 'exploration'), 'bapteme');
  });

  test('mode formation → formation', () => {
    assert.equal(pfPalType([{ aptitude: 'ENS-20' }, { aptitude: 'PE-12' }], 'enseignement'), 'formation');
  });

  test('exploration encadrée → guidee', () => {
    assert.equal(pfPalType([{ aptitude: 'GP-40' }, { aptitude: 'PE-20' }], 'exploration'), 'guidee');
  });

  test('exploration en autonomie → exploration', () => {
    assert.equal(pfPalType([{ aptitude: 'PA-20' }, { aptitude: 'PA-20' }], 'exploration'), 'exploration');
  });
});

describe('pfAvailableMelanges — mélanges disponibles selon le DP', () => {
  test('DP sans gaz spécifique → Air autorisé, Nx et Tx interdits avec raison', () => {
    const dp = { pf: { fonctions: ['DP-40'], gaz: [] } };
    const res = pfAvailableMelanges(dp);
    const air = res.find((m) => m.value === 'Air');
    const nx40 = res.find((m) => m.value === 'Nx ≤ 40%');
    const nxPlus = res.find((m) => m.value === 'Nx > 40%');
    const tx = res.find((m) => m.value === 'Tx');

    assert.ok(air.allowed);
    assert.ok(!nx40.allowed);
    assert.ok(nx40.reason.includes('PN'));
    assert.ok(!nxPlus.allowed);
    assert.ok(nxPlus.reason.includes('PN-C'));
    assert.ok(!tx.allowed);
    assert.ok(tx.reason.includes('DP-70'));
  });

  test('DP avec PN-C et DP-70 → tous autorisés', () => {
    const dp = { pf: { fonctions: ['DP-70'], gaz: ['PN', 'PN-C', 'PTH-50', 'PTH-70'] } };
    const res = pfAvailableMelanges(dp);
    assert.ok(res.every((m) => m.allowed));
  });
});

describe('pfIsDpCandidate & pfIsEnseignantRole', () => {
  test('pfIsDpCandidate vrai si DP-xx ou ENS-xx', () => {
    assert.ok(pfIsDpCandidate({ pf: { fonctions: ['DP-40'] } }));
    assert.ok(pfIsDpCandidate({ pf: { fonctions: ['ENS-06'] } }));
    assert.ok(!pfIsDpCandidate({ pf: { fonctions: ['GP-40'] } }));
    assert.ok(!pfIsDpCandidate({ pf: { fonctions: [] } }));
  });

  test('pfIsEnseignantRole vrai si ENS-xx', () => {
    assert.ok(pfIsEnseignantRole('ENS-06'));
    assert.ok(pfIsEnseignantRole('ENS-50'));
    assert.ok(!pfIsEnseignantRole('GP-40'));
    assert.ok(!pfIsEnseignantRole('DP-60'));
    assert.ok(!pfIsEnseignantRole('PE-20'));
    assert.ok(!pfIsEnseignantRole('Baptême'));
  });
});
