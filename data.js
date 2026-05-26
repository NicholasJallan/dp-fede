// DP Assistant — Données métier externalisées
// Toutes les règles, questions, items de check-list, niveaux, qualifications.
// Modifiable sans toucher au code des composants.

// =========================================================================
// QUESTIONNAIRE — sections, questions, conditions d'affichage
// =========================================================================
window.QUESTIONS = [
  {
    id: "A",
    title: "Contexte général",
    questions: [
      { id: "date", label: "Date et heure prévue de mise à l'eau", type: "datetime", required: true },
      { id: "site", label: "Site de plongée", type: "text", placeholder: "ex. Sec de l'Esquillade", required: true },
      { id: "dp_nom", label: "Nom du Directeur de Plongée", type: "text", required: true },
      { id: "dp_qual", label: "Qualification du DP", type: "choice", options: ["E1","E2","E3","E4","P5"], cols: 5, required: true },
      { id: "structure", label: "Type de structure", type: "choice",
        options: ["Club FFESSM associatif","SCA (Structure Commerciale Agréée)","CSA (Convention de Section d'Activité)","Autre"], cols: 2, required: true },
      { id: "milieu", label: "Plongée en", type: "choice",
        options: ["Milieu naturel","Piscine ≤ 6 m","Fosse > 6 m"], cols: 3, required: true },
      { id: "activite", label: "Activité", type: "choice",
        options: ["Exploration","Enseignement","Mixte","Baptême"], cols: 4, required: true, ref: "CdS A322-77" }
    ]
  },
  {
    id: "B",
    title: "Lieu & logistique",
    questions: [
      { id: "depart", label: "Départ", type: "choice", options: ["Du bord","En bateau"], cols: 2 },
      { id: "embarcation", label: "Type d'embarcation", type: "choice",
        options: ["Embarcation propre","Location","Bateau du club"], cols: 3, when: { depart: "En bateau" } },
      { id: "vhf", label: "VHF à bord ?", type: "bool", when: { depart: "En bateau" }, ref: "Bonne pratique" },
      { id: "chef_bord", label: "Pilote / chef de bord désigné ?", type: "bool", when: { depart: "En bateau" } },
      { id: "pavillon_alpha", label: "Pavillon Alpha hissé prévu ?", type: "bool", when: { depart: "En bateau" } },
      { id: "distance_cote", label: "Distance prévue à la côte (M)", type: "number", suffix: "M nautiques", when: { depart: "En bateau" } },
      { id: "delai_secours", label: "Délai d'évacuation estimé vers secours médicalisés", type: "text", placeholder: "ex. 25 min", when: { depart: "En bateau" } },
      { id: "meteo", label: "Conditions météo / mer / courant / visibilité", type: "textarea", placeholder: "Vent, état de la mer, courant, visibilité estimée…" }
    ]
  },
  {
    id: "C",
    title: "Profondeur & espaces d'évolution",
    questions: [
      { id: "prof_max", label: "Profondeur maximale envisagée", type: "choice",
        options: ["6 m","12 m","20 m","40 m","60 m","70 m","80 m",">80 m"], cols: 4, ref: "CdS A322-86" },
      { id: "paliers", label: "Plongée avec paliers obligatoires ?", type: "bool" },
      { id: "successive", label: "Plongée successive prévue dans la journée ?", type: "bool" }
    ]
  },
  {
    id: "D",
    title: "Mélanges respiratoires",
    questions: [
      { id: "air", label: "Plongeurs à l'air ?", type: "bool" },
      { id: "nitrox", label: "Plongeurs au Nitrox ?", type: "bool", ref: "CdS A322-89" },
      { id: "nitrox_details", label: "Mélanges Nitrox utilisés (% O₂, MOD, PpO2 max)", type: "textarea",
        placeholder: "ex. EAN32 — MOD 40 m — PpO2 max 1.4", when: { nitrox: true } },
      { id: "trimix", label: "Plongeurs au Trimix / Héliox ?", type: "bool", ref: "CdS A322-91" },
      { id: "trimix_kind", label: "Type de mélange", type: "choice",
        options: ["Trimix élémentaire","Trimix","Héliox"], cols: 3, when: { trimix: true } },
      { id: "oxygene_pur", label: "Plongeurs à l'oxygène pur (paliers O₂) ?", type: "bool" }
    ]
  },
  {
    id: "E",
    title: "Matériel particulier",
    questions: [
      { id: "recycleur", label: "Recycleurs (CCR / SCR) ?", type: "bool", ref: "CdS A322-94" },
      { id: "recycleur_modeles", label: "Modèles et diluant", type: "textarea",
        placeholder: "ex. JJ-CCR — diluant air — 2 plongeurs", when: { recycleur: true } },
      { id: "mixage_co_rec", label: "Mixage circuit ouvert + recycleur dans une même palanquée ?", type: "bool", when: { recycleur: true } },
      { id: "bloc_relais", label: "Bloc relais / déco prévu ?", type: "bool" },
      { id: "parachute_obligatoire", label: "Parachute de palier obligatoire pour chaque palanquée ?", type: "bool" }
    ]
  },
  {
    id: "F",
    title: "Public",
    questions: [
      { id: "mineurs", label: "Présence de mineurs ?", type: "bool" },
      { id: "formation", label: "Plongeurs en formation ?", type: "bool" },
      { id: "formation_niveaux", label: "Niveaux en formation", type: "multi",
        options: ["Baptême","N1","N2","N3","N4","GP"], cols: 6, when: { formation: true } },
      { id: "etrangers", label: "Brevets étrangers non français (PADI, SSI, CMAS étr.) ?", type: "bool",
        hint: "→ évaluation par un E3 prévue" },
      { id: "handisub", label: "Plongeurs en situation de handicap (handisub) ?", type: "bool" }
    ]
  },
  {
    id: "G",
    title: "Sécurité surface",
    questions: [
      { id: "sec_surface", label: "Sécurité surface identifiée (personne dédiée, non plongeur) ?", type: "bool", ref: "CdS A322-78" },
      { id: "plan_secours", label: "Plan de secours affiché et à jour ?", type: "bool" },
      { id: "coords_secours", label: "Coordonnées CROSS / 196 / SAMU 15 / Pompiers 18 disponibles ?", type: "bool" },
      { id: "o2", label: "Matériel O₂ vérifié (pression bouteille, BAVU, masques) ?", type: "bool", ref: "CdS A322-78-1" },
      { id: "trousse", label: "Trousse de secours + couverture isothermique vérifiées ?", type: "bool" },
      { id: "eau_potable", label: "Eau douce potable à bord ?", type: "bool" },
      { id: "rappel", label: "Moyen de rappel des plongeurs (pétard, sondeur) ?", type: "bool", when: { depart: "En bateau" } },
      { id: "bouee_surface", label: "Pavillon Alpha / bouée signalétique en surface ?", type: "bool" }
    ]
  },
  {
    id: "H",
    title: "Enseignement",
    when: (a) => a.activite === "Enseignement" || a.activite === "Mixte",
    questions: [
      { id: "ens_niveau", label: "Niveau enseigné", type: "choice",
        options: ["N1","N2","N3","N4","GP","Initiateur","MF1"], cols: 4 },
      { id: "ens_exos", label: "Exercices prévus", type: "textarea",
        placeholder: "ex. RSE 0 → 6m, vidage masque, gilet, descente lestée…" },
      { id: "ens_encadrants", label: "Qualifications encadrants présents", type: "textarea",
        placeholder: "ex. 1 × E3, 2 × E2", ref: "Annexe III-16a" }
    ]
  }
];

