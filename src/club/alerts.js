// DP Assistant — Alertes du club (GET /api/club/alerts) : libellés,
// signalétique et regroupements pour l'accueil et l'annuaire.
//
// Signalétique : severity « error » (expiré, autorisation manquante) → ■
// rouge (bloquant pour la palanquée) ; « warn » (bientôt expiré, non
// renseigné) → ▲ ambre.

import { formatDate } from '../components/format.js';

export const ALERT_TYPES = Object.freeze({
  caci_expire:                      { label: 'CACI expiré',                     plural: 'CACI expirés' },
  caci_expire_bientot:              { label: 'CACI expirant bientôt',           plural: 'CACI expirant bientôt' },
  caci_absent:                      { label: 'CACI non renseigné',              plural: 'CACI non renseignés' },
  licence_expiree:                  { label: 'Licence expirée',                 plural: 'Licences expirées' },
  licence_expire_bientot:           { label: 'Licence expirant bientôt',        plural: 'Licences expirant bientôt' },
  autorisation_parentale_manquante: { label: 'Autorisation parentale manquante', plural: 'Autorisations parentales manquantes' },
});

// Ordre d'affichage des compteurs : bloquants d'abord.
const TYPE_ORDER = Object.keys(ALERT_TYPES);

/** Forme / couleur d'une alerte : 'err' (■) ou 'warn' (▲). */
export function alertTone(item) {
  return item?.severity === 'error' ? 'err' : 'warn';
}

export function alertLabel(type) {
  return ALERT_TYPES[type]?.label || type;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Échéance lisible : « expiré depuis 19 j (1 oct. 2026) », « dans 12 j (…) ». */
export function describeAlert(item) {
  if (item.type === 'autorisation_parentale_manquante') {
    const age = item.age != null ? `${item.age} ans, ` : '';
    return `${age}aucune autorisation pour la saison ${item.season || 'en cours'}`;
  }
  if (item.type === 'caci_absent') return 'date du certificat médical non renseignée';
  if (item.days == null) return item.date ? `échéance ${formatDate(item.date)}` : '';
  const when = formatDate(item.date);
  if (item.days < 0) return `échu depuis ${plural(-item.days, 'jour')} (${when})`;
  if (item.days === 0) return `échéance aujourd'hui (${when})`;
  return `échéance dans ${plural(item.days, 'jour')} (${when})`;
}

/**
 * Synthèse pour le bandeau d'accueil.
 * @param {{counts?: Record<string, number>, items?: Array<object>}|null} data
 * @returns {{total: number, errors: number, warnings: number, tone: 'err'|'warn'|null, byType: Array<{type: string, count: number, label: string}>, divers: number}}
 */
export function summarizeAlerts(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const counts = { ...(data?.counts || {}) };
  if (!data?.counts) items.forEach(it => { counts[it.type] = (counts[it.type] || 0) + 1; });
  const byType = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => indexOf(a) - indexOf(b))
    .map(([type, count]) => ({ type, count, label: count > 1 ? (ALERT_TYPES[type]?.plural || type) : alertLabel(type) }));
  const total = byType.reduce((n, t) => n + t.count, 0);
  const errors = items.filter(it => it.severity === 'error').length;
  const divers = new Set(items.map(it => it.diver_id)).size;
  return {
    total, errors, warnings: Math.max(0, total - errors), divers, byType,
    tone: total === 0 ? null : (errors > 0 ? 'err' : 'warn'),
  };
}

function indexOf(type) {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
}

/**
 * Regroupe les alertes par plongeur (ordre du serveur : erreurs puis
 * avertissements, par échéance) pour la liste de l'annuaire.
 */
export function groupAlertsByDiver(items = []) {
  const groups = new Map();
  for (const it of items) {
    const key = it.diver_id;
    if (!groups.has(key)) groups.set(key, { diver_id: key, nom: it.nom, prenom: it.prenom, items: [], tone: 'warn' });
    const g = groups.get(key);
    g.items.push(it);
    if (it.severity === 'error') g.tone = 'err';
  }
  return Array.from(groups.values());
}

/** Phrase courte du bandeau : « 2 CACI expirés, 1 licence expirant bientôt ». */
export function alertsSentence(summary) {
  return summary.byType.map(t => `${t.count} ${lowerFirst(t.label)}`).join(', ');
}

// « Licences expirées » → « licences expirées » ; les sigles (CACI) restent.
function lowerFirst(label) {
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}
