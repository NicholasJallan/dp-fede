// DP Assistant — Fiche plongeur ↔ formulaire ↔ corps d'API (logique pure,
// partagée par le formulaire unique src/components/diver-form.jsx).

// Champs club (docs/api-club.md, « Plongeurs : nouveaux champs ») : une clé
// absente du corps PUT ne modifie pas la valeur stockée, une chaîne vide
// l'efface. On n'envoie donc une valeur vide que si la fiche lue la portait.
import { diplomeProLevel } from '../domain/encadrement.js';

export const CLUB_FIELDS = ['licence_fin', 'representant_legal', 'autorisation_parentale_saison'];
// Provenance : écrite par l'import uniquement, affichée en lecture seule.
const READ_ONLY_FIELDS = ['source', 'external_id'];

export const emptyDiver = () => ({
  nom: '',
  prenom: '',
  licence: '',
  date_naissance: '',
  niveau_plongeur: '',
  niveau_encadrant: '',
  nitrox: [],
  trimix: [],
  recycleurs: [],
  diplome_pro: '',
  rifap: false,
  tiv: false,
  aptitudes_sup: [],
  medical: '',
  notes: '',
  licence_fin: '',
  representant_legal: '',
  autorisation_parentale_saison: '',
});

export function diverToForm(d) {
  return {
    ...emptyDiver(),
    nom: d.nom || '',
    prenom: d.prenom || '',
    licence: d.licence || '',
    niveau_plongeur: d.niveau_plongeur || '',
    // Vue « cadre de la plongée » (diverForCadre) : on réécrit le niveau saisi.
    niveau_encadrant:
      (d.niveau_encadrant_annuaire !== undefined ? d.niveau_encadrant_annuaire : d.niveau_encadrant) || '',
    nitrox: d.nitrox || [],
    trimix: d.trimix || [],
    recycleurs: d.recycleurs || [],
    diplome_pro: d.diplome_pro || '',
    rifap: !!d.rifap,
    tiv: !!d.tiv,
    aptitudes_sup: d.aptitudes_sup || [],
    medical: d.medical || '',
    notes: d.notes || '',
    date_naissance: d.date_naissance || '',
    licence_fin: d.licence_fin || '',
    representant_legal: d.representant_legal || '',
    autorisation_parentale_saison: d.autorisation_parentale_saison || '',
    source: d.source || '',
    external_id: d.external_id || '',
    // Champs club absents de la fiche lue (cache local antérieur) : à ne pas effacer.
    _absent: CLUB_FIELDS.filter((k) => !(k in d)),
  };
}

export function formToPayload(form) {
  const { _absent: absent = [], ...rest } = form;
  const payload = Object.fromEntries(
    Object.entries(rest).filter(([k, v]) => !READ_ONLY_FIELDS.includes(k) && !(absent.includes(k) && v === '')),
  );
  return {
    ...payload,
    diplome_pro: form.diplome_pro || null,
    niveau_plongeur: form.niveau_plongeur || null,
    niveau_encadrant: form.niveau_encadrant || null,
  };
}

const SOURCE_LABELS = { vpdive: 'VPDive', csv: 'Import CSV', manuel: 'Saisie manuelle' };

/** Libellé de la provenance d'une fiche (champ `source`). */
export const sourceLabel = (source) => SOURCE_LABELS[source] || source || 'Saisie manuelle';

// Aide sous le diplôme pro : niveau retenu selon le cadre de la plongée.
export function diplomeProHint(form) {
  const pro = diplomeProLevel(form.diplome_pro);
  if (!pro) return undefined;
  const club = form.niveau_encadrant || pro;
  const cc =
    form.diplome_pro === 'DEJEPS' && form.niveau_encadrant === 'E4'
      ? " Titulaire du MF2 : le certificat complémentaire (DEJEPS E4) s'obtient à la demande, par équivalence."
      : '';
  return `En club associatif : ${club}. En structure commerciale (SCA) : ${pro}.${cc}`;
}
