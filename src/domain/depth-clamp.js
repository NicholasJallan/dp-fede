// DP Assistant — calcul partagé du plafond de profondeur d'une palanquée.
//
// Ce calcul était dupliqué dans screen-palanquees.jsx (addToPal, setAptitude,
// updateProfMax, addPalAndAddDiver). Une seule source de vérité ici.
//
// La profondeur max effective d'une palanquée est le minimum de :
//   - l'aptitude la plus restrictive parmi ses membres (`aptitudeMaxDepth`),
//     sauf au trimix où l'espace dépend des qualifications PTH (validation)
//   - la limite absolue du gaz (A322-76 : air/nitrox 60 m, trimix 80/120 m)
//   - la profondeur max du DP pour ce type de palanquée (`getDpMaxDepth`)
//
// Si aucune limite n'est définie, on retourne la valeur courante intacte.
/**
 * Calcule le plafond effectif de profondeur pour une palanquée.
 * Dépendances injectées explicitement → testable en isolation.
 *
 * @param {object}   args
 * @param {Array}    args.membres            - Membres de la palanquée { aptitude }
 * @param {*}        args.dp                 - Objet plongeur DP (peut être null)
 * @param {number}   args.sessionMax         - Profondeur max session (Infinity si non définie)
 * @param {function} args.aptitudeMaxDepth   - (apt) => meters
 * @param {function} args.getPalType         - (membres) => 'bapteme'|'formation'|'guidee'|'exploration'
 * @param {function} args.getDpMaxDepth      - (palType, dp) => meters
 * @param {string[]} [args.melanges]         - Mélanges de la palanquée
 * @param {string}   [args.mode]             - 'enseignement' | 'exploration'
 * @returns {number} Plafond effectif (peut être Infinity)
 */
export function computePalHardLimit({
  membres,
  dp,
  sessionMax,
  siteMax,
  aptitudeMaxDepth,
  getPalType,
  getDpMaxDepth,
  melanges,
  mode,
}) {
  const list = (membres || []).filter(m => m.aptitude);
  const trimix = (melanges || []).includes('Tx');
  const plongeurs = list.filter(m => m.aptitude !== 'GP' && !/^E[1-4]$/.test(m.aptitude));
  const aptLimit = !trimix && plongeurs.length > 0
    ? Math.min(...plongeurs.map(m => aptitudeMaxDepth(m.aptitude)))
    : Infinity;
  const encadre = list.length !== plongeurs.length;
  const gasLimit = trimix ? (encadre ? 80 : 120) : 60;
  const palType = getPalType(list, mode);
  const dpLimit = getDpMaxDepth(palType, dp) || Infinity;
  const session = Number.isFinite(sessionMax) ? sessionMax : Infinity;
  const site    = Number.isFinite(siteMax)    ? siteMax    : Infinity;
  return Math.min(aptLimit, gasLimit, session, dpLimit, site);
}

/**
 * Borne une profondeur prévue contre le plafond effectif.
 * Si profMax dépasse le plafond, on rabote ; sinon on garde la valeur.
 */
export function clampProfMax(profMax, hardLimit) {
  if (!Number.isFinite(hardLimit)) return profMax;
  return profMax > hardLimit ? hardLimit : profMax;
}
