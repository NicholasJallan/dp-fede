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
 * @property {string} [diplome_pro]
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
 * @property {string} id  diver id
 * @property {Aptitude} aptitude
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
 * @property {string} [melange]
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
