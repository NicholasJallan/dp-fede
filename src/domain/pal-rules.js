// @ts-check
// DP Assistant — Validation d'une palanquée (Code du sport, plongée subaquatique)
//
// Module pur, sans dépendance React. Les tableaux réglementaires (annexes
// III-15 a à III-18 c) sont dans ./cds-tables.js ; ce module les applique.
// Les helpers (rangs, qualifications, contexte de palanquée) sont dans
// ./pal-helpers.js.
//
// Chaque issue porte un `code` stable (partagé avec backend/lib/Rules.php et
// tests/fixtures/pal-rules.json), une référence `ref` au texte et les `ids`
// des membres concernés (mise en évidence dans l'interface).

/**
 * @typedef {{ tone: 'err'|'warn'|'ok', code: string, text: string, ref: string|null, ids: string[] }} Issue
 */

import { getDiverAptitudes, aptitudeMaxDepth, getPalType } from './aptitudes.js';
import {
  ENS_LEVELS,
  tables,
  getMaxEnsLevel,
  peLevel,
  paLevel,
  airLevel,
  isEncadrantRole,
  ensRank,
  personRank,
  memberName,
  memberId,
  isDebutant,
  hasGasQual,
  isGpQualified,
  ageAt,
  spaceFor,
  resolveMembres,
  buildContext,
} from './pal-helpers.js';

// API publique historique de ce module (helpers déplacés dans ./pal-helpers.js).
export {
  ENS_LEVELS,
  getMaxEnsLevel,
  peLevel,
  paLevel,
  diverFullName,
  hasGasQual,
  derivePalMode,
  isBassinDerogation,
  palGas,
  withDecoO2,
} from './pal-helpers.js';

// ── Règles transverses ──────────────────────────────────────────────────

function checkAptitudesJustified(ctx, add) {
  const palContext = { maxEnsLevel: getMaxEnsLevel(ctx.membres), mode: ctx.bonusMode };
  for (const m of ctx.membres) {
    if (m._bapteme) continue;
    const allowed = getDiverAptitudes(m.diver, false, palContext);
    if (!allowed.includes(m.aptitude)) {
      add(
        'err',
        'APT_NOT_JUSTIFIED',
        `${memberName(m)} : aptitude ${m.aptitude} non justifiée par ses brevets pour cette palanquée.`,
        'A322-77',
        [memberId(m)],
      );
    }
  }
}

function checkMedical(ctx, add) {
  for (const m of ctx.membres) {
    if (m._bapteme) continue;
    if (!m.diver.medical) {
      add('warn', 'MEDICAL_MISSING', `${memberName(m)} : date du certificat médical non renseignée.`, null, [
        memberId(m),
      ]);
      continue;
    }
    const expiry = new Date(m.diver.medical);
    expiry.setFullYear(expiry.getFullYear() + 1);
    if (expiry < ctx.date) {
      add(
        'err',
        'MEDICAL_EXPIRED',
        `Certificat médical de ${memberName(m)} expiré (émis le ${m.diver.medical}, valable jusqu'au ${expiry.toLocaleDateString('fr-FR')}).`,
        null,
        [memberId(m)],
      );
    }
  }
}

function checkDepthByAptitude(ctx, add) {
  for (const m of ctx.encadres) {
    const limit = aptitudeMaxDepth(m.aptitude);
    if (ctx.profMax > limit) {
      add(
        'err',
        'APT_DEPTH',
        `${m.aptitude} de ${memberName(m)} limité à ${limit} m (palanquée à ${ctx.profMax} m).`,
        'A322-73',
        [memberId(m)],
      );
    }
  }
}

function checkAirLimit(ctx, add) {
  if (ctx.gas.trimix && !ctx.gas.air) return;
  if (ctx.profMax > tables().LIMITS.AIR_MAX) {
    add('err', 'AIR_60', `Plongée à l'air ou au nitrox limitée à 60 m (palanquée à ${ctx.profMax} m).`, 'A322-76');
  }
}

/**
 * Effectif encadré hors plongeur supplémentaire : un GP / P4 inscrit avec
 * une aptitude PE (+ PN-C au nitrox) peut tenir le rôle du (*) s'il n'y a pas
 * déjà d'extra.
 */
