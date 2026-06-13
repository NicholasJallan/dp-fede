// @ts-check
// DP Assistant — Données métier (v2)
// Niveaux, aptitudes, règles Code du Sport (Annexes III-15a, III-16a/b, Art. A322-xx)

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

// =========================================================================
// VEILLE RÉGLEMENTAIRE
// Date du dernier texte du Code du Sport intégré dans les règles ci-dessous.
// Affichée discrètement (fiche / écran compte) pour tracer la base
// réglementaire de la fiche de sécurité archivée.
// Derniers textes connus : arrêtés des 17 oct. 2025 et 24 nov. 2025
// (modification de l'annexe III-15a — qualifications DP).
// =========================================================================
window.REGLEMENTATION = {
  // Date jusqu'à laquelle les règles métier sont à jour.
  aJour: '2025-11-26',
  label: 'Code du Sport — règles à jour au 26/11/2025',
  // Référence des derniers textes pris en compte.
  textes: 'Arrêtés des 17 oct. 2025 et 24 nov. 2025 (annexe III-15a).',
};

// =========================================================================
// MAPPING NIVEAU → APTITUDES (Annexes III-15a, III-16a/b)
// mandatory : toujours acquis avec ce niveau
// optional  : possible (aptitudes_sup dans le profil du plongeur)
// =========================================================================
window.APTITUDE_MAP = {
  N1: { mandatory: ['PE20'],                       optional: ['PA12','PA20'] },
  N2: { mandatory: ['PE20','PE40','PA12','PA20'],  optional: ['PA40'] },
  // N3 = autonome 60 m → PA60 inclus de droit
  N3: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60'], optional: [] },
  // Encadrants : toutes les aptitudes plongeur N3 (PA60 inclus) + rôle encadrant
  N4: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60','GP'], optional: [] },
  N5: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60'],      optional: [] },
  E1: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60'],      optional: ['GP','Enseignant'] },
  E2: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60'],      optional: ['GP','Enseignant'] },
  E3: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60','GP','Enseignant'], optional: [] },
  E4: { mandatory: ['PE20','PE40','PE60','PA12','PA20','PA40','PA60','GP','Enseignant'], optional: [] },
};

// Profondeurs max autorisées par qualification DP (Art. A322-86)
// formation : profondeur max en contexte formation/enseignement
// exploration : profondeur max en contexte exploration
window.DP_DEPTH_RULES = {
  E1: { formation: 6,  exploration: 0  },
  E2: { formation: 20, exploration: 0  },
  E3: { formation: 40, exploration: 60 },
  E4: { formation: 60, exploration: 60 },
  N5: { formation: 0,  exploration: 60 },
};

/**
 * Profondeur max autorisée pour le DP dans un contexte donné.
 *
 * Extensions Trimix (PTH-120) applicables uniquement à E3/E4 :
 *   E3 + PTH-120 → formation 40 m (pas d'extension), exploration 70 m
 *   E4 + PTH-120 → formation 80 m, exploration 120 m
 * PTH-70 ne donne aucune extension côté DP.
 *
 * @param {'formation'|'bapteme'|'exploration'|'guidee'} palType
 * @param {{niveau_encadrant?:string, trimix?:string[]}|null} dp
 * @returns {number} Profondeur max en mètres (0 = type interdit pour ce DP)
 */
window.getDpMaxDepth = function(palType, dp) {
  const ne = dp?.niveau_encadrant || '';
  const rules = window.DP_DEPTH_RULES[ne] || { formation: 0, exploration: 0 };
  const isTraining = palType === 'formation' || palType === 'bapteme';
  const base = isTraining ? (rules.formation || 0) : (rules.exploration || 0);
  const pth120 = (dp?.trimix || []).includes('PTH-120');
  if (!pth120) return base;
  if (isTraining) {
    if (ne === 'E4') return Math.max(base, 80);
    return base; // E3 formation : pas d'extension PTH-120
  }
  if (ne === 'E3') return Math.max(base, 70);
  if (ne === 'E4') return Math.max(base, 120);
  return base;
};

