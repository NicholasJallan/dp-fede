// DP Assistant — Formulaire plongeur partagé : création rapide (profil,
// palanquées) et édition complète (annuaire). Un seul jeu de règles de
// saisie (niveaux, aptitudes de droit, cascades nitrox / trimix).

import React, { useState, useEffect, useId } from 'react';
import { Alert, Field } from './ui.jsx';
import { APTITUDE_MAP, DIPLOMES_PRO, PF_CODES, pfProfile } from '../domain/index.js';
import { useClub } from '../club/club-context.jsx';
import { isMinor, seasonChoices, seasonLabel } from '../club/season.js';
import { diplomeProHint, sourceLabel } from './diver-payload.js';

export { CLUB_FIELDS, emptyDiver, diverToForm, formToPayload, sourceLabel } from './diver-payload.js';

export {
  NIVEAUX_PLONGEUR,
  NIVEAUX_ENCADRANT,
  plongeurForEncadrant,
  toggleTrimixQual,
  nitroxPrereq,
  trimixPrereq,
  validateDiverForm,
} from './diver-form-rules.js';
import {
  RECYCLEURS,
  TRIMIX_QUALS,
  NIVEAUX_PLONGEUR,
  NIVEAUX_ENCADRANT,
  plongeurForEncadrant,
  toggleTrimixQual,
  nitroxPrereq,
  trimixPrereq,
  applyDiplomePro,
  applyNitrox,
  emptyPf,
  togglePfCode,
} from './diver-form-rules.js';

/** État + mutateurs du formulaire plongeur. */
export function useDiverForm(initial) {
  const [form, setForm] = useState(initial);
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Nettoyage des qualifications trimix dont les pré-requis disparaissent.
  useEffect(() => {
    const kept = form.trimix.filter((q) => !trimixPrereq(form, q));
    if (kept.length !== form.trimix.length) setForm((f) => ({ ...f, trimix: kept }));
  }, [form.nitrox, form.niveau_plongeur, form.niveau_encadrant]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    form,
    setForm,
    setField,
    setNiveauEncadrant: (ne) =>
      setForm((f) => ({
        ...f,
        niveau_encadrant: ne,
        niveau_plongeur: plongeurForEncadrant(ne, f.niveau_plongeur),
        rifap: ne ? true : f.rifap,
      })),
    setDiplomePro: (val) => setForm((f) => applyDiplomePro(f, val)),
    toggleNitrox: (val) => setForm((f) => applyNitrox(f, val)),
    toggleTrimix: (val) => setForm((f) => ({ ...f, trimix: toggleTrimixQual(f.trimix, val) })),
    toggleRecycleur: (val) =>
      setForm((f) => ({
        ...f,
        recycleurs: f.recycleurs.includes(val) ? f.recycleurs.filter((x) => x !== val) : [...f.recycleurs, val],
      })),
  };
}

// ── Champs ──────────────────────────────────────────────────────────────

