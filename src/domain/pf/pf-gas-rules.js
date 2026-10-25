// @ts-check
// DP Assistant — Polynésie française : plongée à l'oxygène et aux mélanges
// autres que l'air (arrêté n° 199 CM, art. 27 à 37, annexes V, VI, XII à XV).
//
// Appelé par pf-rules.js avec le contexte de la palanquée (ctx) et le
// collecteur d'issues (add). Portage PHP : backend/lib/PfGasRules.php.

import { ageAt, memberId, memberName } from '../pal-helpers.js';
import { airLevel, ensLevel, gpLevel, hasAll, hasDp, isEncadrantRole, isNovice, level } from './pf-roles.js';

const PPO2_MAX = 1.6; // art. 29
const PPN2_MAX_NITROX = 5; // art. 30
const PPN2_MAX_TRIMIX = 4; // art. 31
const HYPOXIQUE = 16; // annexe VI : PTH-50 / PTH-70 = mélange d'au moins 16 % d'O₂
export const TRIMIX_SPACES = Object.freeze([50, 70, 80, 100, 120]);
export const TRIMIX_MAX = 120; // art. 4

// Annexe XIV — exploration : aptitudes des plongeurs encadrés, PTH du guide
// (rôle GP-50), effectif, DP ; autonomie : PA-50 + le PTH de la ligne.
const TX_EXPLORATION = Object.freeze({
  50: { apt: ['PE-50', 'PA-40'], gaz: ['PN-C', 'PTH-50'], pth: 'PTH-50', max: 4, dp: 'DP-70' },
  70: { apt: ['PA-50'], gaz: ['PTH-70'], pth: 'PTH-70', max: 2, dp: 'DP-70' },
  80: { apt: ['PA-50'], gaz: ['PTH-100'], pth: 'PTH-100', max: 2, dp: 'DP-100' },
  100: { apt: ['PA-50'], gaz: ['PTH-100'], pth: 'PTH-100', max: 2, dp: 'DP-100' },
  120: { apt: ['PA-50'], gaz: ['PTH-120'], pth: 'PTH-120', max: 2, dp: 'DP-120' },
});
// Annexe XV — formation : élèves (en cours de formation vers le PTH), PTH de
// l'enseignant (rôle ENS-50), DP ; 2 élèves au plus.
const TX_FORMATION = Object.freeze({
  50: { apt: ['PE-50', 'PA-40'], gaz: ['PN-C'], pth: 'PTH-70', dp: 'DP-70' },
  70: { apt: ['PA-50'], gaz: ['PN-C'], pth: 'PTH-100', dp: 'DP-100' },
  80: { apt: ['PA-50'], gaz: ['PN-C'], pth: 'PTH-100', dp: 'DP-100' },
  100: { apt: ['PA-50'], gaz: ['PN-C'], pth: 'PTH-100', dp: 'DP-120' },
  120: { apt: ['PA-50'], gaz: ['PN-C'], pth: 'PTH-120', dp: 'DP-120' },
});
const TX_FORMATION_MAX = 2;

const pressure = (profMax) => profMax / 10 + 1;
const known = (v) => v !== null && v !== undefined && v !== '' && Number(v) > 0;

// ── Nitrox (annexes V, XII, XIII) ────────────────────────────────────────

/** Espace maximal d'un élève en formation au nitrox : son aptitude air (annexe XIII). */
export function nitroxEleveMax(role) {
  if (role === 'Débutant' || role === 'Baptême') return 6;
  return airLevel(role);
}