/**
 * Options de prof_max disponibles selon DP × site × Trimix DP.
 * Réf : Code du Sport Art. A322-86.
 *
 * On affiche toutes les profondeurs accessibles au DP (union formation +
 * exploration). La restriction par type d'activité s'applique à la
 * validation des palanquées, pas au choix de la profondeur de session.
 *
 * @param {string} niveauEncadrant  Niveau du DP ('E1'..'E4', 'N5')
 * @param {string} activite         Activité prévue (informative)
 * @param {{trimix?:string[]}|null} dp  Plongeur DP (peut contenir PTH-120)
 * @param {{profondeur_max?:number}|null} site  Site sélectionné
 * @returns {string[]} Liste de labels (ex: ['6 m','12 m','20 m'])
 */
window.getProfOptions = function(niveauEncadrant, activite, dp, site) {
  // dp peut être absent : on simule un DP avec juste le niveau encadrant
  const dpForMax = { niveau_encadrant: niveauEncadrant, trimix: dp?.trimix || [] };
  const maxForm = window.getDpMaxDepth('formation',   dpForMax);
  const maxExp  = window.getDpMaxDepth('exploration', dpForMax);
  let max = Math.max(maxForm || 0, maxExp || 0);
  if (max === 0) return [];

  // Limite par profondeur du site (on accepte l'échelon juste au-dessus)
  const siteMax = site?.profondeur_max || null;
  let candidates = [6, 12, 20, 40, 60, 70, 80, 120];
  if (siteMax) {
    const above = candidates.filter(d => d > siteMax);
    const nextStep = above.length > 0 ? above[0] : null;
    candidates = candidates.filter(d => d <= siteMax || d === nextStep);
  }

  return candidates.filter(d => d <= max).map(d => d + ' m');
};

/**
 * Aptitudes "bonus" en formation accordées par la présence d'un enseignant
 * (E1→E4). Un élève peut accéder à l'aptitude PE supérieure si l'enseignant
 * a la prérogative d'enseigner ce niveau (E3→PE40, E4→PE60).
 * @param {Diver|null} diver
 * @param {NiveauEncadrant|null} maxEnsLevel  niveau max enseignant dans la palanquée
 * @returns {string[]}
 */
window.getFormationBonusAptitudes = function(diver, maxEnsLevel) {
  if (!diver || !maxEnsLevel) return [];
  const np = diver.niveau_plongeur || null;
  const ne = diver.niveau_encadrant || null;
  if (ne) return []; // les encadrants ont déjà toutes les aptitudes plongeur
  if (np === 'N1' && ['E3','E4'].includes(maxEnsLevel)) return ['PE40'];
  if (np === 'N2' && maxEnsLevel === 'E4')             return ['PE60'];
  return [];
};

/**
 * Aptitudes disponibles pour un plongeur sur une plongée donnée.
 * Retourne la liste ordonnée des prérogatives qu'il peut avoir dans une palanquée.
 *
 * @param {object}   diver          { niveau_plongeur?, niveau_encadrant?, trimix?, aptitudes_sup? }
 * @param {boolean=} isExploration  true si la session DP est en exploration pure (N5)
 * @param {{maxEnsLevel?:string}=} palContext Étend les aptitudes en formation si la palanquée contient un E1→E4
 * @returns {string[]} Aptitudes triées dans l'ordre canonique
 */