function effectifEncadres(ctx, row) {
  const n = ctx.encadres.length;
  // Au nitrox, le (*) doit aussi justifier PN-C (III-17 b/c).
  const canBeExtra = (m) => isGpQualified(m) && (!ctx.gas.nitrox || hasGasQual(m.diver, 'PN-C'));
  if (row.extra && ctx.extras.length === 0 && n > row.max && ctx.encadres.some(canBeExtra)) return n - 1;
  return n;
}

function checkExtras(ctx, row, ref, add) {
  if (ctx.extras.length === 0) return;
  const ids = ctx.extras.map(memberId);
  if (!row || !row.extra) {
    add('err', 'EXTRA_NOT_ALLOWED', "Pas de plongeur supplémentaire dans cet espace d'évolution.", ref, ids);
    return;
  }
  if (ctx.extras.length > 1) {
    add(
      'err',
      'EXTRA_TOO_MANY',
      "Un seul plongeur supplémentaire (GP ou P4) est admis en plus de l'encadrant.",
      ref,
      ids,
    );
  }
  for (const m of ctx.extras.filter((x) => !isGpQualified(x))) {
    add('err', 'EXTRA_NOT_GP', `${memberName(m)} : le plongeur supplémentaire doit être au minimum GP ou P4.`, ref, [
      memberId(m),
    ]);
  }
  if (ctx.gas.nitrox) {
    for (const m of ctx.extras.filter((x) => !hasGasQual(x.diver, 'PN-C'))) {
      add('err', 'EXTRA_NX', `${memberName(m)} : plongeur supplémentaire au nitrox → PN-C requis.`, 'III-17 b/c', [
        memberId(m),
      ]);
    }
  }
}

// ── Air & nitrox en milieu naturel ──────────────────────────────────────

function checkEnseignement(ctx, add) {
  const table = ctx.gas.nitrox ? tables().NITROX_ENSEIGNEMENT : tables().AIR_ENSEIGNEMENT;
  const ref = ctx.gas.nitrox ? 'III-17 b' : 'III-16 a';
  const space = spaceFor(ctx.profMax, table);
  if (space === null) return;
  const row = table[space];
  const enc = ctx.encadrant;
  if (!enc) {
    add('err', 'ENS_NO_ENSEIGNANT', 'Enseignement : un enseignant (E1 → E4) doit encadrer la palanquée.', ref);
  } else if (personRank(enc) < ensRank(row.minE)) {
    add(
      'err',
      'ENS_LEVEL',
      `Enseignement${ctx.gas.nitrox ? ' au nitrox' : ''} dans l'espace 0-${space} m : encadrant ${row.minE} minimum (actuellement ${enc.aptitude}).`,
      ref,
      [memberId(enc)],
    );
  }
  const baptises = ctx.encadres.filter((m) => m.aptitude === 'Baptême');
  if (baptises.length > 0) {
    // La profondeur (0-6 m) est contrôlée par APT_DEPTH (aptitude « Baptême »).
    if (ctx.encadres.length > (row.maxBapteme || 1)) {
      add(
        'err',
        'EFFECTIF_BAPTEME',
        `Baptême : 1 baptisé par encadrant (${ctx.encadres.length} plongeurs encadrés).`,
        ref,
        ctx.encadres.map(memberId),
      );
    }
  } else if (effectifEncadres(ctx, row) > row.max) {
    add(
      'err',
      'EFFECTIF_ENCADRES',
      `Enseignement : ${row.max} plongeurs maximum par encadrant (${ctx.encadres.length} actuellement).`,
      ref,
      ctx.encadres.map(memberId),
    );
  }
  if (ctx.gas.nitrox) checkNitroxEleves(ctx, space, ref, add);
  checkExtras(ctx, row, ref, add);
}

// III-17 b : seuls baptêmes et débutants de 0-6 m ne justifient pas d'aptitude PE.
function checkNitroxEleves(ctx, space, ref, add) {
  const debutants = ctx.encadres.filter(isDebutant);
  if (debutants.length > 0 && space > 6) {
    add(
      'err',
      'NX_DEBUTANT',
      "Nitrox en enseignement : débutants dans l'espace de 0 à 6 m uniquement.",
      ref,
      debutants.map(memberId),
    );
  }
}

