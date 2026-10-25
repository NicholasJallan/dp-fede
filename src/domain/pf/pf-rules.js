// @ts-check
// DP Assistant — Validation d'une palanquée en Polynésie française (loi du
// pays n° 2017-44, arrêté n° 199 CM) : plongée à l'air (annexes X et XI) ;
// mélanges dans ./pf-gas-rules.js (annexes XII à XV).
//
// Chaque membre choisit un rôle au sens de l'arrêté : aptitude (PE-12 à 50,
// PA-12 à 50), fonction d'encadrement (GP-40/50, ENS-06 à 50), « Débutant »
// (LP 4) ou « Baptême ». Le profil de chaque plongeur vient de pfProfile
// (saisie du DP, sinon déduction FFESSM). En formation, l'élève garde son
// aptitude acquise : l'annexe XI dit jusqu'où l'enseignant présent l'emmène.
// Portage PHP : backend/lib/PfRules.php, cas communs dans
// tests/fixtures/pal-rules-pf.json.

/** @typedef {import('../pal-rules.js').Issue} Issue */

import { ageAt, memberId, memberName, palGas } from '../pal-helpers.js';
import { checkNitrox, checkPressures, checkTrimix, nitroxEleveMax, TRIMIX_MAX, TRIMIX_SPACES } from './pf-gas-rules.js';
import { pfProfile } from './pf-profile.js';
import { airLevel, best, ensLevel, gpLevel, hasDp, isEncadrantRole, isNovice, level } from './pf-roles.js';

const AIR_MAX = 50; // art. 4
const AIR_FORMATION_MAX = 60; // art. 4 et 26 : +10 m si les standards de formation l'exigent
const AGE_AUTONOMIE = 18; // LP 4 : pas de mineur en autonomie
const AUTONOMIE_MAX = 3; // LP 4

const EXPLORATION_SPACES = [12, 20, 30, 40, 50];
const FORMATION_SPACES = [6, 12, 20, 30, 40, 50];

// Annexe X — effectif maximal des plongeurs encadrés (encadrant non compris).
const EXPLORATION_EFFECTIF = Object.freeze({ 12: 4, 20: 5, 30: 5, 40: 5, 50: 4 });
// Annexe XI — effectif, ENS minimal et encadrant supplémentaire (notes b à e).
const FORMATION = Object.freeze({
  6: { max: 2, ens: 6, extraEns: 20 },
  12: { max: 4, ens: 20, extraEns: 20 },
  20: { max: 4, ens: 20, extraEns: 20 },
  30: { max: 4, ens: 30, extraEns: 30 },
  40: { max: 4, ens: 40, extraEns: 40 },
  50: { max: 2, ens: 50, extraEns: 50, extraGp: false },
});
// Annexe XI — espace maximal d'un élève selon l'aptitude qu'il détient.
const FORMATION_MAX_PAR_ROLE = Object.freeze({
  Baptême: 6,
  Débutant: 12,
  'PE-12': 20,
  'PA-12': 20,
  'PE-20': 40,
  'PA-20': 40,
  'PE-30': 40,
  'PA-30': 40,
  'PE-40': 50,
  'PA-40': 50,
  'PE-50': 50,
  'PA-50': 50,
});
const spaceIn = (spaces, profMax) => spaces.find((s) => profMax <= s) ?? null;

/** Pièce datée de moins d'un an à la date de plongée. */
function validWithinYear(iso, date) {
  if (!iso) return false;
  const expiry = new Date(iso);
  if (isNaN(expiry.getTime())) return false;
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry >= date;
}

function resolveMembres(pal, diversById) {
  return (pal.membres || [])
    .map((m) => ({ ...m, diver: m._bapteme ? null : diversById[m.diverId] }))
    .filter((m) => m._bapteme || m.diver)
    .map((m) => ({ ...m, profile: m._bapteme ? null : pfProfile(m.diver) }));
}

function checkGeneric(pal, membres, add) {
  if (membres.length === 0) {
    add('warn', 'PAL_EMPTY', 'Palanquée vide.');
    return false;
  }
  if (membres.length === 1) add('err', 'PAL_SOLO', 'Une palanquée compte au moins deux plongeurs.', 'LP 4');
  const sans = membres.filter((m) => !m.aptitude);
  if (sans.length > 0) {
    add(
      'err',
      'APT_MISSING',
      `${sans.length} membre(s) sans aptitude sélectionnée — veuillez compléter avant de continuer.`,
      null,
      sans.map(memberId),
    );
    return false;
  }
  if (!(Number(pal.profMax) > 0)) {
    add(
      'err',
      'PROF_MISSING',
      "Profondeur maximale prévue non renseignée : l'espace d'évolution ne peut pas être contrôlé.",
      'art. 2',
    );
    return false;
  }
  return true;
}