function Chip({ on, locked, title, onToggle, children }) {
  return (
    <label className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`} title={title || undefined}>
      <input type="checkbox" checked={on} disabled={locked} onChange={() => !locked && onToggle()} />
      {children}
    </label>
  );
}

function ChipGroup({ label, hint, children }) {
  const id = useId();
  return (
    <fieldset className="field" aria-describedby={hint ? `${id}-h` : undefined}>
      <legend className="field-label">{label}</legend>
      <div className="qualif-row">{children}</div>
      {hint && (
        <span className="field-hint" id={`${id}-h`}>
          {hint}
        </span>
      )}
    </fieldset>
  );
}

function AptitudesGroup({ form, setField }) {
  const np = form.niveau_plongeur,
    ne = form.niveau_encadrant;
  const mandatory = new Set(),
    optional = new Set();
  [np, ne].forEach((l) => {
    if (l && APTITUDE_MAP?.[l]) {
      APTITUDE_MAP[l].mandatory.forEach((a) => mandatory.add(a));
      APTITUDE_MAP[l].optional.forEach((a) => optional.add(a));
    }
  });
  const all = [...mandatory, ...optional];
  if (all.length === 0) return null;
  const toggle = (a) => {
    const cur = form.aptitudes_sup || [];
    setField('aptitudes_sup', cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]);
  };
  return (
    <ChipGroup label="Aptitudes" hint="Les aptitudes verrouillées sont acquises de droit avec le niveau.">
      {all.map((a) => (
        <Chip
          key={a}
          on={mandatory.has(a) || (form.aptitudes_sup || []).includes(a)}
          locked={mandatory.has(a)}
          title={mandatory.has(a) ? 'Acquise de droit avec le niveau' : ''}
          onToggle={() => toggle(a)}
        >
          {a}
        </Chip>
      ))}
    </ChipGroup>
  );
}

const PF_DIPLOME_LABELS = {
  BPJEPS: 'BPJEPS plongée',
  DEJEPS: 'DEJEPS plongée',
  'DEJEPS-E4': 'DEJEPS plongée + CC plongée profonde',
  DESJEPS: 'DESJEPS plongée',
  BEES1: 'BEES 1 plongée',
  BEES2: 'BEES 2 plongée',
  BEES3: 'BEES 3 plongée',
  'BPP-GAPPN': 'BPP GAPPN plongée subaquatique',
};

const PF_GROUPS = [
  { key: 'aptitudes', label: 'Aptitudes (annexe IV)' },
  { key: 'gaz', label: 'Mélanges (annexes V et VI)' },
  { key: 'fonctions', label: 'Fonctions : enseignant, guide, directeur de plongée (annexes I à III)' },
];

// Profil au sens de l'arrêté n° 199 CM. Tant que le DP n'a rien coché, une
// liste est déduite des niveaux FFESSM ; la première modification part de
// cette déduction (art. LP 13 : le DP reconnaît les aptitudes).
function PfFields({ form, setField, open }) {
  const profile = pfProfile(form);
  const pf = form.pf ?? emptyPf();
  const update = (patch) => setField('pf', { ...pf, ...patch });
  const toggle = (key, code) => {
    const base = profile.derived[key] ? { ...pf, [key]: profile[key] } : pf;
    setField('pf', togglePfCode(base, key, code));
  };
  return (
    <details className="field" open={open}>
      <summary className="field-label">Polynésie française (arrêté n° 199 CM)</summary>
      {PF_GROUPS.map(({ key, label }) => (
        <ChipGroup
          key={key}
          label={label}
          hint={
            profile.derived[key]
              ? 'Déduit des niveaux FFESSM : cochez ou décochez pour saisir vous-même.'
              : 'Saisi par le directeur de plongée.'
          }
        >
          {PF_CODES[key].map((code) => (
            <Chip key={code} on={profile[key].includes(code)} onToggle={() => toggle(key, code)}>
              {code}
            </Chip>
          ))}
          {!profile.derived[key] && (
            <button type="button" className="btn ghost sm" onClick={() => update({ [key]: [] })}>
              Revenir à la déduction
            </button>
          )}
        </ChipGroup>
      ))}
      <div className="grid-2">
        <Field
          label="Diplôme homologué"
          hint="Exigé pour encadrer contre rémunération (loi du pays n° 2017-44, art. LP 18)."
        >
          <select
            className="input"
            value={pf.diplome_homologue || ''}
            onChange={(e) => update({ diplome_homologue: e.target.value || null })}
          >
            <option value="">
              {profile.derived.diplome_homologue && profile.diplome_homologue
                ? `Déduit : ${PF_DIPLOME_LABELS[profile.diplome_homologue]}`
                : 'Aucun'}
            </option>
            {PF_CODES.diplomes.map((code) => (
              <option key={code} value={code}>
                {PF_DIPLOME_LABELS[code]}
              </option>
            ))}
          </select>
        </Field>
        <ChipGroup label="Statut">
          <Chip on={!!pf.patente} onToggle={() => update({ patente: !pf.patente })}>
            Patenté (indépendant rémunéré)
          </Chip>
          <Chip on={!!pf.stagiaire} onToggle={() => update({ stagiaire: !pf.stagiaire })}>
            Stagiaire (sous tuteur)
          </Chip>
        </ChipGroup>
      </div>
      <div className="grid-2">
        <Field label="Brevets" hint="Brevets et organismes, tels qu'à reporter sur la feuille de palanquée.">
          <input
            className="input"
            maxLength={500}
            value={pf.brevets || ''}
            placeholder="PADI OWSI, TEC 40…"
            onChange={(e) => update({ brevets: e.target.value })}
          />
        </Field>
        <Field label="Attestation de condition physique" hint="Questionnaire sur l'honneur (annexe XVII).">
          <input
            className="input mono"
            type="date"
            value={pf.attestation || ''}
            onChange={(e) => update({ attestation: e.target.value || null })}
          />
        </Field>
      </div>
    </details>
  );
}

/** Champs complets d'un plongeur (hors baptême). */
export function DiverFormFields({ f }) {
  const { form, setField } = f;
  const isPf = useClub().jurisdiction === 'PF';
  return (
    <>
      <div className="grid-2">
        <Field label="Prénom">
          <input
            className="input"
            autoComplete="off"
            value={form.prenom}
            onChange={(e) => setField('prenom', e.target.value)}
          />
        </Field>
        <Field label="Nom" required>
          <input
            className="input"
            autoComplete="off"
            value={form.nom}
            onChange={(e) => setField('nom', e.target.value)}
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Numéro de licence">
          <input
            className="input mono"
            value={form.licence}
            placeholder="A-29-001234"
            onChange={(e) => setField('licence', e.target.value)}
          />
        </Field>
        <Field label="Fin de licence" hint="Date de fin de validité (alerte à l'échéance).">
          <input
            className="input mono"
            type="date"
            value={form.licence_fin || ''}
            onChange={(e) => setField('licence_fin', e.target.value)}
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field
          label="Niveau plongeur"
          hint={form.niveau_encadrant ? 'N3 pour un encadrant (N2 possible pour un E1).' : undefined}
        >
          <select
            className="input"
            value={form.niveau_plongeur}
            disabled={!!form.niveau_encadrant && form.niveau_encadrant !== 'E1'}
            onChange={(e) => setField('niveau_plongeur', e.target.value)}
          >
            <option value="">Aucun (débutant)</option>
            {NIVEAUX_PLONGEUR.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Niveau encadrant" hint="Cadre associatif : MF1 = E3, MF2 / BEPPA = E4.">
          <select
            className="input"
            value={form.niveau_encadrant}
            onChange={(e) => f.setNiveauEncadrant(e.target.value)}
          >
            <option value="">Aucun</option>
            {NIVEAUX_ENCADRANT.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!form.niveau_plongeur && !form.niveau_encadrant && (
        <Alert tone="warn">
          Sans niveau : licencié débutant, autorisé en baptême ou PE20 uniquement, dans une palanquée de formation
          (enseignant E1 à E4).
        </Alert>
      )}
      <AptitudesGroup form={form} setField={setField} />
      <ChipGroup label="Nitrox">
        {['PN', 'PN-C'].map((q) => {
          const on = form.nitrox.includes(q);
          const reason = nitroxPrereq(form, q);
          return (
            <Chip
              key={q}
              on={on}
              locked={(q === 'PN' && form.nitrox.includes('PN-C')) || (!!reason && !on)}
              title={reason}
              onToggle={() => f.toggleNitrox(q)}
            >
              {q}
              {q === 'PN-C' ? ' (inclut PN)' : ''}
              {reason && !on ? ` (${reason})` : ''}
            </Chip>
          );
        })}
      </ChipGroup>
      <ChipGroup label="Trimix, héliox (PTH)" hint="PTH-70 inclut PTH-40, PTH-120 inclut PTH-70 (annexe III-18 a).">
        {TRIMIX_QUALS.map((q) => {
          const on = form.trimix.includes(q);
          const reason = trimixPrereq(form, q);
          return (
            <Chip key={q} on={on} locked={!!reason && !on} title={reason} onToggle={() => f.toggleTrimix(q)}>
              {q}
              {reason && !on ? ` (${reason})` : ''}
            </Chip>
          );
        })}
      </ChipGroup>
      <ChipGroup label="Recycleur">
        {RECYCLEURS.map((q) => (
          <Chip key={q} on={form.recycleurs.includes(q)} onToggle={() => f.toggleRecycleur(q)}>
            {q}
          </Chip>
        ))}
      </ChipGroup>
      <div className="grid-2">
        <Field label="Diplôme professionnel" hint={diplomeProHint(form)}>
          <select className="input" value={form.diplome_pro} onChange={(e) => f.setDiplomePro(e.target.value)}>
            <option value="">Aucun</option>
            {Object.entries(DIPLOMES_PRO).map(([code, { label }]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <ChipGroup label="Autres qualifications">
          <Chip on={!!form.rifap} onToggle={() => setField('rifap', !form.rifap)}>
            RIFAP
          </Chip>
          <Chip on={!!form.tiv} onToggle={() => setField('tiv', !form.tiv)}>
            TIV
          </Chip>
        </ChipGroup>
      </div>
      <div className="grid-2">
        <Field
          label="Certificat médical (date d'émission)"
          required={!isPf}
          hint={
            isPf ? 'Exigé des encadrants et des plongeurs à antécédents (arrêté n° 199 CM, art. 12 et 13).' : undefined
          }
        >
          <input
            className="input mono"
            type="date"
            value={form.medical}
            onChange={(e) => setField('medical', e.target.value)}
          />
        </Field>
        <Field
          label="Date de naissance"
          hint={
            isPf
              ? 'Autonomie réservée aux majeurs (loi du pays n° 2017-44, LP 4).'
              : 'Autonomie PA-12/PA-20 dès 16 ans, PA-40 dès 17 ans ; PA-60 et trimix réservés aux majeurs.'
          }
        >
          <input
            className="input mono"
            type="date"
            value={form.date_naissance || ''}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setField('date_naissance', e.target.value)}
          />
        </Field>
      </div>
      <MinorFields form={form} setField={setField} />
      <PfFields form={form} setField={setField} open={isPf || !!form.pf} />
      <Field label="Notes" hint="Pas d'information médicale : seule la date du certificat est conservée.">
        <textarea
          className="textarea"
          rows={2}
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
        />
      </Field>
      <ProvenanceFields form={form} />
    </>
  );
}

function ProvenanceFields({ form }) {
  if (!form.source || form.source === 'manuel') return null;
  return (
    <div className="grid-2">
      <Field label="Source" hint="Renseignée par l'import ; un nouvel import met cette fiche à jour.">
        <input className="input" value={sourceLabel(form.source)} readOnly />
      </Field>
      <Field label="Identifiant externe">
        <input className="input mono" value={form.external_id || '—'} readOnly />
      </Field>
    </div>
  );
}

// Mineur, ou champs déjà renseignés : représentant légal et autorisation
// parentale de la saison (alerte club si absente pour la saison en cours).
function MinorFields({ form, setField }) {
  const minor = isMinor(form.date_naissance);
  if (!minor && !form.representant_legal && !form.autorisation_parentale_saison) return null;
  const current = seasonLabel();
  return (
    <>
      {minor && form.autorisation_parentale_saison !== current && (
        <Alert tone="warn">Plongeur mineur : autorisation parentale de la saison {current} à enregistrer.</Alert>
      )}
      <div className="grid-2">
        <Field label="Représentant légal" hint="Nom et téléphone du responsable légal.">
          <input
            className="input"
            maxLength={200}
            value={form.representant_legal || ''}
            onChange={(e) => setField('representant_legal', e.target.value)}
          />
        </Field>
        <Field label="Autorisation parentale (saison)" hint="Saison FFESSM du 15/09 au 14/09.">
          <select
            className="input mono"
            value={form.autorisation_parentale_saison || ''}
            onChange={(e) => setField('autorisation_parentale_saison', e.target.value)}
          >
            <option value="">Aucune</option>
            {seasonChoices(new Date(), form.autorisation_parentale_saison).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

// ── Création rapide (profil, palanquées) ────────────────────────────────

export function BaptemeFields({ form, setField }) {
  return (
    <div className="grid-2">
      <Field label="Prénom">
        <input className="input" value={form.prenom} onChange={(e) => setField('prenom', e.target.value)} />
      </Field>
      <Field label="Nom">
        <input className="input" value={form.nom} onChange={(e) => setField('nom', e.target.value)} />
      </Field>
    </div>
  );
}
