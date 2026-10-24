// @ts-check
// DP Assistant — Types métier (JSDoc) partagés par les modules du domaine.
// Aucun code exécutable : importer ce module n'a pas d'effet.

/**
 * @typedef {'N1'|'N2'|'N3'|''|null} NiveauPlongeur
 * @typedef {'N4'|'N5'|'E1'|'E2'|'E3'|'E4'|''|null} NiveauEncadrant
 * @typedef {'PA12'|'PA20'|'PA40'|'PA60'|'PE20'|'PE40'|'PE60'|'PTH70'|'PTH120'|'GP'|'Baptême'|'E1'|'E2'|'E3'|'E4'|''|null} Aptitude
 */

/**
 * @typedef {Object} Diver
 * @property {string} id
 * @property {string} nom
 * @property {string} prenom
 * @property {string} [licence]
 * @property {NiveauPlongeur} [niveau_plongeur]
 * @property {NiveauEncadrant} [niveau_encadrant]
 * @property {string[]} [aptitudes_sup]
 * @property {boolean} [rifap]
 * @property {boolean} [tiv]
 * @property {string[]} [nitrox]   'PN' | 'PN-C'
 * @property {string[]} [trimix]   'PTH-40' | 'PTH-70' | 'PTH-120'
 * @property {string[]} [recycleurs]
 * @property {string} [date_naissance]  AAAA-MM-JJ
 * @property {string} [diplome_pro]   code de DIPLOMES_PRO (encadrement.js)
 * @property {NiveauEncadrant} [niveau_encadrant_annuaire]  niveau saisi, quand diverForCadre l'a remplacé
 * @property {boolean} [dp_diplome_pro_requis]  enseignant sans diplôme pro en SCA : pas DP (diverForCadre)
 * @property {string} [medical]
 * @property {string} [notes]
 * @property {string} [deleted_at]
 */

/**
 * @typedef {Object} Site
 * @property {string} id
 * @property {string} nom
 * @property {string} milieu  ex: 'En mer', 'Lac', 'Piscine'
 * @property {number|string} [profondeur_max]
 * @property {string} [notes]
 * @property {boolean} [depart_bord]
 * @property {boolean} [depart_bateau]
 * @property {string} [acces_secours]
 * @property {string} [caisson]
 * @property {string} [ville]
 * @property {string} [pays]
 * @property {string} [pays_code]
 * @property {{lat: number, lng: number}|null} [coordonnees]
 * @property {string} [deleted_at]
 */

/**
 * @typedef {Object} PalMembre
 * @property {string} [diverId]  id du plongeur de l'annuaire (absent pour un baptême saisi)
 * @property {Aptitude} aptitude
 * @property {boolean} [_bapteme]  baptisé saisi à la volée (nom, prénom), hors annuaire
 * @property {string} [nom]
 * @property {string} [prenom]
 */

/**
 * @typedef {Object} Palanquee
 * @property {string} id
 * @property {string} [nom]
 * @property {PalMembre[]} membres
 * @property {number} profMax  profondeur max en mètres
 * @property {number} duree    durée en minutes
 * @property {number} dtr      DTR sans déco en minutes
 * @property {boolean} [no_deco]
 * @property {string[]} [melanges]  'Air' | 'Nx ≤ 40%' | 'Nx > 40%' | 'Tx' | 'O2'
 * @property {'enseignement'|'exploration'} [mode]
 * @property {number|string} [o2]       % d'O₂ du gaz fond (nitrox)
 * @property {number|string} [o2_deco]  % d'O₂ du gaz de déco
 */

/**
 * @typedef {Object} Answers
 * @property {string} [date]
 * @property {string} [site_id]
 * @property {string} [site_nom]
 * @property {string} [milieu]
 * @property {string} [activite]  'Exploration'|'Enseignement'|'Mixte'
 * @property {string} [dp_id]
 * @property {string} [dp_nom]
 * @property {NiveauEncadrant} [dp_qual]
 * @property {boolean} [depart_bord]
 * @property {boolean} [depart_bateau]
 * @property {boolean} [mineurs]
 * @property {boolean} [handisub]
 * @property {boolean} [etrangers]
 * @property {boolean} [air]
 * @property {boolean} [nitrox]
 * @property {boolean} [trimix]
 * @property {boolean} [recycleur]
 * @property {string} [structure]
 * @property {string} [fiche_observations]
 * @property {string} [site_acces_secours]
 * @property {string} [site_caisson]
 */

/**
 * @typedef {Object} RenderState
 * @property {{[palId: string]: string}} [pressions]
 * @property {{[palId: string]: boolean}} [realises]
 * @property {{[palId: string]: string}} [heuresDebut]
 * @property {{[palId: string]: number}} [departs] instant exact (ms) de mise à l'eau, pour le chronomètre
 * @property {{[palId: string]: string}} [heuresFin]
 * @property {{[itemId: string]: boolean}} [checked]
 * @property {{[itemId: string]: string}} [comments]
 */

/**
 * @typedef {Object} Dive
 * @property {string} id
 * @property {string} [client_uuid]
 * @property {'prepared'|'in_progress'|'archived'} status
 * @property {Answers} [answers]
 * @property {Palanquee[]} [palanquees]
 * @property {RenderState} [render_state]
 * @property {string} [site_nom]
 * @property {string} [dp_nom]
 * @property {NiveauEncadrant} [dp_qual]
 * @property {string} [date_plongee]
 * @property {string} [planned_at]
 * @property {string} [started_at]
 * @property {string} [closed_at]
 * @property {string} [deleted_at]
 */

export {};
