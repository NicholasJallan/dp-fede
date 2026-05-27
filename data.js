// DP Assistant — Données métier (v2)
// Niveaux, aptitudes, règles Code du Sport (Annexes III-15a, III-16a/b, Art. A322-xx)

// =========================================================================
// MAPPING NIVEAU → APTITUDES (Annexes III-15a, III-16a/b)
// mandatory : toujours acquis avec ce niveau
// optional  : possible (aptitudes_sup dans le profil du plongeur)
// =========================================================================
window.APTITUDE_MAP = {
  N1: { mandatory: ['PE20'],               optional: ['PA20'] },
  N2: { mandatory: ['PA20','PE40'],         optional: ['PA40'] },
  N3: { mandatory: ['PA40','PE60'],         optional: ['PA60'] },
  // Encadrants ont toujours les aptitudes N3 + la leur
  N4: { mandatory: ['PA40','PE60','PA60'],  optional: [] },
  N5: { mandatory: ['PA40','PE60','PA60'],  optional: [] },
  E1: { mandatory: ['PA40','PE60','PA60'],  optional: [] },
  E2: { mandatory: ['PA40','PE60','PA60'],  optional: [] },
  E3: { mandatory: ['PA40','PE60','PA60'],  optional: [] },
  E4: { mandatory: ['PA40','PE60','PA60'],  optional: [] },
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

// Options prof_max disponibles selon DP × activité (Code du Sport Art. A322-86)
window.getProfOptions = function(niveauEncadrant, activite) {
  const isExplo = !activite || activite === 'Exploration';
  const rules = window.DP_DEPTH_RULES[niveauEncadrant] || { formation: 60, exploration: 60 };
  const max = isExplo ? rules.exploration : rules.formation;
  if (max === 0) return [];
  const all = [6, 12, 20, 40, 60, 70, 80];
  return all.filter(d => d <= max).map(d => d + ' m').concat(max >= 80 ? ['>80 m'] : []);
};

// Aptitudes disponibles pour un plongeur sur une plongée donnée
window.getDiverAptitudes = function(diver, isExploration) {
  const np  = diver.niveau_plongeur  || null;
  const ne  = diver.niveau_encadrant || null;
  const trimix = diver.trimix || [];
  const sup    = diver.aptitudes_sup || [];
  const apts   = new Set();

  if (!np && !ne) { apts.add('Baptême'); return [...apts]; }

  // Aptitudes du niveau plongeur
  if (np === 'N1') { apts.add('PE20'); if (sup.includes('PA20')) apts.add('PA20'); }
  if (np === 'N2') { apts.add('PA20'); apts.add('PE40'); if (sup.includes('PA40')) apts.add('PA40'); }
  if (np === 'N3') { apts.add('PA40'); apts.add('PE60'); if (sup.includes('PA60')) apts.add('PA60'); }

  // Encadrant → aptitudes N3 complètes + aptitude encadrante
  if (ne) {
    apts.add('PA40'); apts.add('PE60'); apts.add('PA60');
    if (ne === 'N4') apts.add('N4');
    else if (['E1','E2','E3','E4'].includes(ne) && !isExploration) apts.add(ne);
  }

  // Trimix
  if (trimix.includes('PTH-70') || trimix.includes('PTH-120')) apts.add('PTH70');
  if (trimix.includes('PTH-120')) apts.add('PTH120');

  // Ordre canonique
  const ORDER = ['Baptême','PE20','PA20','PE40','PA40','PE60','PA60',
                 'PTH70','PTH120','N4','E1','E2','E3','E4'];
  return ORDER.filter(a => apts.has(a));
};

// Type de palanquée pour la mise en forme (couleur)
window.getPalType = function(membres) {
  const apts = membres.map(m => m.aptitude || '');
  if (apts.includes('Baptême'))                        return 'bapteme';
  if (apts.some(a => ['E1','E2','E3','E4'].includes(a))) return 'formation';
  if (apts.includes('N4') && apts.some(a => a.startsWith('PE'))) return 'guidee';
  return 'exploration';
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
      { id:'milieu',    label:'Milieu de plongée', type:'choice',
        options:['Milieu naturel (mer)','Milieu naturel (lac/carrière)','Piscine ≤ 6 m','Fosse > 6 m'], cols:2, required:true },
      { id:'activite',  label:'Activité', type:'activite-choice',
        options:['Exploration','Enseignement','Mixte','Baptême'], cols:4, required:true,
        ref:'CdS A322-77', hint:'Bloqué sur Exploration si le DP est N5.' },
    ]
  },
  {
    id:'B', title:'Lieu & logistique',
    questions:[
      { id:'site_id',    label:'Site de plongée', type:'site-picker', required:true,
        hint:'Choisir parmi les sites enregistrés, ou cliquer + pour en créer un.' },
      { id:'meteo',      label:'Conditions météo / mer / courant / visibilité', type:'meteo-field',
        placeholder:'Vent, état de la mer, courant, visibilité estimée…' },
      { id:'vhf',        label:'VHF à bord ?', type:'bool', when:{depart_bateau:true}, ref:'Bonne pratique' },
      { id:'chef_bord',  label:'Pilote / chef de bord désigné ?', type:'bool', when:{depart_bateau:true} },
      { id:'pavillon_alpha', label:'Pavillon Alpha hissé prévu ?', type:'bool', when:{depart_bateau:true} },
      { id:'distance_cote', label:'Distance prévue à la côte (M nautiques)', type:'number',
        suffix:'M nautiques', when:{depart_bateau:true} },
      { id:'delai_secours', label:'Délai d\'évacuation estimé vers secours médicalisés',
        type:'text', placeholder:'ex. 25 min', when:{depart_bateau:true} },
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
      { id:'nitrox_details', label:'Mélanges Nitrox utilisés (% O₂, MOD, PpO2 max)', type:'textarea',
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
      { id:'formation',  label:'Plongeurs en formation ?', type:'bool' },
      { id:'formation_niveaux', label:'Niveaux en formation (plusieurs choix possibles)', type:'multi',
        options:['Baptême','N1','N2','N3','PA20','PA40','PA60','GP / N4','P5 / N5','MF1 / E3','MF2 / E4'],
        cols:4, when:{formation:true} },
      { id:'etrangers',  label:'Brevets étrangers non français (PADI, SSI, CMAS étr.) ?', type:'bool',
        hint:'→ évaluation par un E3 prévue' },
      { id:'handisub',   label:'Plongeurs en situation de handicap (handisub) ?', type:'bool' },
    ]
  },
  {
    id:'G', title:'Sécurité surface',
    questions:[
      { id:'sec_surface',   label:'Sécurité surface identifiée (personne dédiée) ?', type:'bool', ref:'CdS A322-78' },
      { id:'plan_secours',  label:'Plan de secours affiché et à jour ?', type:'bool' },
      { id:'coords_secours',label:'Coordonnées des secours disponibles ?', type:'bool',
        hint:'Mer : CROSS 196 / SAMU 15 / Pompiers 18. Lac : SAMU 15 / Pompiers 18 / Gendarmerie 17.' },
      { id:'o2',            label:'Matériel O₂ vérifié (pression, BAVU, masques) ?', type:'bool', ref:'CdS A322-78-1' },
      { id:'trousse',       label:'Trousse de secours + couverture isothermique vérifiées ?', type:'bool' },
      { id:'eau_potable',   label:'Eau douce potable disponible ?', type:'bool' },
      { id:'rappel',        label:'Moyen de rappel des plongeurs (pétard, sondeur) ?', type:'bool',
        when:{depart_bateau:true} },
      { id:'bouee_surface', label:'Bouée / pavillon de signalisation en surface ?', type:'bool' },
      { id:'trimix_secu_note', label:'Plongée Trimix : sécurité surface continue obligatoire (Art. A322-91)',
        type:'info', when:{trimix:true} },
    ]
  },
  {
    id:'H', title:'Enseignement',
    when:(a) => a.activite === 'Enseignement' || a.activite === 'Mixte',
    questions:[
      { id:'ens_niveaux', label:'Niveaux ou aptitudes enseignés (plusieurs choix)', type:'multi',
        options:['Baptême','N1 / PE20','N2 / PE40','N3','PA20','PA40','PA60','GP / N4','P5 / N5','MF1 / E3','MF2 / E4'],
        cols:4, ref:'Annexe III-16a' },
      { id:'ens_exos',    label:'Exercices prévus', type:'textarea',
        placeholder:'ex. RSE 0→6m, vidage masque, gilet, descente lestée…' },
    ]
  }
];