export function checkNitrox(ctx, add) {
  const { gas, mode, space } = ctx;
  const pnc = gas.nx40plus;
  const bapt = ctx.membres.filter((m) => m._bapteme || m.aptitude === 'Baptême');
  if (bapt.length > 0) {
    add('err', 'PF_NX_BAPTEME', 'Pas de baptême au nitrox.', 'ann. XIII', bapt.map(memberId));
  }
  if (mode === 'enseignement') {
    const qual = space === 6 && !pnc ? 'PN' : 'PN-C';
    if (ctx.enseignant && !ctx.enseignant.profile.gaz.includes(qual)) {
      add(
        'err',
        'PF_NX_ENCADRANT',
        `${memberName(ctx.enseignant)} : enseignant au nitrox → aptitude ${qual} requise.`,
        'ann. XIII',
        [memberId(ctx.enseignant)],
      );
    }
    checkNitroxDp(ctx, qual, 'ann. XIII', add);
    return;
  }
  const qual = pnc ? 'PN-C' : 'PN';
  for (const m of ctx.membres) {
    if (m._bapteme || isEncadrantRole(m.aptitude)) continue;
    if (!m.profile.gaz.includes('PN')) {
      add('err', 'PF_NX_PN', `${memberName(m)} : plongée au nitrox → aptitude PN requise.`, 'ann. V', [memberId(m)]);
    } else if (pnc && !m.profile.gaz.includes('PN-C')) {
      add('err', 'PF_NX_PNC', `${memberName(m)} : nitrox > 40 % d'O₂ → aptitude PN-C requise.`, 'ann. V', [
        memberId(m),
      ]);
    }
  }
  if (ctx.guide && !ctx.guide.profile.gaz.includes(qual)) {
    add(
      'err',
      'PF_NX_ENCADRANT',
      `${memberName(ctx.guide)} : guide de palanquée au nitrox → aptitude ${qual} requise.`,
      'ann. XII',
      [memberId(ctx.guide)],
    );
  }
  checkNitroxDp(ctx, qual, 'ann. XII', add);
}

function checkNitroxDp(ctx, qual, ref, add) {
  if (ctx.dpProfile && !ctx.dpProfile.gaz.includes(qual)) {
    add('err', 'PF_NX_DP', `Plongée au nitrox : le directeur de plongée justifie l'aptitude ${qual}.`, ref);
  }
}

// ── Trimix et héliox (annexes VI, XIV, XV) ───────────────────────────────

export function checkTrimix(ctx, add) {
  const publicInterdit = ctx.membres.filter((m) => m._bapteme || isNovice(m.aptitude));
  if (publicInterdit.length > 0) {
    add(
      'err',
      'PF_TX_PUBLIC',
      'Trimix : interdit aux baptêmes et aux débutants.',
      'ann. XIV',
      publicInterdit.map(memberId),
    );
    return;
  }
  if (ctx.profMax > TRIMIX_MAX) {
    add('err', 'PF_TX_120', `Trimix ou héliox : ${ctx.profMax} m dépasse le maximum de 120 m.`, 'art. 4');
    return;
  }
  if (ctx.space === null) return;
  if (ctx.mode === 'enseignement') trimixFormation(ctx, add);
  else if (ctx.membres.some((m) => isEncadrantRole(m.aptitude))) trimixExploration(ctx, add);
  else trimixAutonomie(ctx, add);
}

/** Plongeurs sans les aptitudes de la ligne, ou sans PTH-100 sur un mélange hypoxique. */
function checkTxQual(ctx, plongeurs, apt, gaz, ref, add) {
  const o2 = Number(ctx.pal.o2);
  const hypoxique = known(ctx.pal.o2) && o2 < HYPOXIQUE;
  const missing = plongeurs.filter(
    (m) => !hasAll(m.profile, apt, gaz) || (hypoxique && !hasAll(m.profile, [], ['PTH-100'])),
  );
  if (missing.length > 0) {
    const req = [...apt, ...gaz, ...(hypoxique ? ['PTH-100 (mélange hypoxique)'] : [])].join(', ');
    add(
      'err',
      'PF_TX_QUAL',
      `${missing.map(memberName).join(', ')} : aptitudes requises dans l'espace 0-${ctx.space} m : ${req}.`,
      ref,
      missing.map(memberId),
    );
  }
}