function checkExplorationEncadree(ctx, add) {
  const table = ctx.gas.nitrox ? tables().NITROX_EXPLORATION : tables().AIR_EXPLORATION;
  const ref = ctx.gas.nitrox ? 'III-17 c' : 'III-16 b';
  const space = spaceFor(ctx.profMax, table);
  if (space === null) return;
  const row = table[space];
  const enc = ctx.encadrant;
  // Compétence de la personne (III-16 b « E3 ou GP ou P4 »), pas seulement du rôle choisi.
  const competent = personRank(enc) >= ensRank(row.minE) || (row.gp && isGpQualified(enc));
  if (!competent) {
    const needed = row.gp ? `${row.minE}, GP ou P4` : row.minE;
    add(
      'err',
      'EXPLO_COMPETENCE',
      `Exploration encadrée dans l'espace 0-${space} m : encadrant ${needed} minimum (actuellement ${enc.aptitude}).`,
      ref,
      [memberId(enc)],
    );
  }
  const debutants = ctx.encadres.filter(isDebutant);
  if (debutants.length > 0 && (ctx.gas.nitrox || ctx.profMax > 6)) {
    add(
      'err',
      'DEBUTANT_EXPLO',
      "Débutants en exploration : espace de 0 à 6 m, à l'air uniquement.",
      ref,
      debutants.map(memberId),
    );
  }
  if (effectifEncadres(ctx, row) > row.max) {
    add(
      'err',
      'EFFECTIF_ENCADRES',
      `Exploration encadrée : ${row.max} plongeurs maximum par encadrant (${ctx.encadres.length} actuellement).`,
      ref,
      ctx.encadres.map(memberId),
    );
  }
  checkExtras(ctx, row, ref, add);
}

function checkAutonomie(ctx, add) {
  const ref = 'III-16 b';
  const encadresOnly = ctx.membres.filter((m) => m.aptitude === 'Baptême' || isDebutant(m));
  if (encadresOnly.length > 0) {
    add(
      'err',
      'AUTO_ENCADREMENT',
      'Baptême ou débutant : un encadrant est obligatoire.',
      ref,
      encadresOnly.map(memberId),
    );
  }
  const pe = ctx.membres.filter((m) => peLevel(m.aptitude) !== null && !isDebutant(m));
  if (pe.length > 0) {
    add(
      'err',
      'AUTO_PE',
      "Plongeurs encadrés (PE) sans encadrant : un GP ou un enseignant est obligatoire, sinon choisir l'aptitude PA.",
      ref,
      pe.map(memberId),
    );
  }
  if (ctx.membres.length > tables().AUTONOMIE_MAX) {
    add('err', 'AUTO_EFFECTIF', `Palanquée autonome : 3 plongeurs maximum (${ctx.membres.length} actuellement).`, ref);
  }
  checkAutonomieAges(ctx, add);
}

function checkAutonomieAges(ctx, add) {
  const minAges = tables().AUTONOMIE_AGE_MIN;
  for (const m of ctx.membres) {
    const level = paLevel(m.aptitude) ?? (m.aptitude.startsWith('PTH') ? 60 : null);
    if (level === null || m._bapteme) continue;
    const minAge = ctx.gas.trimix ? 18 : minAges[level];
    const ref = level === 60 || ctx.gas.trimix ? 'A322-73 / A322-89' : 'A322-73';
    const age = ageAt(m.diver.date_naissance, ctx.date);
    if (age === null) {
      add(
        'warn',
        'AGE_UNKNOWN',
        `${memberName(m)} : date de naissance non renseignée — autonomie ${m.aptitude} à partir de ${minAge} ans.`,
        ref,
        [memberId(m)],
      );
    } else if (age < minAge) {
      add(
        'err',
        'AGE_AUTONOMIE',
        `${memberName(m)} (${age} ans) : autonomie ${m.aptitude}${ctx.gas.trimix ? ' au trimix' : ''} à partir de ${minAge} ans.`,
        ref,
        [memberId(m)],
      );
    }
  }
}

