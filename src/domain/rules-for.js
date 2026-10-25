// @ts-check
// DP Assistant — Règles applicables selon la juridiction de la plongée.
//
// Les écrans et la validation passent par rulesFor(juridiction) plutôt que
// d'importer directement un domaine. Chaque profil expose `validatePal` et
// une API commune à l'interface des palanquées (rôles proposés, plafonds,
// DP, mélanges). Portage PHP de la validation : backend/lib/RulesFor.php.

import { aptitudeMaxDepth, getAvailableMelanges, getDiverAptitudes, getDpMaxDepth, getPalType } from './aptitudes.js';
import { CHECKLIST_RULES } from './checklist.js';
import { computePalHardLimit } from './depth-clamp.js';
import { normalizeJurisdiction } from './jurisdiction.js';
import { derivePalMode, ENS_LEVELS, validatePal } from './pal-rules.js';
import {
  pfAvailableMelanges,
  pfDpMaxDepth,
  pfIsDpCandidate,
  pfIsEnseignantRole,
  pfPalHardLimit,
  pfPalMode,
  pfPalType,
  pfRolesFor,
} from './pf/pf-ui.js';
import { validatePalPf } from './pf/pf-rules.js';

const FR_DP_LEVELS = ['E1', 'E2', 'E3', 'E4', 'N5'];

const FR_RULES = Object.freeze({
  jurisdiction: 'FR',
  validatePal,
  checklistRules: CHECKLIST_RULES,
  // Accès historiques (code du sport).
  getDiverAptitudes,
  getDpMaxDepth,
  computePalHardLimit,
  // API commune.
  rolesFor: (diver, palContext) => getDiverAptitudes(diver, false, palContext),
  palHardLimit: (args) => computePalHardLimit({ ...args, aptitudeMaxDepth, getPalType, getDpMaxDepth }),
  dpMaxDepth: (mode, dp) => getDpMaxDepth(mode === 'enseignement' ? 'formation' : 'exploration', dp),
  palMode: derivePalMode,
  palType: getPalType,
  availableMelanges: getAvailableMelanges,
  isDpCandidate: (diver) => FR_DP_LEVELS.includes(diver?.niveau_encadrant),
  isEnseignantRole: (role) => ENS_LEVELS.includes(role),
});

const PF_RULES = Object.freeze({
  jurisdiction: 'PF',
  validatePal: validatePalPf,
  checklistRules: CHECKLIST_RULES,
  rolesFor: (diver) => pfRolesFor(diver),
  palHardLimit: pfPalHardLimit,
  dpMaxDepth: pfDpMaxDepth,
  palMode: pfPalMode,
  palType: pfPalType,
  availableMelanges: pfAvailableMelanges,
  isDpCandidate: pfIsDpCandidate,
  isEnseignantRole: pfIsEnseignantRole,
});

/**
 * @param {unknown} jurisdiction 'FR' | 'PF' (toute autre valeur → FR)
 */
export function rulesFor(jurisdiction) {
  return normalizeJurisdiction(jurisdiction) === 'PF' ? PF_RULES : FR_RULES;
}
