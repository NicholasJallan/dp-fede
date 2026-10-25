// DP Assistant — Profil de la plongée : choix du DP et du site.

import React, { useState, useMemo } from 'react';
import { Pill, diverFullName } from '../../components/components.jsx';
import { Icon } from '../../components/icons.jsx';
import { DiverQuickAdd } from '../../components/diver-quick-add.jsx';
import { SiteFormModal } from '../sites/site-form-modal.jsx';
import { CDS, diplomeProLabel, getMilieuType, pfProfile } from '../../domain/index.js';

/** Fonction DP la plus élevée (sinon ENS) d'un plongeur, au sens de l'arrêté n° 199 CM. */
function pfDpLabel(d) {
  const fonctions = pfProfile(d).fonctions;
  return [...fonctions].reverse().find((f) => f.startsWith('DP-')) || fonctions.find((f) => f.startsWith('ENS-')) || '';
}
import { api } from '../../api/api.js';

// ── DPPicker ──────────────────────────────────────────────────────────────
// `rules` : règles de la juridiction de la plongée (rulesFor) — en Polynésie,
// un DP justifie une fonction DP-40 à DP-120, ou ENS en espace restreint.
function DPPicker({ id, value, divers, onChange, setDivers, rules }) {
  const [showAdd, setShowAdd] = useState(false);
  const pf = rules?.jurisdiction === 'PF';

  const candidates = useMemo(() => divers.filter((d) => rules.isDpCandidate(d)), [divers, rules]);

  const onCreated = (newDiver) => {
    setDivers((prev) => [...prev, newDiver].sort((a, b) => a.nom.localeCompare(b.nom)));
    if (rules.isDpCandidate(newDiver)) onChange(newDiver.id);
    setShowAdd(false);
  };

  return (
    <div>
      <div className="picker-row">
        <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choisir le directeur de plongée</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id} disabled={d.dp_diplome_pro_requis && d.id !== value}>
              {diverFullName(d)} ({pf ? pfDpLabel(d) : d.niveau_encadrant})
              {d.diplome_pro ? ` — ${diplomeProLabel(d.diplome_pro)}` : ''}
              {d.dp_diplome_pro_requis ? ' — diplôme pro requis (SCA)' : ''}
            </option>
          ))}
        </select>
        {setDivers && (
          <button
            type="button"
            className="btn icon"
            onClick={() => setShowAdd(true)}
            aria-label="Créer un plongeur"
            title="Créer un plongeur"
          >
            <Icon.Plus />
          </button>
        )}
      </div>
      {candidates.length === 0 && (
        <p className="field-hint warn">
          {pf
            ? "Aucun plongeur de l'annuaire n'a de fonction de directeur de plongée (DP-40 à DP-120) : complétez sa fiche, section Polynésie française."
            : "Aucun plongeur de l'annuaire ne peut être DP. Ajoutez un plongeur de niveau encadrant E1 à E4 ou N5."}
        </p>
      )}

      {showAdd && <DiverQuickAdd onCreated={onCreated} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ── SitePicker + quick-add ────────────────────────────────────────────────
function SitePicker({ id, value, sites, setSites, onChange, answers }) {
  const [showAdd, setShowAdd] = useState(false);

  // Filtrage selon qualité DP : E1 / E2 → piscine ou fosse ≤ 6 m (A322-98)
  const dpQual = answers?.dp_qual || null;
  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const milieu = getMilieuType(s.milieu);
      const profMax = s.profondeur_max || 999;
      if (dpQual === 'E1' || dpQual === 'E2')
        return (milieu === 'piscine' || milieu === 'fosse') && profMax <= CDS.LIMITS.BASSIN_DEROGATION_MAX;
      return true; // E3, E4, N5 : tous milieux
    });
  }, [sites, dpQual]);

  const selected = sites.find((s) => s.id === value);

  return (
    <div>
      <div className="picker-row">
        <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choisir un site</option>
          {filteredSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
              {s.ville ? `, ${s.ville}` : ''}
              {s.pays_code ? ` (${s.pays_code})` : ''}, {s.milieu}
              {s.profondeur_max ? `, ${s.profondeur_max} m` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn icon"
          onClick={() => setShowAdd(true)}
          aria-label="Créer un site"
          title="Créer un site"
        >
          <Icon.Plus />
        </button>
      </div>
      {(dpQual === 'E1' || dpQual === 'E2') && filteredSites.length < sites.length && (
        <p className="field-hint warn">
          Un {dpQual} ne dirige qu'en piscine ou fosse de 6 m au plus (A322-98) : {sites.length - filteredSites.length}{' '}
          site(s) masqué(s).
        </p>
      )}

      {selected && (
        <div className="info-box">
          <div>
            <b>{selected.nom}</b>, {selected.milieu}
            {selected.profondeur_max ? (
              <>
                , <span className="num">{selected.profondeur_max} m</span> au plus
              </>
            ) : (
              ''
            )}
          </div>
          <div className="row tight">
            {selected.depart_bord && <Pill>Départ du bord</Pill>}
            {selected.depart_bateau && <Pill>Départ en bateau</Pill>}
          </div>
          {selected.notes && <div className="muted">{selected.notes}</div>}
          {selected.coordonnees?.lat && (
            <div className="coords">
              {Number(selected.coordonnees.lat).toFixed(5)}, {Number(selected.coordonnees.lng).toFixed(5)}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <SiteFormModal
          title="Nouveau site"
          onSave={async (payload) => {
            const s = await api.sites.create(payload);
            setSites((prev) => [...prev, s].sort((a, b) => a.nom.localeCompare(b.nom)));
            onChange(s.id);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

export { DPPicker, SitePicker };