function checkNitroxQuals(ctx, add) {
  if (!ctx.gas.nitrox) return;
  const ensRow = tables().NITROX_ENSEIGNEMENT[spaceFor(ctx.profMax, tables().NITROX_ENSEIGNEMENT)];
  const needPN = ctx.mode !== 'enseignement' || !!ensRow?.elevePN;
  for (const m of ctx.encadres) {
    if (m._bapteme) continue;
    const hasPN = hasGasQual(m.diver, 'PN');
    if (needPN && !hasPN) {
      add('err', 'NX_PN', `${memberName(m)} : plongée au nitrox → aptitude PN requise.`, 'A322-95', [memberId(m)]);
    } else if (ctx.gas.nx40plus && !hasGasQual(m.diver, 'PN-C')) {
      // PN couvre ≤ 40 % d'O₂ (III-17 a) ; seul un élève PN en formation PN-C est toléré.
      const enFormation = ctx.mode === 'enseignement' && hasPN;
      add(
        enFormation ? 'warn' : 'err',
        'NX_PNC',
        `${memberName(m)} : nitrox > 40 % d'O₂ → aptitude PN-C.`,
        'III-17 a',
        [memberId(m)],
      );
    }
  }
  if (ctx.encadrant && !hasGasQual(ctx.encadrant.diver, 'PN-C')) {
    add('err', 'NX_ENCADRANT', `${memberName(ctx.encadrant)} : encadrant au nitrox → PN-C requis.`, 'A322-74', [
      memberId(ctx.encadrant),
    ]);
  }
  // Seul le gaz fond est soumis à la MOD : pas le nitrox de décompression
  // (Nx > 40 % avec un autre gaz, ou nitrox au trimix).
  if (ctx.gas.bottomNitrox) checkPpO2(ctx, add);
}

/** A322-92 : PpO₂ ≤ 1,6 bar ⇒ profondeur maximale d'utilisation du gaz fond. */
function checkPpO2(ctx, add) {
  const o2 = Number(ctx.pal.o2);
  if (o2 >= 100) {
    add(
      'err',
      'O2_PUR_FOND',
      'Oxygène pur : utilisable en recycleur ou en décompression, pas comme gaz fond en circuit ouvert.',
      'A322-90',
    );
    return;
  }
  // Un O₂ > 40 % avec un Nx ≤ 40 % au fond est celui du gaz de déco.
  if (!(o2 > 21 && o2 <= ctx.gas.bottomO2Max)) {
    add(
      'warn',
      'O2_UNKNOWN',
      "Nitrox : renseigner le % d'O₂ du gaz fond pour contrôler la profondeur maximale d'utilisation.",
      'A322-92',
    );
    return;
  }
  const mod = Math.floor((tables().LIMITS.PPO2_MAX / (o2 / 100) - 1) * 10 + 1e-9);
  if (ctx.profMax > mod) {
    add(
      'err',
      'PPO2_MAX',
      `Nitrox ${o2} % : profondeur maximale d'utilisation ${mod} m (PpO₂ 1,6 bar) — palanquée à ${ctx.profMax} m.`,
      'A322-92',
    );
  }
}

// ── Trimix / héliox ─────────────────────────────────────────────────────

function checkTrimix(ctx, add) {
  const publicInterdit = ctx.membres.filter((m) => m.aptitude === 'Baptême' || isDebutant(m));
  if (publicInterdit.length > 0) {
    add('err', 'TX_PUBLIC', 'Trimix : interdit aux baptêmes et débutants.', 'III-18 a', publicInterdit.map(memberId));
  }
  if (ctx.mode === 'enseignement') return checkTrimixEnseignement(ctx, add);
  if (ctx.encadrant) return checkTrimixEncadre(ctx, add);
  return checkTrimixAutonome(ctx, add);
}

function checkTrimixEncadrant(ctx, row, space, ref, add) {
  const enc = ctx.encadrant;
  if (!enc) {
    add('err', 'ENS_NO_ENSEIGNANT', 'Enseignement : un enseignant (E3 ou E4) doit encadrer la palanquée.', ref);
    return;
  }
  if (personRank(enc) < ensRank('E3')) {
    add('err', 'TX_GP', 'Trimix : un guide de palanquée ne peut pas encadrer (E3 ou E4 requis).', ref, [memberId(enc)]);
  } else if (personRank(enc) < ensRank(row.minE)) {
    add('err', 'TX_ENCADRANT', `Trimix dans l'espace 0-${space} m : encadrant ${row.minE} minimum.`, ref, [
      memberId(enc),
    ]);
  }
  if (!hasGasQual(enc.diver, row.encadrantQual)) {
    add('err', 'TX_ENCADRANT_QUAL', `${memberName(enc)} : encadrant ${row.encadrantQual} requis.`, ref, [
      memberId(enc),
    ]);
  }
  if (ctx.extras.length > 0) {
    add('err', 'EXTRA_NOT_ALLOWED', 'Trimix : pas de plongeur supplémentaire.', ref, ctx.extras.map(memberId));
  }
}

