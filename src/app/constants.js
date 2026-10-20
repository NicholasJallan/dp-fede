// DP Assistant — Constantes de navigation du shell applicatif.

export const STEPS = [
  { id:"profil",     num:"01", label:"Profil de plongée",        sub:"Questionnaire" },
  { id:"palanquees", num:"02", label:"Plongeurs & palanquées",    sub:"Composition" },
  { id:"checklist",  num:"03", label:"Check-list opérationnelle", sub:"Phases 1→5" },
  { id:"fiche",      num:"04", label:"Fiche de sécurité",         sub:"Art. A322-72" },
  { id:"archive",    num:"05", label:"Archiver la plongée",       sub:"Google Drive" },
];

export const ADMIN_SCREENS = [
  "admin-divers", "admin-sites", "admin-users", "account", "archives",
  "club", "stats", "import-divers",
];

// Écran secondaire → onglet mis en évidence dans la navigation.
export const PARENT_SCREEN = { "import-divers": "admin-divers", stats: "club" };

export const FICHE_IDX    = STEPS.findIndex(s => s.id === "fiche");
export const ARCHIVE_IDX  = STEPS.findIndex(s => s.id === "archive");
export const CHECKLIST_IDX = STEPS.findIndex(s => s.id === "checklist");

// Masquer les étapes exécution en mode prepare, et vice-versa.
// En mode execute, on montre checklist+fiche+archive ; en prepare, profil+palanquees+checklist
export const PREPARE_ONLY_STEPS = ['profil', 'palanquees'];
export const EXECUTE_ONLY_STEPS = ['fiche', 'archive'];