window.getDiverAptitudes = function(diver, isExploration, palContext) {
  const np  = diver.niveau_plongeur  || null;
  const ne  = diver.niveau_encadrant || null;
  const trimix = diver.trimix || [];
  const sup    = diver.aptitudes_sup || [];
  const apts   = new Set();
  const maxEnsLevel = palContext?.maxEnsLevel || null;

  // Licencié débutant (sans aucun niveau) : Baptême ou PE20 (en formation uniquement).
  // La validation palanquée garantit la présence d'un enseignant E1→E4.
  if (!np && !ne) { apts.add('Baptême'); apts.add('PE20'); return [...apts]; }

  // Aptitudes du niveau plongeur (selon Annexes FFESSM / Code du Sport)
  if (np === 'N1') {
    apts.add('PE20');
    if (sup.includes('PA12')) apts.add('PA12');
    if (sup.includes('PA20')) apts.add('PA20');
  }
  if (np === 'N2') {
    apts.add('PE20'); apts.add('PE40');
    apts.add('PA12'); apts.add('PA20');
    if (sup.includes('PA40')) apts.add('PA40');
  }
  if (np === 'N3') {
    apts.add('PE20'); apts.add('PE40'); apts.add('PE60');
    apts.add('PA12'); apts.add('PA20'); apts.add('PA40'); apts.add('PA60');
  }

  // Encadrants : aptitudes plongeur N3 + rôle encadrant
  if (ne) {
    apts.add('PE20'); apts.add('PE40'); apts.add('PE60');
    apts.add('PA12'); apts.add('PA20'); apts.add('PA40'); apts.add('PA60');

    if (ne === 'N4') apts.add('GP');
    else if (ne === 'N5') { /* N5 = DP plongeur, pas guide */ }
    else if (['E1','E2'].includes(ne)) {
      if (sup.includes('GP')) apts.add('GP');
      apts.add(ne); // Enseignant
    }
    else if (['E3','E4'].includes(ne)) {
      apts.add('GP');
      apts.add(ne); // Enseignant
    }
  }

  // Trimix
  if (trimix.includes('PTH-70') || trimix.includes('PTH-120')) apts.add('PTH70');
  if (trimix.includes('PTH-120')) apts.add('PTH120');

  // Bonus formation : PE niveau supérieur si enseignant suffisant dans la palanquée
  window.getFormationBonusAptitudes(diver, maxEnsLevel).forEach(a => apts.add(a));

  // Ordre canonique : Baptême < PE < PA < GP < Enseignant
  const ORDER = ['Baptême','PE20','PE40','PE60','PA12','PA20','PA40','PA60',
                 'PTH70','PTH120','GP','E1','E2','E3','E4'];
  return ORDER.filter(a => apts.has(a));
};

/**
 * Profondeur max accessible pour une aptitude donnée.
 * Fallback à 60 m pour une aptitude inconnue (sécurité par défaut côté MFT FFESSM).
 *
 * @param {string} aptitude  Code aptitude (ex: 'PE40', 'PA60', 'GP', 'E3', 'PTH120')
 * @returns {number} Mètres
 */
window.aptitudeMaxDepth = function(aptitude) {
  const map = {
    'Baptême': 6,
    'PE20': 20, 'PE40': 40, 'PE60': 60,
    'PA12': 12, 'PA20': 20, 'PA40': 40, 'PA60': 60,
    'GP':   60,
    'E1':   6,  'E2': 20, 'E3': 40, 'E4': 60,
    'PTH70': 70, 'PTH120': 120,
  };
  return map[aptitude] ?? 60;
};

/**
 * Type de palanquée (utilisé pour la couleur et les règles métier).
 * Ordre de priorité : baptême > formation > guidée > exploration.
 *
 * @param {Array<{aptitude?:string}>} membres
 * @returns {'bapteme'|'formation'|'guidee'|'exploration'}
 */
window.getPalType = function(membres) {
  const apts = membres.map(m => m.aptitude || '');
  if (apts.includes('Baptême'))                        return 'bapteme';
  if (apts.some(a => ['E1','E2','E3','E4'].includes(a))) return 'formation';
  if (apts.includes('GP') && apts.some(a => a.startsWith('PE'))) return 'guidee';
  return 'exploration';
};

/**
 * Mélanges disponibles selon les qualifications du Directeur de Plongée.
 *   Air        : toujours autorisé.
 *   Nx ≤ 40 %  : DP doit être PN-C (règle interne stricte, plus restrictive que CdS).
 *   Nx > 40 %  : DP doit être PN-C.
 *   Tx (trimix): DP doit être PTH-120 ET E3 ou E4
 *               (E1/E2/N5 ne peuvent jamais diriger une plongée trimix).
 *
 * @param {{niveau_encadrant?:string, nitrox?:string[], trimix?:string[]}|null} dp
 * @returns {Array<{value:string, allowed:boolean, reason:string|null}>}
 */
window.getAvailableMelanges = function(dp) {
  const nitrox    = dp?.nitrox || [];
  const trimix    = dp?.trimix || [];
  const ne        = dp?.niveau_encadrant || '';
  const hasPNC    = nitrox.includes('PN-C');
  const hasPTH120 = trimix.includes('PTH-120');
  const canTrimix = hasPTH120 && (ne === 'E3' || ne === 'E4');
  return [
    { value:'Air',      allowed:true,      reason:null },
    { value:'Nx ≤ 40%', allowed:hasPNC,    reason:'DP doit être PN-C' },
    { value:'Nx > 40%', allowed:hasPNC,    reason:'DP doit être PN-C' },
    { value:'Tx',       allowed:canTrimix, reason:'DP doit être PTH-120 (E3/E4)' },
  ];
};