function checkJustified(ctx, add) {
  for (const m of ctx.membres) {
    if (m._bapteme || isNovice(m.aptitude)) continue;
    const roles = [...m.profile.aptitudes, ...m.profile.fonctions];
    if (!roles.includes(m.aptitude)) {
      add(
        'err',
        'PF_APT_NOT_JUSTIFIED',
        `${memberName(m)} : ${m.aptitude} ne figure pas dans ses aptitudes reconnues.`,
        'LP 13',
        [memberId(m)],
      );
    }
  }
}

function checkAirDepth(ctx, add) {
  const { pal, profMax, mode, gas } = ctx;
  if (pal.derogation_formation_60 && mode !== 'enseignement') {
    add(
      'err',
      'PF_DEROG_FORMATION_ONLY',
      'La dérogation de 10 m au-delà de 50 m est réservée aux plongées de formation.',
      'art. 26',
    );
  }
  if (gas.trimix) return;
  if (profMax > AIR_FORMATION_MAX) {
    add('err', 'PF_AIR_60', `Air ou nitrox : ${profMax} m dépasse le maximum absolu de 60 m.`, 'art. 4');
  } else if (profMax > AIR_MAX && !(mode === 'enseignement' && pal.derogation_formation_60)) {
    add(
      'err',
      'PF_AIR_50',
      `Air ou nitrox limité à 50 m (palanquée à ${profMax} m) ; jusqu'à 60 m seulement en formation, si les standards de l'organisme l'exigent.`,
      'art. 4',
    );
  }
}

function checkDp(ctx, required, add) {
  if (!ctx.dpProfile) {
    add('warn', 'DP_MISSING', 'Directeur de plongée non désigné.', 'LP 8');
    return;
  }
  if (!hasDp(ctx.dpProfile, required)) {
    add(
      'err',
      'PF_DP_LEVEL',
      `Directeur de plongée ${required} au minimum pour cette palanquée (${ctx.mode}, ${ctx.profMax} m).`,
      'ann. I',
    );
  }
}

function checkExplorationEncadree(ctx, add) {
  const encadrants = ctx.membres.filter((m) => isEncadrantRole(m.aptitude));
  const { guide } = ctx;
  if (!guide) {
    add(
      'err',
      'PF_GP_REQUIRED',
      'En exploration, la palanquée est encadrée par un guide de palanquée (GP-40 ou GP-50).',
      'ann. X',
      encadrants.map(memberId),
    );
    return;
  }
  const { space } = ctx;
  if (space === null) return;
  if (space === 50 && gpLevel(guide.aptitude) < 50) {
    add('err', 'PF_GP_LEVEL', "Exploration dans l'espace 0-50 m : guide GP-50 requis.", 'ann. X', [memberId(guide)]);
  }
  const encadres = ctx.membres.filter((m) => !isEncadrantRole(m.aptitude));
  checkAptitudesForSpace(encadres, space, 'ann. X', add);
  const extras = encadrants.filter((m) => m !== guide);
  const extraOk = space <= 40 && extras.some((m) => gpLevel(m.aptitude) >= 40 || ensLevel(m.aptitude) >= 40);
  const effectif = encadres.length + extras.length - (extraOk ? 1 : 0);
  const max = EXPLORATION_EFFECTIF[space];
  if (effectif > max) {
    add(
      'err',
      'PF_EFFECTIF',
      `Exploration 0-${space} m : ${max} plongeurs encadrés au plus (${effectif} dans la palanquée).`,
      'ann. X',
      encadres.map(memberId),
    );
  }
  checkDp(ctx, space === 50 ? 'DP-60' : 'DP-40', add);
}

function checkAptitudesForSpace(membres, space, ref, add) {
  const short = membres.filter((m) => airLevel(m.aptitude) < space);
  if (short.length > 0) {
    add(
      'err',
      'PF_APT_DEPTH',
      `${short.map(memberName).join(', ')} : aptitude insuffisante pour l'espace 0-${space} m.`,
      ref,
      short.map(memberId),
    );
  }
}

