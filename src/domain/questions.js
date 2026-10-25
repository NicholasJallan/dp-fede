// @ts-check
// DP Assistant — Questionnaire « profil de plongée » (étape 1).

import { getMilieuType, isMilieuNaturel } from './milieu.js';

// Questions propres à la Polynésie française (arrêté n° 199 CM) : visibles
// seulement pour une plongée dont la réglementation est celle de la PF.
const pf = (a) => a.jurisdiction === 'PF';

// =========================================================================
// QUESTIONNAIRE (sections A → H)
// =========================================================================
export const QUESTIONS = [
  {
    id: 'A',
    title: 'Contexte général',
    questions: [
      { id: 'date', label: "Date et heure prévue de mise à l'eau", type: 'datetime', required: true },
      {
        id: 'dp_id',
        label: 'Directeur de Plongée',
        type: 'dp-picker',
        required: true,
        hint: 'Filtré sur E1→E4 et N5 — la qualification est déduite automatiquement.',
      },
      {
        id: 'structure',
        label: 'Type de structure',
        type: 'structure-display',
        hint: 'Renseigné dans Paramètres → Mon compte.',
      },
    ],
  },
  {
    id: 'B',
    title: 'Lieu & logistique',
    questions: [
      {
        id: 'site_id',
        label: 'Site de plongée',
        type: 'site-picker',
        required: true,
        hint: 'Choisir parmi les sites enregistrés, ou cliquer + pour en créer un.',
      },
      {
        id: 'shot_line',
        label: 'Shot-line installée pour cette plongée ?',
        type: 'bool',
        hint: 'Shot-line = ligne lestée de descente/remontée. Obligatoire pour le Trimix. Indépendante du site.',
      },
      {
        id: 'meteo',
        label: 'Conditions météo / mer / courant / visibilité',
        type: 'meteo-field',
        placeholder: 'Vent, état de la mer, courant, visibilité estimée…',
        when: (a) => isMilieuNaturel(a.milieu),
      },
      {
        id: 'maree_relevant',
        label: 'Informations de marée pertinentes ?',
        type: 'bool',
        when: (a) => {
          const m = getMilieuType(a.milieu);
          return m === 'mer' && (a.site_atlantique === true || a.site_atlantique === undefined);
        },
        hint: 'À cocher pour les plongées en Atlantique / Manche / Mer du Nord.',
      },
      {
        id: 'maree_horaire',
        label: 'Heure et coefficient de marée',
        type: 'text',
        placeholder: 'PM 14h12 · coef 87',
        when: { maree_relevant: true },
      },
      { id: 'vhf', label: 'VHF à bord ?', type: 'bool', when: { depart_bateau: true }, ref: 'CdS A322-78' },
      { id: 'chef_bord', label: 'Pilote / chef de bord désigné ?', type: 'bool', when: { depart_bateau: true } },
      { id: 'pavillon_alpha', label: 'Pavillon Alpha hissé prévu ?', type: 'bool', when: { depart_bateau: true } },
      {
        id: 'navire_nom',
        label: 'Nom du navire support',
        type: 'text',
        when: (a) => pf(a) && !!a.depart_bateau,
        hint: 'Reporté sur la feuille de palanquée (annexe XX).',
      },
      {
        id: 'navire_immat',
        label: 'Immatriculation du navire',
        type: 'text',
        placeholder: 'PY …',
        when: (a) => pf(a) && !!a.depart_bateau,
      },
      { id: 'plongee_nuit', label: 'Plongée de nuit ?', type: 'bool', when: pf, ref: 'art. 10' },
      { id: 'plongee_derive', label: 'Plongée dérivante ?', type: 'bool', when: pf, ref: 'art. 11' },
      { id: 'plongee_passe', label: 'Plongée dans une passe ?', type: 'bool', when: pf, ref: 'art. 9' },
      {
        id: 'distance_cote',
        label: 'Distance prévue à la côte (M nautiques)',
        type: 'number',
        suffix: 'M nautiques',
        when: { depart_bateau: true },
      },
    ],
  },
  {
    id: 'C',
    title: "Profondeur & espaces d'évolution",
    questions: [
      { id: 'paliers', label: 'Plongée avec paliers obligatoires autorisée ?', type: 'bool' },
      { id: 'successive', label: 'Plongée successive prévue dans la journée ?', type: 'bool' },
    ],
  },
  {
    id: 'E',
    title: 'Matériel particulier',
    questions: [
      { id: 'recycleur', label: 'Recycleurs (CCR / SCR) ?', type: 'bool', ref: 'CdS A322-94' },
      {
        id: 'recycleur_modeles',
        label: 'Modèles et diluant',
        type: 'textarea',
        placeholder: 'ex. JJ-CCR — diluant air — 2 plongeurs',
        when: { recycleur: true },
      },
      {
        id: 'mixage_co_rec',
        label: 'Mixage circuit ouvert + recycleur dans une même palanquée ?',
        type: 'bool',
        when: { recycleur: true },
      },
      { id: 'bloc_relais', label: 'Bloc relais / déco prévu ?', type: 'bool' },
      {
        id: 'bloc_relais_gaz',
        label: 'Gaz du bloc relais / déco',
        type: 'multi',
        options: ['Air', 'Nx < 40 %', 'Nx > 40 %', 'O₂', 'Tx adapté'],
        cols: 5,
        when: { bloc_relais: true },
      },
      {
        id: 'parachute_par_plongeur',
        label: 'Exiger en plus un parachute par plongeur ?',
        type: 'bool',
        hint: 'En milieu naturel, un parachute de palier par palanquée est obligatoire (A322-80).',
      },
    ],
  },
  {
    id: 'F',
    title: 'Public',
    questions: [
      { id: 'mineurs', label: 'Présence de mineurs ?', type: 'bool' },
      {
        id: 'etrangers',
        label: 'Brevets étrangers non français (PADI, SSI, CMAS étr.) ?',
        type: 'bool',
        hint: '→ évaluation par un E3 prévue',
      },
      { id: 'handisub', label: 'Plongeurs en situation de handicap (handisub) ?', type: 'bool' },
    ],
  },
  {
    id: 'G',
    title: 'Sécurité surface',
    questions: [
      { id: 'sec_surface', label: 'Sécurité surface identifiée (personne dédiée) ?', type: 'bool', ref: 'CdS A322-78' },
      {
        id: 'sec_surface_membres',
        label: 'Plongeur(s) en surveillance surface (rotation possible)',
        type: 'divers-multi',
        hint: 'Choisir parmi les plongeurs présents — plusieurs peuvent se relayer.',
        when: { sec_surface: true },
      },
      {
        id: 'sec_surface_externes',
        label: 'Autres personnes en sécurité surface (non-plongeurs)',
        type: 'text',
        placeholder: 'Noms / fonctions',
        when: { sec_surface: true },
      },
      { id: 'plan_secours', label: 'Plan de secours affiché et à jour ?', type: 'bool' },
      {
        id: 'coords_secours',
        label: 'Coordonnées des secours disponibles ?',
        type: 'bool',
        hint: 'Numéros adaptés au pays du site (France : 15/18/112, mer : 196 ; Suisse : 144/117/1414).',
      },
      {
        id: 'urgence_num',
        label: "Numéro d'urgence (bouton URGENCE et fiche)",
        type: 'text',
        hint: 'Suit le pays du site : 18 en France, 144 en Suisse, 15 en Polynésie, sinon le numéro du club ou le 112.',
        ref: 'CdS A322-78',
      },
      { id: 'o2', label: 'Matériel O₂ vérifié (pression, BAVU, masques) ?', type: 'bool', ref: 'CdS A322-78' },
      { id: 'trousse', label: 'Trousse de secours + couverture isothermique vérifiées ?', type: 'bool' },
      { id: 'eau_potable', label: 'Eau douce potable disponible ?', type: 'bool' },
      {
        id: 'o2_litres',
        label: "Quantité d'oxygène disponible (litres détendus)",
        type: 'number',
        hint: 'Au moins 600 L (art. 15).',
        when: pf,
      },
      {
        id: 'rappel',
        label: 'Moyen de rappel des plongeurs (pétard, sondeur) ?',
        type: 'bool',
        when: { depart_bateau: true },
      },
      {
        id: 'bouee_surface',
        label: 'Bouée / pavillon de signalisation en surface ?',
        type: 'bool',
        when: (a) => isMilieuNaturel(a.milieu),
      },
      {
        id: 'trimix_secu_note',
        label: 'Plongée trimix : embarcation ou support avec une personne habilitée à la manœuvrer (Art. A322-97)',
        type: 'info',
        when: { trimix: true },
      },
    ],
  },
];