// =========================================================================
// CODE DU SPORT — Dictionnaire des articles cités
// Tooltip de résumé + lien Légifrance
// =========================================================================
// LEGIARTI IDs vérifiés sur legifrance.gouv.fr (mai 2026).
// Code du sport, Section 3 du Chapitre II (plongée subaquatique) : LEGISCTA000018751673.
window.CDS_ARTICLES = {
  'A322-72': {
    title: 'Directeur de plongée — responsabilités',
    summary: 'La pratique de la plongée est placée sous la responsabilité d\'un directeur de plongée présent au lieu d\'entrée ou d\'immersion. Il fixe les caractéristiques de la plongée et est garant des conditions de sécurité.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393876',
  },
  'A322-77': {
    title: 'Information des pratiquants',
    summary: 'Le responsable de l\'établissement informe les plongeurs des conditions de pratique et leur fait connaître l\'existence des espaces d\'évolution.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025705105',
  },
  'A322-78': {
    title: 'Matériel de secours et d\'assistance',
    summary: 'Sur le site : oxygénothérapie médicale normobare, BAVU avec masques toutes tailles, tables de décompression, eau douce potable, bouteille d\'air ou de mélange suralimentaire, moyens de communication avec les secours.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393863',
  },
  'A322-86': {
    title: 'Espaces d\'évolution — profondeurs',
    summary: 'Plongées en milieu naturel à l\'air : profondeurs réparties par espaces de 0-6 m, 0-12 m, 0-20 m, 0-40 m, 0-60 m, supérieur à 60 m. Tableau par niveau du plongeur et de l\'encadrement.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393833',
  },
  'A322-89': {
    title: 'Plongée au Nitrox',
    summary: 'Plongée avec mélanges suroxygénés : chaque bloc doit être analysé et étiqueté (% O₂, MOD). Qualifications PN ou PN-C requises selon la PpO2 du mélange utilisé.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393827',
  },
  'A322-91': {
    title: 'Plongée Trimix / Héliox',
    summary: 'Plongées avec mélanges Trimix ou Héliox : analyse des mélanges, planification de décompression, ligne lestée pour la descente/remontée (« shot-line ») et sécurité surface continue obligatoires.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393819',
  },
  'A322-94': {
    title: 'Plongée en recycleur (CCR / SCR)',
    summary: 'Check-list constructeur avant chaque plongée, pré-breathing, validation des aptitudes. Au-delà de 6 m : circuit ouvert de secours obligatoire pour chaque plongeur.',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393813',
  },
};