function checkAutonomie(ctx, add) {
  const encadres = ctx.membres.filter((m) => airLevel(m.aptitude) > 0 && level(m.aptitude, 'PE') > 0);
  if (encadres.length > 0) {
    add(
      'err',
      'PF_ENCADRANT_REQUIRED',
      `${encadres.map(memberName).join(', ')} : aptitude PE, plongée encadrée par un guide de palanquée.`,
      'art. 23',
      encadres.map(memberId),
    );
  }
  if (ctx.membres.length > AUTONOMIE_MAX) {
    add(
      'err',
      'PF_AUTONOMIE_EFFECTIF',
      `Plongée en autonomie : ${AUTONOMIE_MAX} plongeurs au plus (${ctx.membres.length} dans la palanquée).`,
      'LP 4',
      ctx.membres.map(memberId),
    );
  }
  const autonomes = ctx.membres.filter((m) => level(m.aptitude, 'PA') > 0);
  if (ctx.space !== null) checkAptitudesForSpace(autonomes, ctx.space, 'art. 24', add);
  for (const m of autonomes) {
    const age = ageAt(m.diver?.date_naissance, ctx.date);
    if (age === null) {
      add(
        'warn',
        'AGE_UNKNOWN',
        `${memberName(m)} : date de naissance non renseignée — autonomie réservée aux majeurs.`,
        'LP 4',
        [memberId(m)],
      );
    } else if (age < AGE_AUTONOMIE) {
      add(
        'err',
        'PF_AUTONOMIE_MAJEUR',
        `${memberName(m)} (${age} ans) : les mineurs ne plongent pas en autonomie.`,
        'LP 4',
        [memberId(m)],
      );
    }
  }
  if (ctx.space !== null) checkDp(ctx, ctx.space === 50 ? 'DP-60' : 'DP-40', add);
}

function checkFormation(ctx, add) {
  const encadrants = ctx.membres.filter((m) => isEncadrantRole(m.aptitude));
  const { enseignant } = ctx;
  if (!enseignant) {
    add(
      'err',
      'PF_ENS_REQUIRED',
      'En formation, la palanquée est encadrée par un enseignant (ENS-06 à ENS-50).',
      'ann. XI',
      encadrants.map(memberId),
    );
  }
  const { space } = ctx;
  if (space === null) return;
  const row = FORMATION[space];
  if (enseignant && ensLevel(enseignant.aptitude) < row.ens) {
    add(
      'err',
      'PF_ENS_LEVEL',
      `Formation dans l'espace 0-${space} m : enseignant ENS-${String(row.ens).padStart(2, '0')} au minimum.`,
      'ann. XI',
      [memberId(enseignant)],
    );
  }
  const eleves = ctx.membres.filter((m) => !isEncadrantRole(m.aptitude));
  // Au nitrox, l'élève évolue dans l'espace de son aptitude air (annexe XIII).
  const eleveMax = (role) => (ctx.gas.nitrox ? nitroxEleveMax(role) : (FORMATION_MAX_PAR_ROLE[role] ?? 0));
  const short = eleves.filter((m) => eleveMax(m.aptitude) < space);
  if (short.length > 0) {
    add(
      'err',
      'PF_APT_DEPTH',
      `${short.map(memberName).join(', ')} : aptitude insuffisante pour une formation dans l'espace 0-${space} m.`,
      'ann. XI',
      short.map(memberId),
    );
  }
  const extras = encadrants.filter((m) => m !== enseignant);
  const extraOk = extras.some(
    (m) => ensLevel(m.aptitude) >= row.extraEns || (row.extraGp !== false && gpLevel(m.aptitude) >= 40),
  );
  const effectif = eleves.length + extras.length - (extraOk ? 1 : 0);
  if (effectif > row.max) {
    add(
      'err',
      'PF_EFFECTIF',
      `Formation 0-${space} m : ${row.max} élèves au plus par enseignant (${effectif} dans la palanquée).`,
      'ann. XI',
      eleves.map(memberId),
    );
  }
  checkDp(ctx, space === 6 ? 'DP-40' : 'DP-60', add);
}