// =========================================================================
// CHECK-LIST RULES — items conditionnels, par phase
// =========================================================================
// Conditions: object → AND of key/value; supports special keys:
//   _always:true, prof_max_gte:40 → numerical, milieu, depart, activite, etc.
// =========================================================================
window.CHECKLIST_RULES = [
  {
    phase: 1,
    phaseTitle: "Avant le départ (J-1 / matin)",
    items: [
      { id: "p1_meteo", text: "Consulter et imprimer le bulletin météo (vent, mer, courant, visibilité)", ref: "Bonne pratique", tags: ["meteo"] },
      { id: "p1_blocs", text: "Vérification des dates de réépreuve TIV / requalif. blocs des plongeurs", ref: "Arrêté 18/11/86", tags: ["materiel"] },
      { id: "p1_gonflage", text: "Gonflage des blocs, contrôle des pressions" },
      { id: "p1_analyse_nx", text: "Analyser et étiqueter chaque bloc Nitrox (O₂, MOD, signature plongeur)", ref: "CdS A322-89", tags: ["nitrox"], when: { nitrox: true } },
      { id: "p1_analyse_tx", text: "Analyser les mélanges Trimix/Héliox, valider planif décompression", ref: "CdS A322-91, A322-113", tags: ["trimix"], when: { trimix: true } },
      { id: "p1_rec_check", text: "Check-list constructeur de chaque recycleur — pré-breathing", ref: "CdS A322-94", tags: ["recycleur"], when: { recycleur: true } },
      { id: "p1_o2_secours", text: "Matériel O₂ + BAVU + masques contrôlés (pression > 100 bar, dates)", ref: "CdS A322-78-1", tags: ["secours"] },
      { id: "p1_doc_plongeurs", text: "Vérifier brevets, licences en cours, certificats médicaux à jour", ref: "CdS A322-77", tags: ["plongeurs"] },
      { id: "p1_etrangers", text: "Évaluation des plongeurs avec brevets étrangers par un E3", ref: "CdS A322-77", tags: ["etrangers"], when: { etrangers: true } },
      { id: "p1_mineurs", text: "Autorisations parentales signées récupérées pour les mineurs", tags: ["mineurs"], when: { mineurs: true } },
      { id: "p1_vhf_test", text: "Tester la VHF à bord et vérifier piles secondaires", ref: "Code maritime", tags: ["bateau"], when: { depart: "En bateau" } },
      { id: "p1_carburant", text: "Carburant + niveaux + matériel de bord vérifiés", tags: ["bateau"], when: { depart: "En bateau" } }
    ]
  },
  {
    phase: 2,
    phaseTitle: "Avant la mise à l'eau",
    items: [
      { id: "p2_appel", text: "Appel nominatif des plongeurs, vérification des aptitudes" },
      { id: "p2_briefing", text: "Briefing : site, profil, paramètres, signes, consignes de sécurité" },
      { id: "p2_palanquees", text: "Présentation des palanquées, du serre-file et des autonomes" },
      { id: "p2_fiche", text: "Fiche de sécurité complétée et accessible à bord / sur site", ref: "CdS A322-72", tags: ["fiche"] },
      { id: "p2_exploitant", text: "Prévenir l'exploitant du site / capitainerie de la mise à l'eau",
        tags: ["exploitant"], when: { milieu: "Milieu naturel" } },
      { id: "p2_pavillon", text: "Pavillon Alpha hissé sur l'embarcation", ref: "RIPAM règle 27", tags: ["bateau"], when: { depart: "En bateau" } },
      { id: "p2_echelle", text: "Échelle de remontée déployée, ancrage adapté",
        tags: ["bateau"], when: { depart: "En bateau" } },
      { id: "p2_serre_file", text: "Désigner le serre-file P4 (formation 0-40 m)",
        ref: "CdS Annexe III-16a", tags: ["enseignement","serre-file"], when: { activite: "Enseignement" } },
      { id: "p2_parachute", text: "Vérifier qu'un parachute de palier équipe chaque palanquée", tags: ["materiel"] },
      { id: "p2_nx_signature", text: "Plongeurs Nitrox : signature finale de l'analyse de leur bloc", ref: "CdS A322-89", tags: ["nitrox"], when: { nitrox: true } },
      { id: "p2_rec_aptitudes", text: "Validation aptitudes recycleur de chaque plongeur concerné", ref: "CdS A322-94", tags: ["recycleur"], when: { recycleur: true } },
      { id: "p2_secours_co", text: "Recycleur > 6 m : circuit ouvert de secours obligatoire pour chaque plongeur", ref: "CdS A322-94", tags: ["recycleur"], when: { recycleur: true, prof_max_gte: 6 } },
      { id: "p2_ligne_lestee", text: "Ligne lestée descente/remontée installée pour Trimix/Héliox", ref: "CdS A322-91", tags: ["trimix"], when: { trimix: true } },
      { id: "p2_planifs", text: "Distribuer copies des planifs décompression aux palanquées Trimix", ref: "CdS A322-113", tags: ["trimix"], when: { trimix: true } },
      { id: "p2_pa60_derog", text: "Dérogation PA-60 sans DP : exploitant informé et entérine l'organisation", ref: "CdS A322-99", tags: ["dérogation"], when: { _custom: "pa60_derog" } },
      { id: "p2_piscine_note", text: "Piscine ≤ 6 m : fiche de sécurité non obligatoire (mais recommandée)", ref: "CdS A322-98", tags: ["piscine"], when: { milieu: "Piscine ≤ 6 m" } }
    ]
  },
  {
    phase: 3,
    phaseTitle: "Pendant la plongée",
    items: [
      { id: "p3_secu_poste", text: "Sécurité surface en poste, à l'écoute VHF / coups de sifflet",
        ref: "CdS A322-78", tags: ["secours"] },
      { id: "p3_chrono", text: "Démarrer le chronomètre — noter heures d'immersion de chaque palanquée" },
      { id: "p3_suivi", text: "Suivi des bulles / parachutes / présence en surface des palanquées" },
      { id: "p3_pavillon", text: "Pavillon Alpha maintenu hissé jusqu'à dernière palanquée sortie",
        tags: ["bateau"], when: { depart: "En bateau" } }
    ]
  },
  {
    phase: 4,
    phaseTitle: "À la sortie de l'eau",
    items: [
      { id: "p4_appel", text: "Appel des palanquées — confirmation que tous les plongeurs sont sortis" },
      { id: "p4_params", text: "Recueillir paramètres réalisés (prof. max, durée, paliers, incidents) palanquée par palanquée", ref: "CdS A322-72", tags: ["fiche"] },
      { id: "p4_hydratation", text: "Hydratation des plongeurs — eau douce potable disponible" },
      { id: "p4_surveillance_add", text: "Surveillance des plongeurs pendant 30 min minimum (signes ADD)" },
      { id: "p4_blocs", text: "Sécuriser les blocs (purges, fermetures, rangement)" }
    ]
  },
  {
    phase: 5,
    phaseTitle: "Après la plongée / fin de journée",
    items: [
      { id: "p5_signature", text: "Signature de la fiche de sécurité par le DP et les encadrants", ref: "CdS A322-72", tags: ["fiche"] },
      { id: "p5_archive", text: "Archivage de la fiche (durée minimale : 1 an)", ref: "CdS A322-72", tags: ["fiche","archivage"] },
      { id: "p5_nettoyage", text: "Nettoyage et rinçage du matériel (détendeurs, gilets, combinaisons)" },
      { id: "p5_incident", text: "Déclaration éventuelle d'incident (DIRM, fédération)", ref: "CdS A322-72" }
    ]
  }
];