// =========================================================================
// CHECK-LIST RULES (5 phases, items conditionnels)
// =========================================================================
window.CHECKLIST_RULES = [
  {
    phase:1, phaseTitle:'Avant le départ (J-1 / matin)',
    items:[
      { id:'p1_meteo',       text:'Consulter et imprimer le bulletin météo (vent, mer, courant, visibilité)', ref:'Bonne pratique', tags:['meteo'] },
      { id:'p1_blocs',       text:'Vérification des dates de réépreuve TIV / requalif. blocs des plongeurs', ref:'Arrêté 18/11/86', tags:['materiel'] },
      { id:'p1_gonflage',    text:'Gonflage des blocs, contrôle des pressions' },
      { id:'p1_analyse_nx',  text:'Analyser et étiqueter chaque bloc Nitrox (% O₂, MOD, signature plongeur)', ref:'CdS A322-89', tags:['nitrox'], when:{nitrox:true} },
      { id:'p1_analyse_tx',  text:'Analyser les mélanges Trimix/Héliox, valider planif décompression', ref:'CdS A322-91, A322-113', tags:['trimix'], when:{trimix:true} },
      { id:'p1_bloc_relais_analyse', text:'Analyser et étiqueter le(s) bloc(s) relais / déco', ref:'CdS A322-89/91', tags:['materiel'], when:{bloc_relais:true} },
      { id:'p1_rec_check',   text:'Check-list constructeur de chaque recycleur — pré-breathing', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p1_o2_secours',  text:'Matériel O₂ + BAVU + masques contrôlés (pression > 100 bar, dates)', ref:'CdS A322-78-1', tags:['secours'] },
      { id:'p1_doc_plongeurs', text:'Vérifier brevets, licences en cours, certificats médicaux à jour', ref:'CdS A322-77', tags:['plongeurs'] },
      { id:'p1_etrangers',   text:'Évaluation des plongeurs avec brevets étrangers par un E3', ref:'CdS A322-77', tags:['etrangers'], when:{etrangers:true} },
      { id:'p1_mineurs',     text:'Autorisations parentales signées récupérées pour les mineurs', tags:['mineurs'], when:{mineurs:true} },
      { id:'p1_vhf_test',    text:'Tester la VHF à bord et vérifier piles secondaires', ref:'Code maritime', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_carburant',   text:'Carburant + niveaux + matériel de bord vérifiés', tags:['bateau'], when:{depart_bateau:true} },
    ]
  },
  {
    phase:2, phaseTitle:'Avant la mise à l\'eau',
    items:[
      { id:'p2_appel',       text:'Appel nominatif des plongeurs, vérification des aptitudes et licences' },
      { id:'p2_briefing',    text:'Briefing : site, profil, paramètres, signes, consignes de sécurité' },
      { id:'p2_palanquees',  text:'Présentation des palanquées, des guides et des autonomes' },
      { id:'p2_fiche',       text:'Fiche de sécurité complétée et accessible sur site', ref:'CdS A322-72', tags:['fiche'] },
      { id:'p2_pavillon',    text:'Pavillon Alpha hissé sur l\'embarcation', ref:'RIPAM règle 27', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_echelle',     text:'Échelle de remontée déployée, ancrage adapté', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_parachute',   text:'Vérifier qu\'un parachute de palier équipe chaque palanquée', tags:['materiel'], when:{parachute_obligatoire:true} },
      { id:'p2_parachute_indiv', text:'Vérifier que chaque plongeur a son propre parachute', tags:['materiel'], when:{parachute_par_plongeur:true} },
      { id:'p2_nx_signature',text:'Plongeurs Nitrox : signature finale de l\'analyse de leur bloc', ref:'CdS A322-89', tags:['nitrox'], when:{nitrox:true} },
      { id:'p2_rec_aptitudes',text:'Validation aptitudes recycleur de chaque plongeur concerné', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p2_secours_co',  text:'Recycleur > 6 m : circuit ouvert de secours obligatoire par plongeur', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p2_ligne_lestee',text:'Ligne lestée descente/remontée installée (obligatoire Trimix)', ref:'CdS A322-91', tags:['trimix'], when:{trimix:true} },
      { id:'p2_planifs',     text:'Distribuer copies des planifs décompression aux palanquées Trimix', ref:'CdS A322-113', tags:['trimix'], when:{trimix:true} },
      { id:'p2_bord_entree', text:'Identifier le ou les points d\'entrée/sortie de l\'eau sécurisés', tags:['bord'], when:{depart_bord:true} },
    ]
  },
  {
    phase:3, phaseTitle:'Pendant la plongée',
    items:[
      { id:'p3_secu_poste', text:'Sécurité surface en poste, à l\'écoute VHF / signaux visuels', ref:'CdS A322-78', tags:['secours'] },
      { id:'p3_trimix_secu', text:'Trimix : sécurité surface continue opérationnelle pendant toute la plongée', ref:'CdS A322-91', tags:['trimix'], when:{trimix:true} },
      { id:'p3_chrono',     text:'Démarrer le chronomètre — noter heures d\'immersion de chaque palanquée' },
      { id:'p3_suivi',      text:'Suivi des bulles / parachutes / présence en surface des palanquées' },
      { id:'p3_pavillon',   text:'Pavillon Alpha maintenu hissé jusqu\'à dernière palanquée sortie', tags:['bateau'], when:{depart_bateau:true} },
    ]
  },
  {
    phase:4, phaseTitle:'À la sortie de l\'eau',
    items:[
      { id:'p4_appel',      text:'Appel des palanquées — confirmation que tous les plongeurs sont sortis' },
      { id:'p4_params',     text:'Recueillir paramètres réalisés (prof. max, durée, paliers, DTR, incidents)', ref:'CdS A322-72', tags:['fiche'] },
      { id:'p4_dtr',        text:'Respecter le délai DTR avant nouvelle mise à l\'eau si applicable', tags:['securite'] },
      { id:'p4_hydratation',text:'Hydratation des plongeurs — eau douce potable disponible' },
      { id:'p4_surveillance',text:'Surveillance des plongeurs pendant 30 min minimum (signes ADD)' },
      { id:'p4_blocs',      text:'Sécuriser les blocs (purges, fermetures, rangement)' },
    ]
  },
  {
    phase:5, phaseTitle:'Après la plongée / fin de journée',
    items:[
      { id:'p5_signature',  text:'Signature de la fiche de sécurité par le DP et les encadrants', ref:'CdS A322-72', tags:['fiche'] },
      { id:'p5_archive',    text:'Archivage de la fiche (durée minimale : 1 an)', ref:'CdS A322-72', tags:['fiche','archivage'] },
      { id:'p5_nettoyage',  text:'Nettoyage et rinçage du matériel (détendeurs, gilets, combinaisons)' },
      { id:'p5_incident',   text:'Déclaration éventuelle d\'incident (DIRM, fédération)', ref:'CdS A322-72' },
    ]
  }
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
window.getMilieuType = function(milieu) {
  if (!milieu) return 'mer';
  if (milieu.includes('lac') || milieu.includes('carrière')) return 'lac';
  if (milieu.includes('Piscine')) return 'piscine';
  if (milieu.includes('Fosse'))   return 'fosse';
  return 'mer';
};

// Structure type → label lisible
window.STRUCTURE_LABELS = {
  club: 'Club FFESSM associatif',
  sca:  'Structure Commerciale Agréée (SCA)',
  csa:  'Convention de Section d\'Activité (CSA)',
  autre:'Autre',
};