function checkTxDp(ctx, required, ref, add) {
  if (!ctx.dpProfile) {
    add('warn', 'DP_MISSING', 'Directeur de plongée non désigné.', 'LP 8');
  } else if (!hasDp(ctx.dpProfile, required)) {
    add('err', 'PF_TX_DP', `Trimix dans l'espace 0-${ctx.space} m : directeur de plongée ${required} au minimum.`, ref);
  }
}

function trimixExploration(ctx, add) {
  const row = TX_EXPLORATION[ctx.space];
  const encadrants = ctx.membres.filter((m) => isEncadrantRole(m.aptitude));
  const encadres = ctx.membres.filter((m) => !isEncadrantRole(m.aptitude));
  if (!ctx.guide) {
    add(
      'err',
      'PF_GP_REQUIRED',
      'En exploration, la palanquée est encadrée par un guide de palanquée (GP-50 au trimix).',
      'ann. XIV',
      encadrants.map(memberId),
    );
  } else {
    if (gpLevel(ctx.guide.aptitude) < 50) {
      add('err', 'PF_GP_LEVEL', 'Trimix : guide de palanquée GP-50 requis.', 'ann. XIV', [memberId(ctx.guide)]);
    }
    if (!ctx.guide.profile.gaz.includes(row.pth)) {
      add(
        'err',
        'PF_TX_ENCADRANT',
        `${memberName(ctx.guide)} : guide au trimix dans l'espace 0-${ctx.space} m → aptitude ${row.pth} requise.`,
        'ann. XIV',
        [memberId(ctx.guide)],
      );
    }
  }
  checkTxQual(ctx, encadres, row.apt, row.gaz, 'ann. XIV', add);
  const effectif = encadres.length + encadrants.length - (ctx.guide ? 1 : 0);
  if (effectif > row.max) {
    add(
      'err',
      'PF_EFFECTIF',
      `Trimix 0-${ctx.space} m : ${row.max} plongeurs encadrés au plus (${effectif} dans la palanquée).`,
      'ann. XIV',
      encadres.map(memberId),
    );
  }
  checkTxDp(ctx, row.dp, 'ann. XIV', add);
}

function trimixAutonomie(ctx, add) {
  const row = TX_EXPLORATION[ctx.space];
  const pe = ctx.membres.filter((m) => level(m.aptitude, 'PE') > 0);
  if (pe.length > 0) {
    add(
      'err',
      'PF_ENCADRANT_REQUIRED',
      `${pe.map(memberName).join(', ')} : aptitude PE, plongée encadrée par un guide de palanquée.`,
      'ann. XIV',
      pe.map(memberId),
    );
  }
  if (ctx.membres.length > 3) {
    add(
      'err',
      'PF_AUTONOMIE_EFFECTIF',
      `Plongée en autonomie : 3 plongeurs au plus (${ctx.membres.length} dans la palanquée).`,
      'ann. XIV',
      ctx.membres.map(memberId),
    );
  }
  const autonomes = ctx.membres.filter((m) => level(m.aptitude, 'PA') > 0);
  checkTxQual(ctx, autonomes, ['PA-50'], [row.pth], 'ann. XIV', add);
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
    } else if (age < 18) {
      add(
        'err',
        'PF_AUTONOMIE_MAJEUR',
        `${memberName(m)} (${age} ans) : les mineurs ne plongent pas en autonomie.`,
        'LP 4',
        [memberId(m)],
      );
    }
  }
  checkTxDp(ctx, row.dp, 'ann. XIV', add);
}

