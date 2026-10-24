// @ts-check
// DP Assistant — Écritures dérivées du DP choisi (profil, palanquées).
//
// Un DP introuvable dans l'annuaire (pas encore chargé, supprimé, autre club)
// ne doit rien effacer : ni le nom / la qualification saisis, ni les mélanges
// des palanquées. Seul le retrait explicite du DP vide ses champs.

import { diverFullName } from '../components/format.js';

/**
 * Champs `dp_qual` / `dp_nom` à écrire pour le DP `dpId`, ou `null` s'il ne
 * faut rien écrire (DP choisi mais introuvable).
 * @param {string | null | undefined} dpId
 * @param {{ prenom?: string, nom?: string, niveau_encadrant?: string } | null | undefined} selectedDP
 * @returns {{ dp_qual: string, dp_nom: string } | null}
 */
export function dpAnswerFields(dpId, selectedDP) {
  if (!dpId) return { dp_qual: '', dp_nom: '' };
  if (!selectedDP) return null;
  return { dp_qual: selectedDP.niveau_encadrant || '', dp_nom: diverFullName(selectedDP) };
}

/**
 * Mélanges des palanquées bornés à ceux qu'autorise le DP (`allowed`), `Air`
 * si plus aucun ne reste. DP inconnu : palanquées intactes. Les objets non
 * modifiés (et le tableau, si rien ne change) gardent leur référence.
 * @template {{ melanges?: string[] }} P
 * @param {P[]} palanquees
 * @param {Set<string>} allowed
 * @param {unknown} dpKnown
 * @returns {P[]}
 */
export function clampPalMelanges(palanquees, allowed, dpKnown) {
  if (!dpKnown) return palanquees;
  let changed = false;
  const next = palanquees.map((p) => {
    const cur = p.melanges || [];
    const kept = cur.filter((m) => allowed.has(m));
    if (kept.length === cur.length) return p;
    changed = true;
    return { ...p, melanges: kept.length > 0 ? kept : ['Air'] };
  });
  return changed ? next : palanquees;
}
