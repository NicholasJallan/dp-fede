// @ts-check
// DP Assistant — Profil d'un plongeur au sens de la réglementation de la
// Polynésie française (loi du pays n° 2017-44, arrêté n° 199 CM).
//
// Le droit polynésien raisonne en aptitudes (PE/PA-12 à 50, Ann. IV),
// mélanges (PN, PN-C, PTH-50 à 120, Ann. V et VI) et fonctions graduées par
// profondeur (ENS-06 à 50, GP-40/50, DP-40 à 120, Ann. I à III). Un plongeur
// FFESSM reçoit ces aptitudes par les colonnes « FFESSM » et « diplômes
// d'État » des annexes I, II, III, VII, VIII et IX (pfFromFr) ; ce que le DP
// saisit dans `diver.pf` prime (art. LP 13 : c'est lui qui reconnaît les
// aptitudes). Portage PHP : backend/lib/PfProfile.php, cas communs dans
// tests/fixtures/pf-equivalences.json.

export const PF_CODES = Object.freeze({
  aptitudes: Object.freeze(['PE-12', 'PE-20', 'PE-30', 'PE-40', 'PE-50', 'PA-12', 'PA-20', 'PA-30', 'PA-40', 'PA-50']),
  gaz: Object.freeze(['PN', 'PN-C', 'PTH-50', 'PTH-70', 'PTH-100', 'PTH-120']),
  fonctions: Object.freeze([
    'ENS-06',
    'ENS-20',
    'ENS-30',
    'ENS-40',
    'ENS-50',
    'GP-40',
    'GP-50',
    'DP-40',
    'DP-60',
    'DP-70',
    'DP-100',
    'DP-120',
  ]),
  // Diplômes plongée de la liste d'homologation (arrêté n° 2391 CM du 01/12/2025).
  diplomes: Object.freeze(['BPJEPS', 'DEJEPS', 'DEJEPS-E4', 'DESJEPS', 'BEES1', 'BEES2', 'BEES3', 'BPP-GAPPN']),
});

// Annexes VII (PE) et VIII (PA), colonne FFESSM. Le P2 reçoit PA-40 mais pas
// PA-30 : transcription littérale de l'annexe VIII (décision du 25/10/2026).
const APTITUDES_PAR_NIVEAU = Object.freeze({
  N1: ['PE-12', 'PE-20'],
  N2: ['PE-12', 'PE-20', 'PE-30', 'PE-40', 'PA-12', 'PA-20', 'PA-40'],
  N3: PF_CODES.aptitudes,
});

// Qualifications FFESSM (aptitudes_sup) citées par les annexes VII et VIII.
const APTITUDES_PAR_QUALIF = Object.freeze({
  PA12: ['PA-12'],
  PA20: ['PA-20'],
  PA40: ['PA-30'],
  PE40: ['PE-30', 'PE-40', 'PA-40'],
  PE60: ['PE-50', 'PA-50'],
});

// Annexes V et IX.
const GAZ_PAR_QUALIF = Object.freeze({
  PN: ['PN'],
  'PN-C': ['PN', 'PN-C'],
  'PTH-40': ['PTH-50'],
  'PTH-70': ['PTH-50', 'PTH-70'],
  'PTH-120': ['PTH-50', 'PTH-70', 'PTH-100', 'PTH-120'],
});

// Fonctions de base (annexes I, II, III) ; DP-70 / DP-100 / DP-120 s'y
// ajoutent selon les aptitudes trimix (annexe I, notes 2 à 4).
const ENS_30 = ['ENS-06', 'ENS-20', 'ENS-30'];
const ENS_50 = [...ENS_30, 'ENS-40', 'ENS-50'];
const MF1 = Object.freeze({ fonctions: [...ENS_30, 'GP-40', 'DP-40', 'DP-60'], dpTrimixMax: 70 });
const MF2 = Object.freeze({ fonctions: [...ENS_50, 'GP-40', 'GP-50', 'DP-40', 'DP-60'], dpTrimixMax: 120 });

const FONCTIONS_PAR_NIVEAU = Object.freeze({
  N4: { fonctions: ['GP-40'], dpTrimixMax: 0 },
  N5: { fonctions: ['GP-40', 'DP-40'], dpTrimixMax: 0 },
  E1: { fonctions: ['ENS-06'], dpTrimixMax: 0 },
  E2: { fonctions: ['ENS-06', 'ENS-20', 'GP-40'], dpTrimixMax: 0 },
  E3: MF1,
  E4: MF2,
});

