// DP Assistant — Données métier (v2)
// Niveaux, aptitudes, règles Code du Sport (Annexes III-15a, III-16a/b, Art. A322-xx)

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

// Options prof_max disponibles selon DP × activité × site × Trimix DP (Code du Sport Art. A322-86)
// dp : { niveau_encadrant, trimix:[] } (optionnel)
// site : { profondeur_max } (optionnel)
//
// Règle stricte Trimix : seul un DP PTH-120 (et E3 ou E4) peut diriger une
// plongée trimix. PTH-70 ne donne aucune extension de profondeur côté DP.
//   E3 + PTH-120 → 40 m formation, 70 m exploration
//   E4 + PTH-120 → 80 m formation, 120 m exploration
window.getProfOptions = function(niveauEncadrant, activite, dp, site) {
  const isExplo = !activite || activite === 'Exploration';
  const rules = window.DP_DEPTH_RULES[niveauEncadrant] || { formation: 60, exploration: 60 };
  // Si exploration = 0 pour ce DP (E1, E2), fallback sur formation
  let max = isExplo ? (rules.exploration || rules.formation) : rules.formation;
  if (max === 0) return [];

  const trimix = dp?.trimix || [];
  const pth120 = trimix.includes('PTH-120');

  // Extensions trimix : PTH-120 requis, E3/E4 uniquement
  if (pth120 && niveauEncadrant === 'E3') {
    max = isExplo ? Math.max(max, 70) : max;       // 40 form, 70 explo
  }
  if (pth120 && niveauEncadrant === 'E4') {
    max = isExplo ? Math.max(max, 120) : Math.max(max, 80); // 80 form, 120 explo
  }

  // Limite par profondeur du site (on accepte l'échelon juste au-dessus)
  const siteMax = site?.profondeur_max || null;
  let candidates = [6, 12, 20, 40, 60, 70, 80, 120];
  if (siteMax) {
    // Garder les options ≤ siteMax + 1 échelon au-dessus
    const above = candidates.filter(d => d > siteMax);
    const nextStep = above.length > 0 ? above[0] : null;
    candidates = candidates.filter(d => d <= siteMax || d === nextStep);
  }

  return candidates.filter(d => d <= max).map(d => d + ' m');
};

// Aptitudes disponibles pour un plongeur sur une plongée donnée
// Retourne la liste de prérogatives que ce plongeur peut avoir dans une palanquée.
window.getDiverAptitudes = function(diver, isExploration) {
  const np  = diver.niveau_plongeur  || null;
  const ne  = diver.niveau_encadrant || null;
  const trimix = diver.trimix || [];
  const sup    = diver.aptitudes_sup || [];
  const apts   = new Set();

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

  // Ordre canonique : Baptême < PE < PA < GP < Enseignant
  const ORDER = ['Baptême','PE20','PE40','PE60','PA12','PA20','PA40','PA60',
                 'PTH70','PTH120','GP','E1','E2','E3','E4'];
  return ORDER.filter(a => apts.has(a));
};

// Profondeur max accessible pour une aptitude donnée
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

// Type de palanquée pour la mise en forme (couleur)
window.getPalType = function(membres) {
  const apts = membres.map(m => m.aptitude || '');
  if (apts.includes('Baptême'))                        return 'bapteme';
  if (apts.some(a => ['E1','E2','E3','E4'].includes(a))) return 'formation';
  if (apts.includes('GP') && apts.some(a => a.startsWith('PE'))) return 'guidee';
  return 'exploration';
};

// Mélanges disponibles selon les qualifications du Directeur de Plongée.
// Air        : toujours autorisé.
// Nx ≤ 40 %  : DP doit être PN-C (règle interne stricte).
// Nx > 40 %  : DP doit être PN-C.
// Tx (trimix): DP doit être PTH-120 ET de niveau E3 ou E4
//              (E1/E2 ne peuvent jamais diriger une plongée trimix).
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

// DTR sans déco (règle opérationnelle FFESSM) : 1 min / 10 m
window.calcDTR = function(profMax) {
  return Math.ceil((profMax || 0) / 10);
};