function checkTrimixMembers(ctx, airMin, qual, ref, add) {
  for (const m of ctx.encadres) {
    if (m._bapteme || isDebutant(m)) continue;
    if (airLevel(m.aptitude) < airMin) {
      add('err', 'TX_AIR', `${memberName(m)} : aptitude ${ctx.encadrant ? 'PE' : 'PA'}-${airMin} requise.`, ref, [
        memberId(m),
      ]);
    }
    if (!hasGasQual(m.diver, qual)) {
      add('err', 'TX_QUAL', `${memberName(m)} : ${qual} requis.`, ref, [memberId(m)]);
    }
  }
}

function checkTrimixEnseignement(ctx, add) {
  const ref = 'III-18 b';
  const space = spaceFor(ctx.profMax, tables().TRIMIX_ENSEIGNEMENT);
  if (space === null) {
    add('err', 'TX_DEPTH', 'Encadrement au trimix limité à 80 m.', 'A322-76');
    return;
  }
  const row = tables().TRIMIX_ENSEIGNEMENT[space];
  checkTrimixEncadrant(ctx, row, space, ref, add);
  checkTrimixMembers(ctx, row.eleveAir, row.eleveQual, ref, add);
  if (ctx.encadres.length > row.max) {
    add(
      'err',
      'EFFECTIF_ENCADRES',
      `Trimix : ${row.max} plongeurs maximum par encadrant.`,
      ref,
      ctx.encadres.map(memberId),
    );
  }
}

function checkTrimixEncadre(ctx, add) {
  const ref = 'III-18 c';
  const space = spaceFor(ctx.profMax, tables().TRIMIX_EXPLORATION);
  if (space === null) {
    add('err', 'TX_DEPTH', 'Encadrement au trimix limité à 80 m.', 'A322-76');
    return;
  }
  const row = tables().TRIMIX_EXPLORATION[space];
  checkTrimixEncadrant(ctx, row, space, ref, add);
  checkTrimixMembers(ctx, row.air, row.qual, ref, add);
  if (ctx.encadres.length > row.max) {
    add(
      'err',
      'EFFECTIF_ENCADRES',
      `Trimix : ${row.max} plongeurs maximum par encadrant.`,
      ref,
      ctx.encadres.map(memberId),
    );
  }
}

function checkTrimixAutonome(ctx, add) {
  const ref = 'III-18 c';
  const space = spaceFor(ctx.profMax, tables().TRIMIX_AUTONOMIE);
  if (space === null) {
    add('err', 'TX_DEPTH', 'Plongée autonome au trimix limitée à 120 m.', 'A322-76');
    return;
  }
  const row = tables().TRIMIX_AUTONOMIE[space];
  const pe = ctx.membres.filter((m) => peLevel(m.aptitude) !== null);
  if (pe.length > 0) {
    add(
      'err',
      'AUTO_PE',
      "Plongeurs encadrés (PE) sans encadrant : choisir l'aptitude PA ou ajouter un encadrant.",
      ref,
      pe.map(memberId),
    );
  }
  checkTrimixMembers(ctx, row.air, row.qual, ref, add);
  if (ctx.membres.length > tables().AUTONOMIE_MAX) {
    add('err', 'AUTO_EFFECTIF', `Palanquée autonome : 3 plongeurs maximum (${ctx.membres.length} actuellement).`, ref);
  }
  checkAutonomieAges(ctx, add);
}

// ── Piscine / fosse ≤ 6 m (A322-98) ─────────────────────────────────────

