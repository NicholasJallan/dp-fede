// DP Assistant — Formulaire d'un site (administration et profil de la plongée).

import React, { useState } from 'react';
import { Alert, Field } from '../../components/components.jsx';
import { Dialog } from '../../components/dialog.jsx';

import { MapPicker, flagEmoji, reverseGeocode } from './map-picker.jsx';

const MILIEUX_LIST = ['En mer', 'Lac', 'Carrière', 'Piscine', 'Autre'];
const emptySite = () => ({
  nom: '',
  milieu: 'En mer',
  profondeur_max: '',
  coordonnees: null,
  notes: '',
  depart_bord: false,
  depart_bateau: false,
  shot_line: false,
  ville: '',
  pays: '',
  pays_code: '',
  region: '',
  acces_secours: '',
  caisson: '',
});

// ── SiteFormModal — formulaire complet, réutilisé depuis l'admin et le profil ──
function SiteFormModal({ initial, title, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? emptySite());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onCoords = async (coords) => {
    setField('coordonnees', coords);
    if (!form.nom && window.__lastPlaceName) {
      setField('nom', window.__lastPlaceName);
      window.__lastPlaceName = null;
    }
    const geo = await reverseGeocode(coords.lat, coords.lng);
    if (geo) {
      setForm((f) => ({
        ...f,
        ville: geo.ville || f.ville,
        pays: geo.pays || f.pays,
        pays_code: geo.pays_code || f.pays_code,
        region: geo.region || f.region,
      }));
    }
  };

  const handleSave = async () => {
    if (!form.nom.trim()) {
      setError('Le nom du site est obligatoire.');
      return;
    }
    if (!form.depart_bord && !form.depart_bateau) {
      setError('Indiquez au moins un type de départ : du bord ou en bateau.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        profondeur_max: form.profondeur_max !== '' ? parseFloat(form.profondeur_max) : null,
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      {error && <Alert tone="err">{error}</Alert>}
      <Field label="Nom du site" required>
        <input
          className="input"
          value={form.nom}
          onChange={(e) => setField('nom', e.target.value)}
          placeholder="Épave du Rhône, lac de Salanfe…"
        />
      </Field>
      <div className="grid-2">
        <Field label="Milieu">
          <select className="input" value={form.milieu} onChange={(e) => setField('milieu', e.target.value)}>
            {MILIEUX_LIST.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Profondeur max (m)">
          <input
            className="input num"
            type="number"
            inputMode="decimal"
            min="0"
            max="300"
            step="0.5"
            value={form.profondeur_max}
            onChange={(e) => setField('profondeur_max', e.target.value)}
            placeholder="40"
          />
        </Field>
      </div>
      <div className="field plain">
        <span className="field-label">Localisation : touchez la carte ou recherchez un lieu</span>
        <MapPicker coordonnees={form.coordonnees} onChange={onCoords} />
        {form.ville && (
          <span className="muted small">
            {flagEmoji(form.pays_code)} {form.ville}
            {form.region ? `, ${form.region}` : ''}
            {form.pays ? `, ${form.pays}` : ''}
          </span>
        )}
      </div>
      <fieldset className="field">
        <legend className="field-label">
          Type de départ
          <span className="req" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="qualif-row">
          {[
            ['depart_bord', 'Du bord'],
            ['depart_bateau', 'En bateau'],
          ].map(([k, label]) => (
            <label key={k} className={`qualif-toggle ${form[k] ? 'on' : ''}`}>
              <input type="checkbox" checked={!!form[k]} onChange={() => setField(k, !form[k])} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field-label">Équipement habituel</legend>
        <label className={`qualif-toggle ${form.shot_line ? 'on' : ''}`}>
          <input type="checkbox" checked={!!form.shot_line} onChange={() => setField('shot_line', !form.shot_line)} />
          Shot-line habituellement disponible
        </label>
        <span className="field-hint">
          Ligne lestée de descente et de remontée ; le DP la confirme à chaque plongée.
        </span>
      </fieldset>
      <Field label="Notes">
        <textarea
          className="textarea"
          rows={2}
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Accès, conditions habituelles, points d'attention"
        />
      </Field>
      <Field
        label="Plan de secours : point d'accès, RDV des secours"
        hint="Repris dans la conduite à tenir de la fiche de sécurité et la fenêtre URGENCE."
      >
        <textarea
          className="textarea"
          rows={2}
          value={form.acces_secours}
          onChange={(e) => setField('acces_secours', e.target.value)}
          placeholder="Parking, voie d'accès véhicule, héliport…"
        />
      </Field>
      <Field label="Caisson ou hôpital de référence">
        <input
          className="input"
          value={form.caisson}
          onChange={(e) => setField('caisson', e.target.value)}
          placeholder="Caisson hyperbare le plus proche, téléphone"
        />
      </Field>
    </Dialog>
  );
}

// ── ScreenAdminSites ───────────────────────────────────────────────────────

export { SiteFormModal };