// =========================================================================
// NIVEAUX / QUALIFICATIONS / PRÉROGATIVES (Annexes III-15a, III-16a/b)
// =========================================================================
window.LEVELS = {
  // Encadrants
  E1:  { kind: "encadrant", label: "E1 — Initiateur club", maxProfEns: 6,  maxNbPalEns: 4 },
  E2:  { kind: "encadrant", label: "E2 — Initiateur / MF1 stagiaire", maxProfEns: 20, maxNbPalEns: 4 },
  E3:  { kind: "encadrant", label: "E3 — MF1", maxProfEns: 40, maxNbPalEns: 4, canBeDP: true },
  E4:  { kind: "encadrant", label: "E4 — MF2 / BEES2", maxProfEns: 60, maxNbPalEns: 4, canBeDP: true },
  P5:  { kind: "encadrant", label: "P5 — DP plongeur", maxProfEns: 0,  maxNbPalEns: 0, canBeDP: true },

  // Plongeurs (autonomie et profondeurs)
  N1:  { kind: "plongeur", label: "N1 — Plongeur encadré 20m", autoMax: 0,  encMax: 20 },
  N2:  { kind: "plongeur", label: "N2 — PE-40 / PA-20", autoMax: 20, encMax: 40 },
  PA20:{ kind: "plongeur", label: "PA-20", autoMax: 20, encMax: 40 },
  N3:  { kind: "plongeur", label: "N3 — PA-60 / PE-60", autoMax: 60, encMax: 60 },
  N4:  { kind: "plongeur", label: "N4 — Guide de palanquée", autoMax: 60, encMax: 60, canBeGuide: true },
  GP:  { kind: "plongeur", label: "GP — Guide de palanquée", autoMax: 60, encMax: 60, canBeGuide: true },
};