// =========================================================================
// LEVELS (référence)
// =========================================================================
window.LEVELS = {
  E1: { kind:'encadrant', label:'E1 — Initiateur club',        maxProfEns:6,  canBeDP:false },
  E2: { kind:'encadrant', label:'E2 — Initiateur / MF1 stag.', maxProfEns:20, canBeDP:false },
  E3: { kind:'encadrant', label:'E3 — MF1',                    maxProfEns:40, canBeDP:true  },
  E4: { kind:'encadrant', label:'E4 — MF2',                    maxProfEns:60, canBeDP:true  },
  N5: { kind:'encadrant', label:'N5 — DP plongeur',            maxProfEns:0,  canBeDP:true  },
  N4: { kind:'plongeur',  label:'N4 / GP — Guide de palanquée',autoMax:60, canBeGuide:true  },
  N3: { kind:'plongeur',  label:'N3 — PA-60 / PE-60',          autoMax:60 },
  N2: { kind:'plongeur',  label:'N2 — PE-40 / PA-20',          autoMax:20 },
  N1: { kind:'plongeur',  label:'N1 — PE-20',                  autoMax:0  },
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
        when:(a) => {
          const m = window.getMilieuType(a.milieu);
          return m !== 'piscine' && m !== 'fosse';
        } },
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
      { id:'prof_max',   label:'Profondeur maximale envisagée', type:'prof-choice',
        ref:'CdS A322-86',
        hint:'Options conditionnées par la qualification du DP et le type d\'activité.' },
      { id:'paliers',    label:'Plongée avec paliers obligatoires autorisée ?', type:'bool' },
      { id:'successive', label:'Plongée successive prévue dans la journée ?', type:'bool' },
    ]
  },
  {
    id:'D', title:'Mélanges respiratoires',
    questions:[
      { id:'air',         label:'Plongeurs à l\'air ?', type:'bool' },
      { id:'nitrox',      label:'Plongeurs au Nitrox ?', type:'bool', ref:'CdS A322-89' },
      { id:'nitrox_kind', label:'Type de Nitrox utilisé (au moins une option requise)', type:'multi',
        options:['Nx ≤ 40 %','Nx > 40 %'], cols:2, when:{nitrox:true},
        hint:'Nx > 40 % nécessite la qualification PN-C.' },
      { id:'nitrox_details', label:'Mélanges Nitrox précis (% O₂, MOD, PpO2 max)', type:'textarea',
        placeholder:'ex. EAN32 — MOD 40 m — PpO2 max 1.4', when:{nitrox:true} },
      { id:'trimix',      label:'Plongeurs au Trimix / Héliox ?', type:'bool', ref:'CdS A322-91' },
      { id:'trimix_kind', label:'Type de mélange', type:'choice',
        options:['Trimix élémentaire','Trimix','Héliox'], cols:3, when:{trimix:true} },
      { id:'oxygene_pur', label:'Plongeurs à l\'oxygène pur (paliers O₂) ?', type:'bool' },
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
      { id:'formation',  label:'Plongeurs en formation ?', type:'bool',
        hint:'Les niveaux et exercices seront déduits de la composition des palanquées.' },
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
      { id:'bouee_surface', label:'Bouée / pavillon de signalisation en surface ?', type:'bool' },
      { id:'trimix_secu_note', label:'Plongée Trimix : sécurité surface continue obligatoire (Art. A322-91)',
        type:'info', when:{trimix:true} },
    ]
  },
];

