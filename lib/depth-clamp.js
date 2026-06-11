// DP Assistant — calcul partagé du plafond de profondeur d'une palanquée.
//
// Ce calcul était dupliqué dans screen-palanquees.jsx (addToPal, setAptitude,
// updateProfMax, addPalAndAddDiver). Une seule source de vérité ici.
//
// La profondeur max effective d'une palanquée est le minimum de :
//   - l'aptitude la plus restrictive parmi ses membres (`aptitudeMaxDepth`)
//   - la profondeur max du DP pour ce type de palanquée (`getDpMaxDepth`)
//
// Si aucune limite n'est définie, on retourne la valeur courante intacte.
(function(root) {
  'use strict';

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
   * @returns {number} Plafond effectif (peut être Infinity)
   */
  function computePalHardLimit({
    membres,
    dp,
    sessionMax,
    aptitudeMaxDepth,
    getPalType,
    getDpMaxDepth,
  }) {
    const list = membres || [];
    const aptLimit = list.length > 0
      ? Math.min(...list.map(m => aptitudeMaxDepth(m.aptitude)))
      : Infinity;
    const palType = getPalType(list);
    const dpLimit = getDpMaxDepth(palType, dp) || Infinity;
    const session = Number.isFinite(sessionMax) ? sessionMax : Infinity;
    return Math.min(aptLimit, session, dpLimit);
  }

  /**
   * Borne une profondeur prévue contre le plafond effectif.
   * Si profMax dépasse le plafond, on rabote ; sinon on garde la valeur.
   */
  function clampProfMax(profMax, hardLimit) {
    if (!Number.isFinite(hardLimit)) return profMax;
    return profMax > hardLimit ? hardLimit : profMax;
  }

  const api = { computePalHardLimit, clampProfMax };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    Object.assign(root, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);
