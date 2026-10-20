// @ts-check
// DP Assistant — Check-list opérationnelle (étape 3), items conditionnels.

import { isMilieuNaturel } from './milieu.js';

// =========================================================================
// CHECK-LIST RULES (2 phases, items conditionnels)
// =========================================================================
export const CHECKLIST_RULES = [
  {
    phase:1, phaseTitle:'Préparation — avant l\'arrivée sur site',
    items:[
      { id:'p1_meteo',         text:'Bulletin météo consulté (vent, mer, courant, visibilité, alerte)', ref:'Bonne pratique', tags:['meteo'],
        when:(a) => isMilieuNaturel(a.milieu) },
      { id:'p1_maree',         text:'Heure et coefficient de marée vérifiés', tags:['meteo'], when:{maree_relevant:true} },
      { id:'p1_blocs',         text:'Inspection visuelle (TIV) et requalification des blocs à jour', ref:'Arrêté du 20/11/2017', tags:['materiel'] },
      { id:'p1_gonflage',      text:'Gonflage des blocs effectué — pressions contrôlées' },
      { id:'p1_analyse_nx',    text:'Fiche d\'identification de chaque bloc nitrox complétée : pression, % O₂ analysé, profondeur max d\'utilisation, date d\'analyse, nom ou initiales', ref:'CdS A322-93', tags:['nitrox'], when:{nitrox:true} },
      { id:'p1_analyse_nx_sup', text:'Plongeurs Nx > 40 % : aptitude PN-C contrôlée', ref:'CdS A322-95', tags:['nitrox'],
        when:(a) => a.nitrox_sup_40 },
      { id:'p1_analyse_tx',    text:'Trimix / héliox : mélanges analysés et identifiés, planifications de plongée établies', ref:'CdS A322-93 / A322-97', tags:['trimix'], when:{trimix:true} },
      { id:'p1_bloc_relais',   text:'Bloc(s) relais / déco analysés et identifiés', ref:'CdS A322-93', tags:['materiel'], when:{bloc_relais:true} },
      { id:'p1_rec_check',     text:'Check-list constructeur de chaque recycleur — pré-breathing', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p1_plan_secours',  text:'Plan de secours écrit, adapté au lieu et à la plongée, à jour', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_o2_secours',    text:'Oxygénothérapie normobare (capacité suffisante jusqu\'aux secours) avec manodétendeur et débit-litre', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_bavu',          text:'BAVU avec sac de réserve d\'O₂ et 3 masques (grand, moyen, petit) + masque à haute concentration', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_trousse',       text:'Couverture isothermique et eau douce potable', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_fiches_evac',   text:'Fiches d\'évacuation (modèle de l\'annexe III-19)', ref:'CdS A322-78', tags:['secours'] },
      { id:'p1_bloc_secours',  text:'Bouteille d\'air de secours équipée de son détendeur (et bouteille(s) de mélange de secours si plongée aux mélanges)', ref:'CdS A322-78', tags:['materiel'] },
      { id:'p1_tablette',      text:'Tablette de notation immergeable', ref:'CdS A322-78', tags:['materiel'] },
      { id:'p1_tables',        text:'Jeu de tables de décompression', ref:'CdS A322-78', tags:['materiel'],
        when:(a) => isMilieuNaturel(a.milieu) },
      { id:'p1_doc_plongeurs', text:'Brevets, licences, certificats médicaux à jour pour chaque plongeur', ref:'CdS A322-77', tags:['plongeurs'] },
      { id:'p1_etrangers',     text:'Brevets étrangers : aptitudes justifiées (brevet, carnet) ou évaluées par le DP', ref:'CdS A322-77', tags:['etrangers'], when:{etrangers:true} },
      { id:'p1_mineurs',       text:'Autorisations parentales signées récupérées', tags:['mineurs'], when:{mineurs:true} },
      { id:'p1_vhf_test',      text:'VHF testée (obligatoire en mer au départ d\'une embarcation) — canal 16 configuré', ref:'CdS A322-78', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_carburant',     text:'Carburant + matériel de bord (gilets, signaux, mouillage) OK', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p1_shot_line',     text:'Shot-line (ligne lestée de descente) préparée — lest, longueur, parachutes/bouée de signalisation',
        ref:'CdS A322-97', tags:['materiel'],
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
      { id:'p2_equipement',    text:'Équipement vérifié : manomètre et gilet pour tous ; au-delà de 20 m en encadré et pour les autonomes, source d\'air de secours sans partage d\'embout et moyens de contrôle ; encadrants : 2 sorties et 2 détendeurs',
        ref:'CdS A322-80', tags:['materiel'], when:(a) => isMilieuNaturel(a.milieu) },
      { id:'p2_rappel',        text:'Moyen de rappel des plongeurs depuis la surface prêt', ref:'CdS A322-78', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_sec_surface',   text:'Sécurité surface en poste — relais identifiés si rotation', ref:'CdS A322-78', tags:['secours'], when:{sec_surface:true} },
      // Ex-`p2_fiche` supprimé : l'application EST la fiche (complétée et
      // accessible sur site par construction). Item auto-référent retiré.
      { id:'p2_pavillon',      text:'Pavillon Alpha hissé sur l\'embarcation', ref:'RIPAM règle 27', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_echelle',       text:'Échelle de remontée déployée — ancrage adapté', tags:['bateau'], when:{depart_bateau:true} },
      { id:'p2_shot_line_pose', text:'Ligne lestée de descente / remontée installée (obligatoire au trimix)',
        ref:'CdS A322-97', tags:['materiel'],
        when:(a) => a.shot_line || a.trimix },
      { id:'p2_parachute',     text:'Chaque palanquée dispose d\'un parachute de palier', ref:'CdS A322-80', tags:['materiel'],
        when:(a) => isMilieuNaturel(a.milieu) },
      { id:'p2_parachute_indiv', text:'Chaque plongeur porte son parachute individuel', tags:['materiel'], when:{parachute_par_plongeur:true} },
      { id:'p2_nx_signature',  text:'Plongeurs nitrox : fiche de leur bloc complétée et signée (nom ou initiales)', ref:'CdS A322-93', tags:['nitrox'], when:{nitrox:true} },
      { id:'p2_rec_aptitudes', text:'Aptitudes recycleur validées + circuit ouvert de secours pour > 6m', ref:'CdS A322-94', tags:['recycleur'], when:{recycleur:true} },
      { id:'p2_planifs',       text:'Copie des planifications présente sur le lieu de mise à l\'eau', ref:'CdS A322-97', tags:['trimix'], when:{trimix:true} },
      { id:'p2_tx_embarcation', text:'Support logistique ou embarcation avec une personne habilitée à la manœuvrer', ref:'CdS A322-97', tags:['trimix'], when:{trimix:true} },
      { id:'p2_bord_entree',   text:'Points d\'entrée/sortie de l\'eau identifiés et sécurisés', tags:['bord'], when:{depart_bord:true} },
      { id:'p2_go_decision',   text:'Décision finale du DP : conditions OK pour autoriser la mise à l\'eau', ref:'CdS A322-72', tags:['fiche'] },
    ]
  },
];
