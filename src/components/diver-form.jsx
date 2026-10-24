// DP Assistant — Formulaire plongeur partagé : création rapide (profil,
// palanquées) et édition complète (annuaire). Un seul jeu de règles de
// saisie (niveaux, aptitudes de droit, cascades nitrox / trimix).

import React, { useState, useEffect, useId } from 'react';
import { Alert } from './ui.jsx';
import { Dialog } from './dialog.jsx';
import { APTITUDE_MAP, CDS, DIPLOMES_PRO, diplomeProLevel } from '../domain/index.js';
import { api } from '../api/api.js';
import { isMinor, isSeason, seasonChoices, seasonLabel } from '../club/season.js';
import { diplomeProHint, emptyDiver, formToPayload, sourceLabel } from './diver-payload.js';

export const NIVEAUX_PLONGEUR = ['N1', 'N2', 'N3'];
export const NIVEAUX_ENCADRANT = ['N4', 'N5', 'E1', 'E2', 'E3', 'E4'];
const RECYCLEURS = ['Revo', 'AP', 'Triton', 'JJccr', 'Xccr', 'Megalodon', 'Shark', 'Submatix', 'Autre'];
const TRIMIX_QUALS = ['PTH-40', 'PTH-70', 'PTH-120'];

export { CLUB_FIELDS, emptyDiver, diverToForm, formToPayload, sourceLabel } from './diver-payload.js';

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

export function trimixPrereq(form, qual) {
  if (!form.nitrox.includes('PN-C')) return 'PN-C requis';
  const lvl60 = form.niveau_plongeur === 'N3' || !!form.niveau_encadrant;
  const lvl40 = lvl60 || form.niveau_plongeur === 'N2';
  if (qual === 'PTH-40') return lvl40 ? null : 'PE-40 ou PA-40 requis (N2 minimum)';
  return lvl60 ? null : 'PE-60 ou PA-60 requis (N3 minimum)';
}