function checkMedical(ctx, add) {
  for (const m of ctx.membres) {
    if (m._bapteme) continue;
    const certificat = validWithinYear(m.diver.medical, ctx.date);
    if (isEncadrantRole(m.aptitude)) {
      if (!certificat) {
        add(
          'err',
          'PF_MEDICAL_ENCADRANT',
          `${memberName(m)} : encadrant sans certificat médical de moins de 12 mois (surveillance médicale renforcée).`,
          'art. 13',
          [memberId(m)],
        );
      }
    } else if (!certificat && !validWithinYear(m.profile.attestation, ctx.date)) {
      add(
        'warn',
        'PF_ATTESTATION_MISSING',
        `${memberName(m)} : ni attestation de condition physique ni certificat médical de moins de 12 mois.`,
        'art. 12',
        [memberId(m)],
      );
    }
  }
  if (ctx.dp && !validWithinYear(ctx.dp.medical, ctx.date)) {
    add(
      'err',
      'PF_MEDICAL_DP',
      'Directeur de plongée sans certificat médical de moins de 12 mois (surveillance médicale renforcée).',
      'art. 13',
    );
  }
}

function palMode(pal, membres, add) {
  const roles = membres.map((m) => m.aptitude);
  const novices = roles.some(isNovice);
  if (pal.mode === 'exploration' && novices) {
    add(
      'warn',
      'MODE_BAPTEME',
      'Un baptême ou un débutant relève de la formation : palanquée traitée en formation.',
      'art. 25',
    );
    return 'enseignement';
  }
  if (pal.mode === 'enseignement' || pal.mode === 'exploration') return pal.mode;
  return novices || roles.some((r) => ensLevel(r) > 0) ? 'enseignement' : 'exploration';
}

function buildContext(pal, membres, answers, dp, add) {
  const profMax = Number(pal.profMax) || 0;
  const mode = palMode(pal, membres, add);
  const gas = palGas(pal.melanges);
  const derog = mode === 'enseignement' && !!pal.derogation_formation_60;
  const limit = derog ? AIR_FORMATION_MAX : AIR_MAX;
  const spaces = mode === 'enseignement' ? FORMATION_SPACES : EXPLORATION_SPACES;
  let space = profMax > limit ? null : (spaceIn(spaces, profMax) ?? 50);
  if (gas.trimix) space = profMax > TRIMIX_MAX ? null : spaceIn(TRIMIX_SPACES, profMax);
  const encadrants = membres.filter((m) => isEncadrantRole(m.aptitude));
  const dpProfile = dp ? pfProfile(dp) : answers.dp_qual ? pfProfile({ niveau_encadrant: answers.dp_qual }) : null;
  return {
    pal,
    membres,
    answers,
    dp,
    dpProfile,
    profMax,
    mode,
    gas,
    space,
    guide: best(
      encadrants.filter((m) => gpLevel(m.aptitude) > 0),
      gpLevel,
    ),
    enseignant: best(
      encadrants.filter((m) => ensLevel(m.aptitude) > 0),
      ensLevel,
    ),
    date: answers.date ? new Date(answers.date) : new Date(),
  };
}

/**
 * @param {Partial<import('../types.js').Palanquee> & { derogation_formation_60?: boolean }} pal
 * @param {object} diversById
 * @param {object} answers
 * @param {object|null} dp
 * @returns {Issue[]}
 */
export function validatePalPf(pal, diversById, answers, dp) {
  /** @type {Issue[]} */
  const issues = [];
  const add = (tone, code, text, ref = null, ids = []) => issues.push({ tone, code, text, ref, ids });

  const membres = resolveMembres(pal, diversById);
  if (!checkGeneric(pal, membres, add)) return issues;

  const ctx = buildContext(pal, membres, answers, dp, add);
  checkJustified(ctx, add);
  checkAirDepth(ctx, add);
  if (ctx.gas.trimix) {
    checkTrimix(ctx, add);
  } else {
    if (ctx.mode === 'enseignement') checkFormation(ctx, add);
    else if (membres.some((m) => isEncadrantRole(m.aptitude))) checkExplorationEncadree(ctx, add);
    else checkAutonomie(ctx, add);
    if (ctx.gas.nitrox) checkNitrox(ctx, add);
  }
  checkPressures(ctx, add);
  checkMedical(ctx, add);

  if (!issues.some((i) => i.tone === 'err')) {
    add('ok', 'OK', 'Composition conforme à la réglementation de la Polynésie française.');
  }
  return issues;
}
