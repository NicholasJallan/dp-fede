// @ts-check
// DP Assistant — Point d'entrée du domaine métier (règles FFESSM / Code du sport).
//
// Modules purs, sans React ni DOM : importables tels quels par le bundle
// navigateur et par les tests Node (node --test).

export { CDS } from './cds-tables.js';
export { REGLEMENTATION } from './reglementation.js';
export {
  APTITUDE_MAP,
  getDpMaxDepth,
  getFormationBonusAptitudes,
  getDiverAptitudes,
  aptitudeMaxDepth,
  getPalType,
  getAvailableMelanges,
} from './aptitudes.js';
export { CDS_ARTICLES, parseCdsRefs } from './cds-articles.js';
export { LEVELS, STRUCTURE_LABELS } from './levels.js';
export { QUESTIONS } from './questions.js';
export { CHECKLIST_RULES } from './checklist.js';
export { matchCondition } from './conditions.js';
export { getMilieuType, isMilieuNaturel } from './milieu.js';
export { sortMembresForFiche } from './fiche.js';
export { PALIER_DEPTHS, initialPaliers, paliersDone, paliersTotal, formatPaliers } from './paliers.js';
export { getEmergencyInfo } from './emergency.js';
export { computePalHardLimit, clampProfMax } from './depth-clamp.js';
export { minDtr, dtrForProf } from './dtr.js';
export {
  validatePal,
  derivePalMode,
  getMaxEnsLevel,
  peLevel,
  paLevel,
  diverFullName,
  isBassinDerogation,
  hasGasQual,
  palGas,
  withDecoO2,
  ENS_LEVELS,
} from './pal-rules.js';