// Qualifications complémentaires
window.QUALIFICATIONS = [
  { id: "PN", label: "PN — Plongeur Nitrox", scope: "nitrox" },
  { id: "PN-C", label: "PN-C — Nitrox confirmé", scope: "nitrox-decompression" },
  { id: "PTH-70", label: "PTH-70 — Trimix élémentaire", scope: "trimix" },
  { id: "PTH-120", label: "PTH-120 — Trimix", scope: "trimix" },
  { id: "REC-CCR", label: "Recycleur CCR (qualif fédérale)", scope: "recycleur" },
  { id: "TIV", label: "TIV — Inspecteur visuel", scope: "materiel" },
  { id: "PSC1", label: "PSC1 — Premiers secours civiques", scope: "secourisme" },
  { id: "RIFAP", label: "RIFAP — Réactions et interventions face à un accident", scope: "secourisme" }
];

// =========================================================================
// PALANQUÉE RULES (synthèse Annexes III-16a/b)
// =========================================================================
window.PAL_RULES = {
  maxBySpace: {
    "PE-12": 4, "PE-20": 4, "PE-40": 4, "PE-60": 4,
    "PA-12": 3, "PA-20": 3, "PA-40": 3, "PA-60": 3
  },
  defaultDTR: 5, // minutes
};

// =========================================================================
// Roles disponibles dans une palanquée
// =========================================================================
window.PAL_ROLES = [
  { id: "guide",     label: "Guide de palanquée" },
  { id: "encadrant", label: "Encadrant" },
  { id: "autonome",  label: "Autonome" },
  { id: "encadre",   label: "Encadré" },
  { id: "serre",     label: "Serre-file" }
];

// =========================================================================
// Helper — Évalue la condition `when` d'une question ou règle
// =========================================================================
window.matchCondition = function(when, answers) {
  if (!when) return true;
  if (typeof when === "function") return when(answers);
  for (const key in when) {
    const v = when[key];
    if (key === "_custom") continue; // évalué ailleurs
    if (key === "prof_max_gte") {
      const n = parseFloat(answers.prof_max || "0");
      if (isNaN(n) || n < v) return false;
      continue;
    }
    if (v === true && !answers[key]) return false;
    if (v === false && answers[key]) return false;
    if (typeof v === "string" && answers[key] !== v) return false;
  }
  return true;
};
