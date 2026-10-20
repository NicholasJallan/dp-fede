// Test harness — expose les modules métier (src/domain/*) sous un objet unique.
//
// Les règles sont des modules ES purs : plus de faux `window` ni d'eval.
// L'objet par défaut regroupe tous les exports pour que les tests puissent
// déstructurer ce dont ils ont besoin (`const { validatePal } = win;`).

import * as domain from '../src/domain/index.js';

const win = { ...domain };

export default win;