// Diplôme pro : le niveau encadrant (associatif) vaut au moins celui du
// diplôme (DEJEPS → E3, DEJEPS + CC / DESJEPS → E4) ; DEJEPS / DESJEPS → PN-C.
function applyDiplomePro(f, val) {
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

function applyNitrox(f, val) {
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

function Input({ label, hint, required, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatoire)</span>}
      </label>
      {React.cloneElement(children, {
        id,
        'aria-describedby': hint ? `${id}-h` : undefined,
        'aria-required': required || undefined,
      })}
      {hint && (
        <span className="field-hint" id={`${id}-h`}>
          {hint}
        </span>
      )}
    </div>
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

/** Champs complets d'un plongeur (hors baptême). */
export function DiverFormFields({ f }) {
  const { form, setField } = f;
  return (
    <>
      <div className="grid-2">
        <Input label="Prénom">
          <input
            className="input"
            autoComplete="off"
            value={form.prenom}
            onChange={(e) => setField('prenom', e.target.value)}
          />
        </Input>
        <Input label="Nom" required>
          <input
            className="input"
            autoComplete="off"
            value={form.nom}
            onChange={(e) => setField('nom', e.target.value)}
          />
        </Input>
      </div>
      <div className="grid-2">
        <Input label="Numéro de licence">
          <input
            className="input mono"
            value={form.licence}
            placeholder="A-29-001234"
            onChange={(e) => setField('licence', e.target.value)}
          />
        </Input>
        <Input label="Fin de licence" hint="Date de fin de validité (alerte à l'échéance).">
          <input
            className="input mono"
            type="date"
            value={form.licence_fin || ''}
            onChange={(e) => setField('licence_fin', e.target.value)}
          />
        </Input>
      </div>
      <div className="grid-2">
        <Input
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
        </Input>
        <Input label="Niveau encadrant" hint="Cadre associatif : MF1 = E3, MF2 / BEPPA = E4.">
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
        </Input>
      </div>
      {!form.niveau_plongeur && !form.niveau_encadrant && (
        <Alert tone="warn">
          Sans niveau : licencié débutant, autorisé en baptême ou PE20 uniquement, dans une palanquée de formation
          (enseignant E1 à E4).
        </Alert>
      )}
      <AptitudesGroup form={form} setField={setField} />
      <ChipGroup label="Nitrox">
        {['PN', 'PN-C'].map((q) => (
          <Chip
            key={q}
            on={form.nitrox.includes(q)}
            locked={q === 'PN' && form.nitrox.includes('PN-C')}
            onToggle={() => f.toggleNitrox(q)}
          >
            {q}
            {q === 'PN-C' ? ' (inclut PN)' : ''}
          </Chip>
        ))}
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
        <Input label="Diplôme professionnel" hint={diplomeProHint(form)}>
          <select className="input" value={form.diplome_pro} onChange={(e) => f.setDiplomePro(e.target.value)}>
            <option value="">Aucun</option>
            {Object.entries(DIPLOMES_PRO).map(([code, { label }]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Input>
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
        <Input label="Certificat médical (date d'émission)" required>
          <input
            className="input mono"
            type="date"
            value={form.medical}
            onChange={(e) => setField('medical', e.target.value)}
          />
        </Input>
        <Input
          label="Date de naissance"
          hint="Autonomie PA-12/PA-20 dès 16 ans, PA-40 dès 17 ans ; PA-60 et trimix réservés aux majeurs."
        >
          <input
            className="input mono"
            type="date"
            value={form.date_naissance || ''}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setField('date_naissance', e.target.value)}
          />
        </Input>
      </div>
      <MinorFields form={form} setField={setField} />
      <Input label="Notes" hint="Pas d'information médicale : seule la date du certificat est conservée.">
        <textarea
          className="textarea"
          rows={2}
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
        />
      </Input>
      <ProvenanceFields form={form} />
    </>
  );
}

export function validateDiverForm(form) {
  if (!form.nom.trim()) return 'Le nom est obligatoire.';
  if (!form.medical) return 'La date du certificat médical est obligatoire.';
  if (form.autorisation_parentale_saison && !isSeason(form.autorisation_parentale_saison)) {
    return "Saison de l'autorisation parentale invalide (format 2026-2027).";
  }
  if ((form.representant_legal || '').length > 200) return 'Représentant légal : 200 caractères maximum.';
  return '';
}

function ProvenanceFields({ form }) {
  if (!form.source || form.source === 'manuel') return null;
  return (
    <div className="grid-2">
      <Input label="Source" hint="Renseignée par l'import ; un nouvel import met cette fiche à jour.">
        <input className="input" value={sourceLabel(form.source)} readOnly />
      </Input>
      <Input label="Identifiant externe">
        <input className="input mono" value={form.external_id || '—'} readOnly />
      </Input>
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
        <Input label="Représentant légal" hint="Nom et téléphone du responsable légal.">
          <input
            className="input"
            maxLength={200}
            value={form.representant_legal || ''}
            onChange={(e) => setField('representant_legal', e.target.value)}
          />
        </Input>
        <Input label="Autorisation parentale (saison)" hint="Saison FFESSM du 15/09 au 14/09.">
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
        </Input>
      </div>
    </>
  );
}

// ── Création rapide (profil, palanquées) ────────────────────────────────

function BaptemeFields({ form, setField }) {
  return (
    <div className="grid-2">
      <Input label="Prénom">
        <input className="input" value={form.prenom} onChange={(e) => setField('prenom', e.target.value)} />
      </Input>
      <Input label="Nom">
        <input className="input" value={form.nom} onChange={(e) => setField('nom', e.target.value)} />
      </Input>
    </div>
  );
}

export function DiverQuickAdd({ onCreated, onClose, initialName = '', allowBapteme = false, baptemeOnSave = null }) {
  const parts = initialName.trim().split(/\s+/);
  const f = useDiverForm({
    ...emptyDiver(),
    prenom: parts.length > 1 ? parts[0] : initialName,
    nom: parts.length > 1 ? parts.slice(1).join(' ') : '',
  });
  const { form, setField } = f;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [isBapteme, setIsBapteme] = useState(false);

  const onSave = async () => {
    const problem = isBapteme
      ? !form.prenom.trim() && !form.nom.trim()
        ? 'Saisissez au moins le prénom ou le nom du baptisé.'
        : ''
      : validateDiverForm(form);
    if (problem) {
      setErr(problem);
      return;
    }
    setErr('');
    setSaving(true);
    try {
      if (isBapteme && baptemeOnSave) {
        // Baptême : objet local, jamais ajouté à l'annuaire.
        baptemeOnSave({
          id: `bap-${Math.random().toString(36).slice(2, 9)}`,
          nom: form.nom || '?',
          prenom: form.prenom || '',
          niveau_plongeur: null,
          niveau_encadrant: null,
          aptitudes_sup: [],
          nitrox: [],
          trimix: [],
          recycleurs: [],
          medical: null,
          _bapteme: true,
        });
      } else {
        onCreated(await api.divers.create(formToPayload(form)));
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={isBapteme ? 'Ajouter un baptême' : 'Nouveau plongeur'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : isBapteme ? 'Ajouter le baptême' : 'Créer le plongeur'}
          </button>
        </>
      }
    >
      {err && <Alert tone="err">{err}</Alert>}
      {allowBapteme && (
        <label className={`qualif-toggle ${isBapteme ? 'on' : ''}`}>
          <input type="checkbox" checked={isBapteme} onChange={() => setIsBapteme((v) => !v)} />
          Baptême (non enregistré dans l'annuaire)
        </label>
      )}
      {isBapteme ? <BaptemeFields form={form} setField={setField} /> : <DiverFormFields f={f} />}
    </Dialog>
  );
}