function trimixFormation(ctx, add) {
  const row = TX_FORMATION[ctx.space];
  const encadrants = ctx.membres.filter((m) => isEncadrantRole(m.aptitude));
  const eleves = ctx.membres.filter((m) => !isEncadrantRole(m.aptitude));
  const ens = ctx.enseignant;
  if (!ens) {
    add(
      'err',
      'PF_ENS_REQUIRED',
      'Formation au trimix : enseignant ENS-50 requis.',
      'ann. XV',
      encadrants.map(memberId),
    );
  } else {
    if (ensLevel(ens.aptitude) < 50) {
      add('err', 'PF_ENS_LEVEL', 'Formation au trimix : enseignant ENS-50 requis.', 'ann. XV', [memberId(ens)]);
    }
    if (!ens.profile.gaz.includes(row.pth)) {
      add(
        'err',
        'PF_TX_ENCADRANT',
        `${memberName(ens)} : enseignant au trimix dans l'espace 0-${ctx.space} m → aptitude ${row.pth} requise.`,
        'ann. XV',
        [memberId(ens)],
      );
    }
  }
  checkTxQual(ctx, eleves, row.apt, row.gaz, 'ann. XV', add);
  const effectif = eleves.length + encadrants.length - (ens ? 1 : 0);
  if (effectif > TX_FORMATION_MAX) {
    add(
      'err',
      'PF_EFFECTIF',
      `Formation au trimix : ${TX_FORMATION_MAX} élèves au plus (${effectif} dans la palanquée).`,
      'ann. XV',
      eleves.map(memberId),
    );
  }
  checkTxDp(ctx, row.dp, 'ann. XV', add);
}

// ── Pressions partielles du gaz fond (art. 29 à 31) ──────────────────────

export function checkPressures(ctx, add) {
  const { gas, pal, profMax } = ctx;
  if (!gas.trimix && !gas.bottomNitrox) return;
  const o2 = Number(pal.o2);
  if (!known(pal.o2)) {
    add(
      'warn',
      'O2_UNKNOWN',
      "Renseigner le % d'O₂ du gaz fond pour contrôler la profondeur maximale d'utilisation.",
      'art. 29',
    );
    if (gas.trimix) ppn2Unknown(add);
    return;
  }
  if (o2 >= 100) {
    add(
      'err',
      'O2_PUR_FOND',
      'Oxygène pur : utilisable en recycleur ou en décompression, pas comme gaz fond en circuit ouvert.',
      'art. 27',
    );
  }
  if (gas.trimix || (o2 > 21 && o2 <= gas.bottomO2Max)) {
    const mod = Math.floor((PPO2_MAX / (o2 / 100) - 1) * 10 + 1e-9);
    if (profMax > mod) {
      add(
        'err',
        'PPO2_MAX',
        `Mélange à ${o2} % d'O₂ : profondeur maximale d'utilisation ${mod} m (PpO₂ 1,6 bar) — palanquée à ${profMax} m.`,
        'art. 29',
      );
    }
  } else if (o2 < 100) {
    add(
      'warn',
      'O2_UNKNOWN',
      "Renseigner le % d'O₂ du gaz fond pour contrôler la profondeur maximale d'utilisation.",
      'art. 29',
    );
  }
  if (gas.trimix) {
    if (!known(pal.he)) return ppn2Unknown(add);
    const ppn2 = (1 - o2 / 100 - Number(pal.he) / 100) * pressure(profMax);
    if (ppn2 > PPN2_MAX_TRIMIX + 1e-9) {
      add('err', 'PF_PPN2', `Trimix : PpN₂ de ${ppn2.toFixed(2)} bar à ${profMax} m (4 bar au plus).`, 'art. 31');
    }
    return;
  }
  const ppn2 = (1 - o2 / 100) * pressure(profMax);
  if (ppn2 > PPN2_MAX_NITROX + 1e-9) {
    add('err', 'PF_PPN2', `Nitrox : PpN₂ de ${ppn2.toFixed(2)} bar à ${profMax} m (5 bar au plus).`, 'art. 30');
  }
}

function ppn2Unknown(add) {
  add(
    'warn',
    'PF_PPN2_UNKNOWN',
    "Trimix : renseigner le % d'hélium pour contrôler la PpN₂ (4 bar au plus).",
    'art. 31',
  );
}