function checkBassin(ctx, add) {
  const ref = 'A322-98';
  const baptises = ctx.membres.filter((m) => m.aptitude === 'Baptême');
  const debutants = ctx.membres.filter(isDebutant);
  const canBaptize = ctx.membres.some(
    (m) => isEncadrantRole(m.aptitude) && (ENS_LEVELS.includes(m.aptitude) || isGpQualified(m)),
  );
  if (baptises.length > 0 && !canBaptize) {
    add(
      'err',
      'BASSIN_BAPTEME',
      "Baptême en piscine / fosse : un enseignant, un GP ou un P4 doit l'effectuer.",
      ref,
      baptises.map(memberId),
    );
  }
  if (debutants.length > 0 && !ctx.encadrant) {
    add(
      'err',
      'BASSIN_DEBUTANT',
      'Débutants : un encadrant est requis (seuls les PE-12 peuvent être autonomes).',
      ref,
      debutants.map(memberId),
    );
  } else if (debutants.length > 0 && ctx.mode === 'enseignement' && !ctx.membres.some((m) => personRank(m) > 0)) {
    add(
      'err',
      'BASSIN_DEBUTANT',
      'Débutants en formation : un enseignant (E1 → E4) est requis.',
      ref,
      debutants.map(memberId),
    );
  }
  if (ctx.encadrant && ctx.encadres.length > 4) {
    add(
      'warn',
      'BASSIN_EFFECTIF',
      `${ctx.encadres.length} plongeurs pour un encadrant : au-delà de 4, vérifier que la surveillance reste assurée.`,
      ref,
    );
  }
}

// ── Directeur de plongée (III-15 a, A322-72, A322-98) ────────────────────

function checkDp(ctx, add) {
  const level = ctx.dp?.niveau_encadrant || ctx.answers.dp_qual || '';
  const q = tables().DP_QUALIF[level];
  if (!level) {
    add('warn', 'DP_MISSING', 'Directeur de plongée non désigné.', 'A322-72');
    return;
  }
  if (!q) {
    add(
      'err',
      'DP_NOT_QUALIFIED',
      `Le directeur de plongée (${level}) n'a pas de qualification de l'annexe III-15 a.`,
      'A322-72',
    );
    return;
  }
  if (ctx.dp?.dp_diplome_pro_requis) {
    add(
      'err',
      'DP_DIPLOME_PRO',
      `Structure commerciale (SCA) : le DP doit être titulaire d'un diplôme d'État (DP actuel ${level}, sans diplôme pro).`,
      'L212-1',
    );
  }
  if (ctx.bassin && !q.bassin) {
    add('err', 'DP_QUAL_MILIEU', `Piscine / fosse ≤ 6 m : DP enseignant E1 minimum (DP actuel ${level}).`, 'A322-98');
  } else if (!ctx.bassin && !q.naturel) {
    add(
      'err',
      'DP_QUAL_MILIEU',
      `Milieu naturel (ou fosse > 6 m) : DP P5/DPE, E3 (MF1) ou E4 (MF2) — DP actuel ${level}.`,
      'III-15 a',
    );
  }
  if (ctx.mode === 'enseignement' && !q.enseignement) {
    add('err', 'DP_MODE', `Un DP ${level} ne dirige que des plongées d'exploration.`, 'III-15 a');
  }
  if (ctx.gas.nitrox && !hasGasQual(ctx.dp, 'PN-C')) {
    add('err', 'DP_GAS', 'Plongée au nitrox : le DP doit justifier PN-C.', 'A322-72');
  }
  if (ctx.gas.trimix) {
    checkDpTrimix(ctx, q, level, add);
  } else if (ctx.mode === 'enseignement' && q.airEnseignement && ctx.profMax > q.airEnseignement) {
    add(
      'err',
      'DP_DEPTH',
      `DP ${level} : enseignement limité à ${q.airEnseignement} m (palanquée à ${ctx.profMax} m).`,
      'III-15 a',
    );
  }
}

function checkDpTrimix(ctx, q, level, add) {
  if (!q.trimix) {
    add('err', 'DP_GAS', `Plongée au trimix : DP E3 (MF1) ou E4 (MF2) requis — DP actuel ${level}.`, 'III-15 a');
  } else {
    const max = q.trimix[ctx.mode === 'enseignement' ? 'enseignement' : 'exploration'];
    if (ctx.profMax > max) {
      add(
        'err',
        'DP_DEPTH',
        `DP ${level} : trimix en ${ctx.mode} limité à ${max} m (palanquée à ${ctx.profMax} m).`,
        'III-15 a',
      );
    }
  }
  if (!hasGasQual(ctx.dp, 'PTH-120')) {
    add('err', 'DP_GAS', 'Plongée au trimix : le DP doit justifier PTH-120.', 'A322-72');
  }
}