const FONCTIONS_PAR_DIPLOME = Object.freeze({
  BPJEPS: { fonctions: ['ENS-06', 'ENS-20', 'GP-40'], dpTrimixMax: 0 },
  BEES1: MF1,
  DEJEPS: MF1,
  'DEJEPS-E4': MF2,
  BEES2: MF2,
  DESJEPS: MF2,
});

/** Niveau plongeur implicite d'un encadrant (cf. plongeurForEncadrant du formulaire). */
function niveauPlongeur(diver) {
  const ne = diver.niveau_encadrant;
  if (ne === 'E1') return diver.niveau_plongeur === 'N3' ? 'N3' : 'N2';
  return ne ? 'N3' : diver.niveau_plongeur;
}

/**
 * @param {readonly string[]} codes ordre canonique
 * @param {Iterable<string>} values
 */
const ordered = (codes, values) => {
  const set = new Set(values);
  return codes.filter((c) => set.has(c));
};

/** @param {unknown} v */
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

function trimixDps(gaz, dpTrimixMax) {
  const dps = [];
  if (dpTrimixMax >= 70 && gaz.includes('PTH-70')) dps.push('DP-70');
  if (dpTrimixMax >= 100 && gaz.includes('PTH-100')) dps.push('DP-100');
  if (dpTrimixMax >= 120 && gaz.includes('PTH-120')) dps.push('DP-120');
  return dps;
}

/**
 * Aptitudes, mélanges et fonctions PF déduits des champs FFESSM du plongeur.
 * @param {any} diver
 */
export function pfFromFr(diver) {
  const d = diver || {};
  const niveau = niveauPlongeur(d);
  const aptitudes = [
    ...(APTITUDES_PAR_NIVEAU[niveau] || []),
    ...list(d.aptitudes_sup).flatMap((q) => APTITUDES_PAR_QUALIF[q] || []),
  ];
  const gaz = ordered(
    PF_CODES.gaz,
    [...list(d.nitrox), ...list(d.trimix)].flatMap((q) => GAZ_PAR_QUALIF[q] || []),
  );
  const sources = [FONCTIONS_PAR_NIVEAU[d.niveau_encadrant], FONCTIONS_PAR_DIPLOME[d.diplome_pro]].filter(Boolean);
  const fonctions = sources.flatMap((s) => [...s.fonctions, ...trimixDps(gaz, s.dpTrimixMax)]);
  return {
    aptitudes: ordered(PF_CODES.aptitudes, aptitudes),
    gaz,
    fonctions: ordered(PF_CODES.fonctions, fonctions),
    diplome_homologue: PF_CODES.diplomes.includes(d.diplome_pro) ? d.diplome_pro : null,
  };
}

/**
 * Profil PF effectif : la saisie du DP (diver.pf) prime, liste par liste ;
 * une liste saisie vide retombe sur la déduction FFESSM.
 * @param {any} diver
 */
export function pfProfile(diver) {
  const d = diver || {};
  const pf = d.pf && typeof d.pf === 'object' ? d.pf : {};
  const derived = pfFromFr(d);
  const pick = (/** @type {'aptitudes'|'gaz'|'fonctions'} */ key) => {
    const saisie = ordered(PF_CODES[key], list(pf[key]));
    return saisie.length ? { value: saisie, derived: false } : { value: derived[key], derived: true };
  };
  const aptitudes = pick('aptitudes');
  const gaz = pick('gaz');
  const fonctions = pick('fonctions');
  const diplomeSaisi = PF_CODES.diplomes.includes(pf.diplome_homologue) ? pf.diplome_homologue : null;
  return {
    aptitudes: aptitudes.value,
    gaz: gaz.value,
    fonctions: fonctions.value,
    diplome_homologue: diplomeSaisi ?? derived.diplome_homologue,
    stagiaire: !!pf.stagiaire,
    patente: !!pf.patente,
    brevets: typeof pf.brevets === 'string' ? pf.brevets : '',
    attestation: typeof pf.attestation === 'string' && pf.attestation ? pf.attestation : null,
    derived: {
      aptitudes: aptitudes.derived,
      gaz: gaz.derived,
      fonctions: fonctions.derived,
      diplome_homologue: diplomeSaisi === null,
    },
  };
}