// Parse "Art. A322-72" ou "CdS A322-89/91" → ['A322-72'] ou ['A322-89','A322-91']
window.parseCdsRefs = function(text) {
  if (!text) return [];
  const refs = [];
  const re = /A322-(\d+(?:-\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    refs.push('A322-' + m[1]);
  }
  return refs;
};

/**
 * DTR sans déco (règle opérationnelle FFESSM) : 1 min / 10 m.
 * @param {number} profMax
 * @returns {number}
 */
window.calcDTR = function(profMax) {
  return Math.ceil((profMax || 0) / 10);
};

// =========================================================================
// LEVELS — étiquettes affichables + flag canBeDP (le seul attribut consommé)
// =========================================================================
window.LEVELS = {
  E1: { label:'E1 — Initiateur club',        canBeDP:false },
  E2: { label:'E2 — Initiateur / MF1 stag.', canBeDP:false },
  E3: { label:'E3 — MF1',                    canBeDP:true  },
  E4: { label:'E4 — MF2',                    canBeDP:true  },
  N5: { label:'N5 — DP plongeur',            canBeDP:true  },
  N4: { label:'N4 / GP — Guide de palanquée' },
  N3: { label:'N3 — PA-60 / PE-60'           },
  N2: { label:'N2 — PE-40 / PA-20'           },
  N1: { label:'N1 — PE-20'                   },
};

// =========================================================================
// QUESTIONNAIRE (sections A → H)
// =========================================================================
window.QUESTIONS = [
  {
    id:'A', title:'Contexte général',
    questions:[
      { id:'date',      label:'Date et heure prévue de mise à l\'eau', type:'datetime', required:true },
      { id:'dp_id',     label:'Directeur de Plongée', type:'dp-picker', required:true,
        hint:'Filtré sur E1→E4 et N5 — la qualification est déduite automatiquement.' },
      { id:'structure', label:'Type de structure', type:'structure-display',
        hint:'Renseigné dans Paramètres → Mon compte.' },
    ]
  },
  {
    id:'B', title:'Lieu & logistique',
    questions:[
      { id:'site_id',    label:'Site de plongée', type:'site-picker', required:true,
        hint:'Choisir parmi les sites enregistrés, ou cliquer + pour en créer un.' },
      { id:'shot_line',  label:'Shot-line installée pour cette plongée ?', type:'bool',
        hint:'Shot-line = ligne lestée de descente/remontée. Obligatoire pour le Trimix. Indépendante du site.' },
      { id:'meteo',      label:'Conditions météo / mer / courant / visibilité', type:'meteo-field',
        placeholder:'Vent, état de la mer, courant, visibilité estimée…',
        when:(a) => window.isMilieuNaturel(a.milieu) },
      { id:'maree_relevant', label:'Informations de marée pertinentes ?', type:'bool',
        when:(a) => {
          const m = window.getMilieuType(a.milieu);
          return m === 'mer' && (a.site_atlantique === true || a.site_atlantique === undefined);
        },
        hint:'À cocher pour les plongées en Atlantique / Manche / Mer du Nord.' },
      { id:'maree_horaire', label:'Heure et coefficient de marée', type:'text',
        placeholder:'PM 14h12 · coef 87', when:{maree_relevant:true} },
      { id:'vhf',        label:'VHF à bord ?', type:'bool', when:{depart_bateau:true}, ref:'Bonne pratique' },
      { id:'chef_bord',  label:'Pilote / chef de bord désigné ?', type:'bool', when:{depart_bateau:true} },
      { id:'pavillon_alpha', label:'Pavillon Alpha hissé prévu ?', type:'bool', when:{depart_bateau:true} },
      { id:'distance_cote', label:'Distance prévue à la côte (M nautiques)', type:'number',
        suffix:'M nautiques', when:{depart_bateau:true} },
    ]
  },
  {
    id:'C', title:'Profondeur & espaces d\'évolution',
    questions:[
      { id:'paliers',    label:'Plongée avec paliers obligatoires autorisée ?', type:'bool' },
      { id:'successive', label:'Plongée successive prévue dans la journée ?', type:'bool' },
    ]
  },
  {
    id:'E', title:'Matériel particulier',
    questions:[
      { id:'recycleur',   label:'Recycleurs (CCR / SCR) ?', type:'bool', ref:'CdS A322-94' },
      { id:'recycleur_modeles', label:'Modèles et diluant', type:'textarea',
        placeholder:'ex. JJ-CCR — diluant air — 2 plongeurs', when:{recycleur:true} },
      { id:'mixage_co_rec', label:'Mixage circuit ouvert + recycleur dans une même palanquée ?',
        type:'bool', when:{recycleur:true} },
      { id:'bloc_relais',  label:'Bloc relais / déco prévu ?', type:'bool' },
      { id:'bloc_relais_gaz', label:'Gaz du bloc relais / déco', type:'multi',
        options:['Air','Nx < 40 %','Nx > 40 %','O₂','Tx adapté'], cols:5, when:{bloc_relais:true} },
      { id:'parachute_obligatoire', label:'Déployer un parachute de palier obligatoirement pour chaque palanquée ?',
        type:'bool' },
      { id:'parachute_par_plongeur', label:'Chaque plongeur doit avoir un parachute avec lui ?', type:'bool' },
    ]
  },
  {
    id:'F', title:'Public',
    questions:[
      { id:'mineurs',    label:'Présence de mineurs ?', type:'bool' },
      { id:'etrangers',  label:'Brevets étrangers non français (PADI, SSI, CMAS étr.) ?', type:'bool',
        hint:'→ évaluation par un E3 prévue' },
      { id:'handisub',   label:'Plongeurs en situation de handicap (handisub) ?', type:'bool' },
    ]
  },
  {
    id:'G', title:'Sécurité surface',
    questions:[
      { id:'sec_surface',          label:'Sécurité surface identifiée (personne dédiée) ?', type:'bool', ref:'CdS A322-78' },
      { id:'sec_surface_membres',  label:'Plongeur(s) en surveillance surface (rotation possible)', type:'divers-multi',
        hint:'Choisir parmi les plongeurs présents — plusieurs peuvent se relayer.',
        when:{sec_surface:true} },
      { id:'sec_surface_externes', label:'Autres personnes en sécurité surface (non-plongeurs)', type:'text',
        placeholder:'Noms / fonctions',
        when:{sec_surface:true} },
      { id:'plan_secours',  label:'Plan de secours affiché et à jour ?', type:'bool' },
      { id:'coords_secours',label:'Coordonnées des secours disponibles ?', type:'bool',
        hint:'Numéros adaptés au pays du site (France : 15/18/112, mer : 196 ; Suisse : 144/117/1414).' },
      { id:'o2',            label:'Matériel O₂ vérifié (pression, BAVU, masques) ?', type:'bool', ref:'CdS A322-78' },
      { id:'trousse',       label:'Trousse de secours + couverture isothermique vérifiées ?', type:'bool' },
      { id:'eau_potable',   label:'Eau douce potable disponible ?', type:'bool' },
      { id:'rappel',        label:'Moyen de rappel des plongeurs (pétard, sondeur) ?', type:'bool',
        when:{depart_bateau:true} },
      { id:'bouee_surface', label:'Bouée / pavillon de signalisation en surface ?', type:'bool',
        when:(a) => window.isMilieuNaturel(a.milieu) },
      { id:'trimix_secu_note', label:'Plongée Trimix : sécurité surface continue obligatoire (Art. A322-91)',
        type:'info', when:{trimix:true} },
    ]
  },
];

// =========================================================================
// CHECK-LIST RULES (2 phases, items conditionnels)
// =========================================================================
window.CHECKLIST_RULES = [
  {
    phase:1, phaseTitle:'Préparation — avant l\'arrivée sur site',
    items:[
      { id:'p1_meteo',         text:'Bulletin météo consulté (vent, mer, courant, visibilité, alerte)', ref:'Bonne pratique', tags:['meteo'],
        when:(a) => window.isMilieuNaturel(a.milieu) },
      { id:'p1_maree',         text:'Heure et coefficient de marée vérifiés', tags:['meteo'], when:{maree_relevant:true} },
      { id:'p1_blocs',         text:'Dates de réépreuve TIV / requalif. blocs des plongeurs OK', ref:'Arrêté 18/11/86', tags:['materiel'] },
      { id:'p1_gonflage',      text:'Gonflage des blocs effectué — pressions contrôlées' },
      { id:'p1_analyse_nx',    text:'Chaque bloc Nitrox analysé et étiqueté (% O₂, MOD, signature plongeur)', ref:'CdS A322-89', tags:['nitrox'], when:{nitrox:true} },
      { id:'p1_analyse_nx_sup', text:'Plongeurs Nx>40 % : qualification PN-C contrôlée + analyse signée', ref:'CdS A322-89', tags:['nitrox'],
        when:(a) => a.nitrox_sup_40 },
      { id:'p1_analyse_tx',    text:'Trimix/Héliox : analyse mélanges + planif décompression validée', ref:'CdS A322-91', tags:['trimix'], when:{trimix:true} },
      { id:'p1_bloc_relais',   text:'Bloc(s) relais / déco analysés et étiquetés', ref:'CdS A322-89/91', tags:['materiel'], when:{bloc_relais:true} },
      { id:'p1_rec_check',     text:'Check-list constructeur de chaque recycleur — pré-breathing', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p1_o2_secours',    text:'Oxygénothérapie : bouteille > 100 bar, BAVU, masques (adulte/enfant)', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_trousse',       text:'Trousse de secours + couverture isothermique vérifiées', tags:['secours'] },
      { id:'p1_doc_plongeurs', text:'Brevets, licences, certificats médicaux à jour pour chaque plongeur', ref:'CdS A322-77', tags:['plongeurs'] },
      { id:'p1_etrangers',     text:'Évaluation par un E3 des plongeurs aux brevets étrangers', ref:'CdS A322-77', tags:['etrangers'], when:{etrangers:true} },
      { id:'p1_mineurs',       text:'Autorisations parentales signées récupérées', tags:['mineurs'], when:{mineurs:true} },
      { id:'p1_vhf_test',      text:'VHF testée + piles secondaires + Canal 16 (détresse) configuré', ref:'Code maritime', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_carburant',     text:'Carburant + matériel de bord (gilets, signaux, mouillage) OK', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_shot_line',     text:'Shot-line (ligne lestée de descente) préparée — lest, longueur, parachutes/bouée de signalisation',
        ref:'CdS A322-91', tags:['materiel'],
        when:(a) => a.shot_line || a.trimix },
      { id:'p1_secours_coord', text:'Coordonnées des secours affichées (pays-appropriées)', ref:'CdS A322-78', tags:['secours'] },
      // NB : la fiche de sécurité pré-remplie n'est plus un item à cocher —
      // l'application EST la fiche (palanquées + paramètres prévus saisis aux
      // étapes précédentes). Plus de question auto-référente (ex-`p1_fiche_init`).
    ]
  },
  {
    phase:2, phaseTitle:'Sur site — avant la mise à l\'eau',
    items:[
      { id:'p2_appel',         text:'Appel nominatif des plongeurs présents — vérification aptitudes' },
      { id:'p2_briefing',      text:'Briefing général : site, profil, paramètres, signes, consignes' },
      { id:'p2_rappels_secu',  text:'Rappels de sécurité individuels communiqués : moyen de rappel, conduite à tenir en cas de perte de palanquée, procédure de remontée d\'urgence', ref:'CdS A322-72', tags:['fiche'] },
      { id:'p2_palanquees',    text:'Composition annoncée — GP / serre-files / autonomes identifiés' },
      { id:'p2_sec_surface',   text:'Sécurité surface en poste — relais identifiés si rotation', ref:'CdS A322-78', tags:['secours'], when:{sec_surface:true} },
      // Ex-`p2_fiche` supprimé : l'application EST la fiche (complétée et
      // accessible sur site par construction). Item auto-référent retiré.
      { id:'p2_pavillon',      text:'Pavillon Alpha hissé sur l\'embarcation', ref:'RIPAM règle 27', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_echelle',       text:'Échelle de remontée déployée — ancrage adapté', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_shot_line_pose', text:'Shot-line installée à l\'eau, lestée et amarrée correctement (obligatoire en Trimix)',
        ref:'CdS A322-91', tags:['materiel'],
        when:(a) => a.shot_line || a.trimix },
      { id:'p2_parachute',     text:'Chaque palanquée a son parachute de palier', tags:['materiel'], when:{parachute_obligatoire:true} },
      { id:'p2_parachute_indiv', text:'Chaque plongeur porte son parachute individuel', tags:['materiel'], when:{parachute_par_plongeur:true} },
      { id:'p2_nx_signature',  text:'Plongeurs Nitrox : signature finale de l\'analyse de leur bloc', ref:'CdS A322-89', tags:['nitrox'], when:{nitrox:true} },
      { id:'p2_rec_aptitudes', text:'Aptitudes recycleur validées + circuit ouvert de secours pour > 6m', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p2_planifs',       text:'Copies des planifs déco remises à chaque palanquée Trimix', ref:'CdS A322-91', tags:['trimix'], when:{trimix:true} },
      { id:'p2_bord_entree',   text:'Points d\'entrée/sortie de l\'eau identifiés et sécurisés', tags:['bord'], when:{depart_bord:true} },
      { id:'p2_go_decision',   text:'Décision finale du DP : conditions OK pour autoriser la mise à l\'eau', ref:'CdS A322-72', tags:['fiche'] },
    ]
  },
];

// =========================================================================
// PAL_RULES retiré : ses constantes (maxEnc, maxPA) n'étaient consommées
// nulle part — la logique conditionnelle est intégrée directement dans
// lib/pal-rules.js (validatePal). Voir tests/pal-rules.test.js pour la
// couverture exhaustive.

// =========================================================================
// Helpers
// =========================================================================
window.matchCondition = function(when, answers) {
  if (!when) return true;
  if (typeof when === 'function') return when(answers);
  for (const key in when) {
    const v = when[key];
    if (key === '_custom') continue;
    if (v === true  && !answers[key]) return false;
    if (v === false &&  answers[key]) return false;
    if (typeof v === 'string' && answers[key] !== v) return false;
  }
  return true;
};

/**
 * Résume le milieu en : 'mer' | 'lac' | 'piscine' | 'fosse'.
 * Gère les valeurs site ('En mer', 'Lac', 'Carrière', 'Piscine') et les anciennes valeurs question.
 * @param {string|null|undefined} milieu
 * @returns {'mer'|'lac'|'piscine'|'fosse'}
 */
window.getMilieuType = function(milieu) {
  if (!milieu) return 'mer';
  const m = milieu.toLowerCase();
  if (m.includes('lac') || m.includes('carrière') || m.includes('carriere')) return 'lac';
  if (m.includes('piscine')) return 'piscine';
  if (m.includes('fosse'))   return 'fosse';
  return 'mer';
};

/**
 * Vrai en milieu naturel (mer / lac / carrière), faux en piscine / fosse.
 * Sert à masquer les items de check-list et questions sans objet en bassin.
 * @param {string|null|undefined} milieu
 * @returns {boolean}
 */
window.isMilieuNaturel = function(milieu) {
  const t = window.getMilieuType(milieu);
  return t !== 'piscine' && t !== 'fosse';
};

// Structure type → label lisible
window.STRUCTURE_LABELS = {
  club: 'Club FFESSM associatif',
  sca:  'Structure Commerciale Agréée (SCA)',
  csa:  'Convention de Section d\'Activité (CSA)',
  autre:'Autre',
};

/**
 * Tri canonique des membres d'une palanquée pour la fiche de sécurité.
 * E4→E1, GP, PE60→PE20, PTH120→PTH70, PA, Baptême.
 * Cas particulier : 2+ GP → le second GP devient serre-file (fin de liste).
 * @param {PalMembre[]} membres
 * @returns {PalMembre[]}
 */
window.sortMembresForFiche = function(membres) {
  const priorityOf = (apt) => {
    switch (apt) {
      case 'E4': return 0;
      case 'E3': return 1;
      case 'E2': return 2;
      case 'E1': return 3;
      case 'GP': return 4;
      case 'PE60': return 5;
      case 'PE40': return 6;
      case 'PE20': return 7;
      case 'PTH120': return 8;
      case 'PTH70': return 9;
      case 'PA12': case 'PA20': case 'PA40': case 'PA60': return 10; // pas de tri interne
      case 'Baptême': return 11;
      default: return 99;
    }
  };
  const sorted = [...membres].sort((a, b) =>
    priorityOf(a.aptitude || '') - priorityOf(b.aptitude || '')
  );
  // 2 GP : le dernier GP du bloc devient serre-file (déplacé en queue)
  const gpCount = sorted.filter(m => m.aptitude === 'GP').length;
  if (gpCount >= 2) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].aptitude === 'GP') {
        const sf = sorted.splice(i, 1)[0];
        sorted.push(sf);
        break;
      }
    }
  }
  return sorted;
};

window.getEmergencyInfo = function(paysCode, milieu) {
  const isMer = milieu && /^en mer$/i.test((milieu || '').trim());
  if (paysCode === 'CH') {
    return {
      secondaryNums: '1414 (REGA · évacuation aérienne) · 117 (Police) · 112 (Europe)',
      vhf: null,
    };
  }
  if (paysCode === 'FR') {
    const parts = ['15 (SAMU)', '112 (Europe)'];
    if (isMer) parts.push('196 (CROSS)');
    return {
      secondaryNums: parts.join(' · '),
      vhf: isMer ? 'Canal 16 (CROSS)' : null,
    };
  }
  const parts = ['112 (Europe)'];
  if (isMer) parts.push('196 (CROSS)');
  parts.push('15 (SAMU FR)', '18 (Pompiers FR)', '144 (CH)', '1414 (REGA CH)');
  return {
    secondaryNums: parts.join(' · '),
    vhf: isMer ? 'Canal 16' : null,
  };
};