// ── Point d'entrée ──────────────────────────────────────────────────────

function checkComposition(ctx, add) {
  if (ctx.bassin) {
    checkBassin(ctx, add);
    return;
  }
  if (ctx.gas.trimix) {
    checkTrimix(ctx, add);
    return;
  }
  checkDepthByAptitude(ctx, add);
  if (ctx.mode === 'enseignement') checkEnseignement(ctx, add);
  else if (ctx.encadrant) checkExplorationEncadree(ctx, add);
  else checkAutonomie(ctx, add);
}

function checkLegacyTrimixRoles(ctx, add) {
  if (ctx.gas.trimix) return;
  const pth = ctx.membres.filter((m) => m.aptitude === 'PTH70' || m.aptitude === 'PTH120');
  if (pth.length > 0) {
    add(
      'err',
      'TX_ROLE_NO_GAS',
      'Aptitude PTH choisie sans mélange trimix déclaré pour la palanquée.',
      'A322-96',
      pth.map(memberId),
    );
  }
}

const PAL_TYPE_LABELS = {
  bapteme: 'baptême',
  formation: 'enseignement',
  guidee: 'exploration encadrée',
  exploration: 'exploration en autonomie',
};

/**
 * Validation complète d'une palanquée.
 *
 * @param {object} pal         { membres, profMax, melanges, mode?, o2? }
 * @param {object} diversById  { diverId -> plongeur }
 * @param {object} answers     { milieu, date, dp_qual, site_prof_max, ... }
 * @param {object|null} dp     plongeur DP { niveau_encadrant, nitrox, trimix }
 * @returns {Issue[]}
 */
export function validatePal(pal, diversById, answers, dp) {
  /** @type {Issue[]} */
  const issues = [];
  const add = (tone, code, text, ref = null, ids = []) => issues.push({ tone, code, text, ref, ids });

  const membres = resolveMembres(pal, diversById);
  if (membres.length === 0) {
    add('warn', 'PAL_EMPTY', 'Palanquée vide.');
    return issues;
  }
  if (membres.length === 1) {
    add('err', 'PAL_SOLO', 'Une palanquée compte au moins deux plongeurs.', 'A322-73');
  }
  const sans = membres.filter((m) => !m.aptitude);
  if (sans.length > 0) {
    add(
      'err',
      'APT_MISSING',
      `${sans.length} membre(s) sans aptitude sélectionnée — veuillez compléter avant de continuer.`,
      null,
      sans.map(memberId),
    );
    return issues;
  }
  if (!(Number(pal.profMax) > 0)) {
    add(
      'err',
      'PROF_MISSING',
      "Profondeur maximale prévue non renseignée : l'espace d'évolution ne peut pas être contrôlé.",
      'A322-72',
    );
    return issues;
  }
  if ((pal.melanges || []).length === 0) {
    add('warn', 'GAS_NONE', "Aucun mélange respiratoire sélectionné : la palanquée est considérée à l'air.");
  }

  const ctx = buildContext(pal, membres, answers, dp);
  if (ctx.pal.mode === 'exploration' && ctx.mode === 'enseignement') {
    add(
      'warn',
      'MODE_BAPTEME',
      "Un baptême relève de l'enseignement : la palanquée est traitée en enseignement.",
      'III-16 a',
    );
  } else if (
    !ctx.pal.mode &&
    ctx.encadrant &&
    ENS_LEVELS.includes(ctx.encadrant.aptitude) &&
    !ctx.membres.some((m) => m.aptitude === 'Baptême')
  ) {
    add(
      'warn',
      'MODE_IMPLICIT',
      "Préciser s'il s'agit d'enseignement ou d'exploration (traitée en enseignement par défaut).",
      'A322-75',
    );
  }
  checkAptitudesJustified(ctx, add);
  checkMedical(ctx, add);
  checkAirLimit(ctx, add);
  checkLegacyTrimixRoles(ctx, add);
  checkComposition(ctx, add);
  checkNitroxQuals(ctx, add);
  checkDp(ctx, add);

  if (!issues.some((i) => i.tone === 'err')) {
    add('ok', 'OK', `Composition conforme — ${PAL_TYPE_LABELS[getPalType(pal.membres, ctx.mode)]}.`);
  }
  return issues;
}
