// @ts-check
// DP Assistant — Polynésie française : nombre et durée quotidienne des
// plongées (arrêté n° 199 CM, art. 5). Avertissements seulement : les
// plongées d'un même plongeur peuvent avoir lieu dans un autre club ou sur un
// appareil hors ligne. Charge du jour côté serveur : backend/lib/DiveDayLoad.php
// (GET /api/dives/day-load), cas communs dans tests/fixtures/daily-quota.json.

const PLONGEES_MAX = 3; // air ou nitrox, espace au-delà de 9 m
const ESPACE_MIN = 9;
const TRIMIX_PROFOND = 70; // au-delà : une plongée trimix par jour
const TRIMIX_MAX = 2; // jusqu'à 70 m
const TRIMIX_CUMUL_MAX = 100; // profondeur équivalente cumulée
const DUREE_MAX = 360; // 6 h, décompression comprise

/** @typedef {{ diveId: string, diverId: string, profMax: number, duree: number, trimix: boolean }} LoadEntry */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseState(state) {
  if (typeof state !== 'string') return state && typeof state === 'object' ? state : {};
  try {
    return JSON.parse(state) || {};
  } catch {
    return {};
  }
}

/**
 * Charge d'une plongée : une entrée par plongeur (hors baptême) et par
 * palanquée, valeurs réalisées sinon prévues.
 * @param {any} dive { id, palanquees, render_state }
 * @returns {LoadEntry[]}
 */
export function diveLoadEntries(dive) {
  if (!dive || !Array.isArray(dive.palanquees)) return [];
  const realises = parseState(dive.render_state).realises || {};
  return dive.palanquees.flatMap((p) => {
    const real = realises[p.id] || {};
    const profMax = num(real.profMax ?? p.profMax);
    const duree = num(real.duree ?? p.duree);
    const trimix = (p.melanges || []).includes('Tx');
    return (p.membres || [])
      .filter((m) => m.diverId && !m._bapteme && m.aptitude !== 'Baptême')
      .map((m) => ({ diveId: String(dive.id), diverId: String(m.diverId), profMax, duree, trimix }));
  });
}

/** Plongées d'un plongeur : une par diveId (profondeur max, durées additionnées). */
function plongeesParPlongeur(entries) {
  const byDiver = new Map();
  for (const e of entries) {
    const dives = byDiver.get(e.diverId) || new Map();
    const prev = dives.get(e.diveId);
    dives.set(
      e.diveId,
      prev
        ? { profMax: Math.max(prev.profMax, e.profMax), duree: prev.duree + e.duree, trimix: prev.trimix || e.trimix }
        : { profMax: e.profMax, duree: e.duree, trimix: e.trimix },
    );
    byDiver.set(e.diverId, dives);
  }
  return byDiver;
}

/**
 * Avertissements de l'art. 5 pour les plongeurs de la plongée courante.
 * @param {any} currentDive
 * @param {LoadEntry[]} otherEntries entrées des autres plongées du même jour
 */
export function pfDailyQuotaIssues(currentDive, otherEntries) {
  const current = diveLoadEntries(currentDive);
  const currentId = String(currentDive?.id ?? '');
  const others = (otherEntries || []).filter((e) => String(e.diveId) !== currentId);
  const byDiver = plongeesParPlongeur([...current, ...others]);
  const issues = [];
  const add = (code, diverId, text) => issues.push({ tone: 'warn', code, text, ref: 'art. 5', ids: [diverId] });

  for (const diverId of new Set(current.map((e) => e.diverId))) {
    const dives = [...byDiver.get(diverId).values()];
    const air = dives.filter((d) => !d.trimix && d.profMax > ESPACE_MIN);
    if (air.length > PLONGEES_MAX) {
      add(
        'PF_QUOTA_PLONGEES',
        diverId,
        `${air.length} plongées au-delà de 9 m dans la journée (3 au plus à l'air ou au nitrox).`,
      );
    }
    const trimix = dives.filter((d) => d.trimix);
    const profond = trimix.some((d) => d.profMax > TRIMIX_PROFOND);
    const cumul = trimix.reduce((s, d) => s + d.profMax, 0);
    if (profond ? trimix.length > 1 : trimix.length > TRIMIX_MAX || cumul > TRIMIX_CUMUL_MAX) {
      add(
        'PF_QUOTA_TRIMIX',
        diverId,
        profond
          ? 'Trimix au-delà de 70 m : une seule plongée par jour.'
          : `Trimix jusqu'à 70 m : 2 plongées par jour cumulant 100 m au plus (${trimix.length} plongées, ${cumul} m).`,
      );
    }
    const duree = dives.reduce((s, d) => s + d.duree, 0);
    if (duree > DUREE_MAX) {
      add('PF_QUOTA_DUREE', diverId, `${duree} min d'immersion dans la journée (6 h au plus).`);
    }
  }
  return issues;
}
