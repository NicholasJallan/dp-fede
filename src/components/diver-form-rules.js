// @ts-check
// DP Assistant — Règles de saisie de la fiche plongeur (sans React) :
// niveau implicite d'un encadrant, cascades nitrox / trimix (III-17 a,
// III-18 a), diplôme professionnel, contrôle avant enregistrement.

import { CDS, DEFAULT_JURISDICTION, diplomeProLevel, PF_CODES } from '../domain/index.js';
import { isSeason } from '../club/season.js';

export const NIVEAUX_PLONGEUR = ['N1', 'N2', 'N3'];
export const NIVEAUX_ENCADRANT = ['N4', 'N5', 'E1', 'E2', 'E3', 'E4'];
export const RECYCLEURS = ['Revo', 'AP', 'Triton', 'JJccr', 'Xccr', 'Megalodon', 'Shark', 'Submatix', 'Autre'];
export const TRIMIX_QUALS = ['PTH-40', 'PTH-70', 'PTH-120'];

// Niveau plongeur implicite d'un encadrant : N3, sauf l'initiateur (E1) qui
// peut être N2 (son niveau plongeur reste alors modifiable).
export function plongeurForEncadrant(ne, np) {
  if (ne === 'E1') return np === 'N3' ? 'N3' : 'N2';
  return ne ? 'N3' : np;
}

// Qualifications trimix (annexe III-18 a) : PTH-120 ⊃ PTH-70 ⊃ PTH-40,
// fondées sur PN-C ; PTH-40 exige PE-40/PA-40 (N2+), PTH-70/120 PE-60/PA-60 (N3+).
export function toggleTrimixQual(list, val) {
  const idx = TRIMIX_QUALS.indexOf(val);
  if (list.includes(val)) return list.filter((q) => TRIMIX_QUALS.indexOf(q) < idx);
  return TRIMIX_QUALS.slice(0, idx + 1);
}

// PN-C (III-17 a) : PE-40 ou PA-40 (N2 minimum).
export function nitroxPrereq(form, qual) {
  if (qual !== 'PN-C') return null;
  const lvl40 = !!form.niveau_encadrant || form.niveau_plongeur === 'N2' || form.niveau_plongeur === 'N3';
  return lvl40 ? null : 'PE-40 ou PA-40 requis (N2 minimum)';
}

export function trimixPrereq(form, qual) {
  if (!form.nitrox.includes('PN-C')) return 'PN-C requis';
  const lvl60 = form.niveau_plongeur === 'N3' || !!form.niveau_encadrant;
  const lvl40 = lvl60 || form.niveau_plongeur === 'N2';
  if (qual === 'PTH-40') return lvl40 ? null : 'PE-40 ou PA-40 requis (N2 minimum)';
  return lvl60 ? null : 'PE-60 ou PA-60 requis (N3 minimum)';
}

// Diplôme pro : le niveau encadrant (associatif) vaut au moins celui du
// diplôme (BPJEPS → E2, DEJEPS → E3, DEJEPS + CC / DESJEPS → E4) ; DEJEPS / DESJEPS → PN-C.
export function applyDiplomePro(f, val) {
  const pro = diplomeProLevel(val);
  const ne = pro && (CDS.ENS_RANK[pro] || 0) > (CDS.ENS_RANK[f.niveau_encadrant] || 0) ? pro : f.niveau_encadrant;
  const nx = new Set(f.nitrox);
  if (['DEJEPS', 'DEJEPS-E4', 'DESJEPS'].includes(val)) {
    nx.add('PN');
    nx.add('PN-C');
  }
  return {
    ...f,
    diplome_pro: val,
    niveau_encadrant: ne,
    niveau_plongeur: plongeurForEncadrant(ne, f.niveau_plongeur),
    rifap: ne ? true : f.rifap,
    nitrox: [...nx],
  };
}

export function applyNitrox(f, val) {
  let nx = [...f.nitrox];
  if (nx.includes(val)) {
    nx = nx.filter((x) => x !== val);
    if (val === 'PN') nx = nx.filter((x) => x !== 'PN-C');
  } else {
    nx.push(val);
    if (val === 'PN-C' && !nx.includes('PN')) nx.push('PN');
  }
  return { ...f, nitrox: nx };
}

// En Polynésie, le certificat médical n'est exigé que des encadrants et des
// pratiquants à antécédents (arrêté n° 199 CM, art. 12 et 13).
export function validateDiverForm(form, jurisdiction = DEFAULT_JURISDICTION) {
  if (!form.nom.trim()) return 'Le nom est obligatoire.';
  if (!form.medical && jurisdiction !== 'PF') return 'La date du certificat médical est obligatoire.';
  if (form.autorisation_parentale_saison && !isSeason(form.autorisation_parentale_saison)) {
    return "Saison de l'autorisation parentale invalide (format 2026-2027).";
  }
  if ((form.representant_legal || '').length > 200) return 'Représentant légal : 200 caractères maximum.';
  return '';
}

export const emptyPf = () => ({
  aptitudes: [],
  gaz: [],
  fonctions: [],
  diplome_homologue: null,
  stagiaire: false,
  patente: false,
  brevets: '',
  attestation: null,
});

/** Coche ou décoche un code PF (aptitudes, gaz ou fonctions), dans l'ordre de PF_CODES. */
export function togglePfCode(pf, key, code) {
  const base = pf ?? emptyPf();
  const current = base[key] || [];
  const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
  return { ...base, [key]: PF_CODES[key].filter((c) => next.includes(c)) };
}
