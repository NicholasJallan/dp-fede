// @ts-check
// DP Assistant — Règles applicables selon la juridiction de la plongée.
//
// Les écrans et la validation passent par rulesFor(juridiction) plutôt que
// d'importer directement le domaine FR. `jurisdiction` indique les règles
// RÉELLEMENT appliquées : la Polynésie (PF) n'est pas encore transcrite et
// retombe sur le Code du sport. Portage PHP : backend/lib/RulesFor.php.

import { getDiverAptitudes, getDpMaxDepth } from './aptitudes.js';
import { CHECKLIST_RULES } from './checklist.js';
import { computePalHardLimit } from './depth-clamp.js';
import { validatePal } from './pal-rules.js';

const FR_RULES = Object.freeze({
  jurisdiction: 'FR',
  validatePal,
  getDiverAptitudes,
  getDpMaxDepth,
  computePalHardLimit,
  checklistRules: CHECKLIST_RULES,
});

/**
 * @param {unknown} _jurisdiction 'FR' | 'PF' (toute autre valeur → FR)
 */
export function rulesFor(_jurisdiction) {
  return FR_RULES;
}