// =========================================================================
// CHECK-LIST RULES (5 phases, items conditionnels)
// =========================================================================
window.CHECKLIST_RULES = [
  {
    phase:1, phaseTitle:'Préparation — avant l\'arrivée sur site',
    items:[
      { id:'p1_meteo',         text:'Bulletin météo consulté (vent, mer, courant, visibilité, alerte)', ref:'Bonne pratique', tags:['meteo'],
        when:(a) => { const m = window.getMilieuType(a.milieu); return m !== 'piscine' && m !== 'fosse'; } },
      { id:'p1_maree',         text:'Heure et coefficient de marée vérifiés', tags:['meteo'], when:{maree_relevant:true} },
      { id:'p1_blocs',         text:'Dates de réépreuve TIV / requalif. blocs des plongeurs OK', ref:'Arrêté 18/11/86', tags:['materiel'] },
      { id:'p1_gonflage',      text:'Gonflage des blocs effectué — pressions contrôlées' },
      { id:'p1_analyse_nx',    text:'Chaque bloc Nitrox analysé et étiqueté (% O₂, MOD, signature plongeur)', ref:'CdS A322-89', tags:['nitrox'], when:{nitrox:true} },
      { id:'p1_analyse_nx_sup', text:'Plongeurs Nx>40 % : qualification PN-C contrôlée + analyse signée', ref:'CdS A322-89', tags:['nitrox'],
        when:(a) => a.nitrox && Array.isArray(a.nitrox_kind) && a.nitrox_kind.includes('Nx > 40 %') },
      { id:'p1_analyse_tx',    text:'Trimix/Héliox : analyse mélanges + planif décompression validée', ref:'CdS A322-91', tags:['trimix'], when:{trimix:true} },
      { id:'p1_bloc_relais',   text:'Bloc(s) relais / déco analysés et étiquetés', ref:'CdS A322-89/91', tags:['materiel'], when:{bloc_relais:true} },
      { id:'p1_rec_check',     text:'Check-list constructeur de chaque recycleur — pré-breathing', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p1_o2_secours',    text:'Oxygénothérapie : bouteille > 100 bar, BAVU, masques (adulte/enfant)', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_trousse',       text:'Trousse de secours + couverture isothermique vérifiées', tags:['secours'] },
      { id:'p1_doc_plongeurs', text:'Brevets, licences, certificats médicaux à jour pour chaque plongeur', ref:'CdS A322-77', tags:['plongeurs'] },
      { id:'p1_etrangers',     text:'Évaluation par un E3 des plongeurs aux brevets étrangers', ref:'CdS A322-77', tags:['etrangers'], when:{etrangers:true} },
      { id:'p1_mineurs',       text:'Autorisations parentales signées récupérées', tags:['mineurs'], when:{mineurs:true} },
      { id:'p1_vhf_test',      text:'VHF testée + piles secondaires + canal d\'urgence configuré', ref:'Code maritime', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_carburant',     text:'Carburant + matériel de bord (gilets, signaux, mouillage) OK', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_shot_line',     text:'Shot-line (ligne lestée de descente) préparée — lest, longueur, parachutes/bouée de signalisation',
        ref:'CdS A322-91', tags:['materiel'],
        when:(a) => a.shot_line || a.trimix },
      { id:'p1_secours_coord', text:'Coordonnées des secours affichées (pays-appropriées)', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_fiche_init',    text:'Fiche de sécurité pré-remplie avec palanquées et paramètres prévus', ref:'CdS A322-72', tags:['fiche'] },
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
      { id:'p2_fiche',         text:'Fiche de sécurité complétée et accessible sur site', ref:'CdS A322-72', tags:['fiche'] },
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
// PAL_RULES — règles de composition palanquée
// =========================================================================
window.PAL_RULES = {
  // Nombre max d'encadrés par type d'aptitude encadrant
  maxEnc: { N4:4, E1:2, E2:4, E3:4, E4:4 },
  // Taille max d'une palanquée PA (autonomes uniquement)
  maxPA: 3,
  // Aptitudes PA
  isPA: (a) => a && a.startsWith('PA'),
  isPE: (a) => a && a.startsWith('PE'),
};

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

// Résume le milieu en : 'mer' | 'lac' | 'piscine' | 'fosse'
// Gère les valeurs site ('En mer', 'Lac', 'Carrière', 'Piscine') et les anciennes valeurs question
window.getMilieuType = function(milieu) {
  if (!milieu) return 'mer';
  const m = milieu.toLowerCase();
  if (m.includes('lac') || m.includes('carrière') || m.includes('carriere')) return 'lac';
  if (m.includes('piscine')) return 'piscine';
  if (m.includes('fosse'))   return 'fosse';
  return 'mer';
};

// Structure type → label lisible
window.STRUCTURE_LABELS = {
  club: 'Club FFESSM associatif',
  sca:  'Structure Commerciale Agréée (SCA)',
  csa:  'Convention de Section d\'Activité (CSA)',
  autre:'Autre',
};

// Tri des membres d'une palanquée pour la fiche (encadrant en tête, serre-file GP en fin)
window.sortMembresForFiche = function(membres) {
  const priority = { E4:0, E3:1, E2:2, E1:3, GP:4,
                     PA60:5, PA40:6, PA20:7, PA12:8,
                     PE60:9, PE40:10, PE20:11,
                     PTH120:12, PTH70:13, Baptême:14 };
  const gpCount = membres.filter(m => m.aptitude === 'GP').length;
  const isSerreFilePal = membres.length === 6 && gpCount >= 2;
  const sorted = [...membres].sort((a, b) => (priority[a.aptitude] ?? 99) - (priority[b.aptitude] ?? 99));
  if (isSerreFilePal) {
    let sfIdx = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].aptitude === 'GP') { sfIdx = i; break; }
    }
    if (sfIdx !== -1) { const sf = sorted.splice(sfIdx, 1)[0]; sorted.push(sf); }
  }
  return sorted;
};
