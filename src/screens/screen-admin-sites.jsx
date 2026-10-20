// DP Assistant — Administration des sites de plongée

import React, { useState, useEffect, useRef, useId } from 'react';
import { Alert, Pill } from '../components/components.jsx';
import { ConfirmDialog, Dialog } from '../components/dialog.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { DiveListSkeleton } from './home-parts.jsx';
import { api } from '../api/api.js';
import { useClub } from '../club/club-context.jsx';

const MILIEUX_LIST = ['En mer','Lac','Carrière','Piscine','Autre'];
const emptySite = () => ({
  nom: '', milieu: 'En mer', profondeur_max: '',
  coordonnees: null, notes: '',
  depart_bord: false, depart_bateau: false,
  shot_line: false,
  ville: '', pays: '', pays_code: '', region: '',
  acces_secours: '', caisson: '',
});

// Mapping ISO code → emoji drapeau
function flagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '';
  const A = 0x1F1E6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(iso2.toUpperCase().charCodeAt(0) + A,
                              iso2.toUpperCase().charCodeAt(1) + A);
}

// Reverse geocoding via Google Geocoder (utilise l'API déjà chargée)
async function reverseGeocode(lat, lng) {
  if (!window.google?.maps) return null;
  return new Promise(resolve => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== 'OK' || !results?.length) return resolve(null);
      const components = results[0].address_components || [];
      const find = (type) => components.find(c => c.types.includes(type));
      const ville = find('locality') || find('postal_town') || find('administrative_area_level_2');
      const pays  = find('country');
      const region = find('administrative_area_level_1');
      resolve({
        ville: ville?.long_name || null,
        pays: pays?.long_name || null,
        pays_code: pays?.short_name || null,
        region: region?.long_name || null,
      });
    });
  });
}

// Default map center — Méditerranée française
const MAP_DEFAULT = { lat: 43.3, lng: 5.4 };

// ── MapPicker ──────────────────────────────────────────────────────────────
function MapPicker({ coordonnees, onChange }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerRef    = useRef(null);
  const searchRef    = useRef(null);
  const [ready, setReady] = useState(!!window.__gmapsLoaded);

  useEffect(() => {
    if (window.__gmapsLoaded) { setReady(true); return; }
    const onReady = () => setReady(true);
    window.addEventListener('gmaps:ready', onReady);
    return () => window.removeEventListener('gmaps:ready', onReady);
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;

    const center = (coordonnees?.lat && coordonnees?.lng)
      ? { lat: Number(coordonnees.lat), lng: Number(coordonnees.lng) }
      : MAP_DEFAULT;

    const map = new google.maps.Map(containerRef.current, {
      center,
      zoom: (coordonnees?.lat && coordonnees?.lng) ? 13 : 7,
      mapTypeId: 'hybrid',
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
      },
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    if (coordonnees?.lat && coordonnees?.lng) {
      const m = new google.maps.Marker({ position: center, map, draggable: true });
      m.addListener('dragend', e =>
        onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() })
      );
      markerRef.current = m;
    }

    map.addListener('click', e => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (markerRef.current) {
        markerRef.current.setPosition(e.latLng);
      } else {
        const m = new google.maps.Marker({ position: e.latLng, map, draggable: true });
        m.addListener('dragend', ev =>
          onChange({ lat: ev.latLng.lat(), lng: ev.latLng.lng() })
        );
        markerRef.current = m;
      }
      onChange({ lat, lng });
    });

    if (searchRef.current) {
      const ac = new google.maps.places.Autocomplete(searchRef.current, {
        types: ['geocode', 'establishment'],
      });
      ac.bindTo('bounds', map);
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        map.setCenter(place.geometry.location);
        map.setZoom(14);
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        if (markerRef.current) {
          markerRef.current.setPosition(place.geometry.location);
        } else {
          const m = new google.maps.Marker({
            position: place.geometry.location, map, draggable: true,
          });
          m.addListener('dragend', ev =>
            onChange({ lat: ev.latLng.lat(), lng: ev.latLng.lng() })
          );
          markerRef.current = m;
        }
        onChange({ lat, lng });
        if (place.name) window.__lastPlaceName = place.name;
      });
    }

    return () => {
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [ready]);

  if (!ready) {
    return <div className="map-placeholder">Chargement de la carte… (connexion requise)</div>;
  }

  return (
    <div className="map-picker">
      <input ref={searchRef} className="input" aria-label="Rechercher un lieu sur la carte"
        placeholder="Rechercher un lieu, une épave, un site" />
      <div ref={containerRef} className="map-canvas" />
      {coordonnees?.lat && (
        <div className="map-coords">
          {Number(coordonnees.lat).toFixed(6)}, {Number(coordonnees.lng).toFixed(6)}{' '}
          <a href={`https://www.google.com/maps?q=${coordonnees.lat},${coordonnees.lng}`}
            target="_blank" rel="noopener noreferrer">Ouvrir dans Google Maps</a>
        </div>
      )}
    </div>
  );
}

function SiteInput({ label, hint, required, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      {React.cloneElement(children, { id, 'aria-describedby': hint ? `${id}-h` : undefined, 'aria-required': required || undefined })}
      {hint && <span className="field-hint" id={`${id}-h`}>{hint}</span>}
    </div>
  );
}

// ── SiteFormModal — formulaire complet, réutilisé depuis l'admin et le profil ──
function SiteFormModal({ initial, title, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? emptySite());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onCoords = async (coords) => {
    setField('coordonnees', coords);
    if (!form.nom && window.__lastPlaceName) {
      setField('nom', window.__lastPlaceName);
      window.__lastPlaceName = null;
    }
    const geo = await reverseGeocode(coords.lat, coords.lng);
    if (geo) {
      setForm(f => ({ ...f, ville: geo.ville || f.ville, pays: geo.pays || f.pays,
        pays_code: geo.pays_code || f.pays_code, region: geo.region || f.region }));
    }
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { setError('Le nom du site est obligatoire.'); return; }
    if (!form.depart_bord && !form.depart_bateau) { setError('Indiquez au moins un type de départ : du bord ou en bateau.'); return; }
    setSaving(true); setError('');
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
    <Dialog title={title} size="lg" onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className="btn primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </>}>
      {error && <Alert tone="err">{error}</Alert>}
      <SiteInput label="Nom du site" required>
        <input className="input" value={form.nom} onChange={e => setField('nom', e.target.value)} placeholder="Épave du Rhône, lac de Salanfe…" />
      </SiteInput>
      <div className="grid-2">
        <SiteInput label="Milieu">
          <select className="input" value={form.milieu} onChange={e => setField('milieu', e.target.value)}>
            {MILIEUX_LIST.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </SiteInput>
        <SiteInput label="Profondeur max (m)">
          <input className="input num" type="number" inputMode="decimal" min="0" max="300" step="0.5"
            value={form.profondeur_max} onChange={e => setField('profondeur_max', e.target.value)} placeholder="40" />
        </SiteInput>
      </div>
      <div className="field plain">
        <span className="field-label">Localisation : touchez la carte ou recherchez un lieu</span>
        <MapPicker coordonnees={form.coordonnees} onChange={onCoords} />
        {form.ville && (
          <span className="muted small">{flagEmoji(form.pays_code)} {form.ville}{form.region ? `, ${form.region}` : ''}{form.pays ? `, ${form.pays}` : ''}</span>
        )}
      </div>
      <fieldset className="field">
        <legend className="field-label">Type de départ<span className="req" aria-hidden="true">*</span></legend>
        <div className="qualif-row">
          {[['depart_bord', 'Du bord'], ['depart_bateau', 'En bateau']].map(([k, label]) => (
            <label key={k} className={`qualif-toggle ${form[k] ? 'on' : ''}`}>
              <input type="checkbox" checked={!!form[k]} onChange={() => setField(k, !form[k])} />{label}
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
        <span className="field-hint">Ligne lestée de descente et de remontée ; le DP la confirme à chaque plongée.</span>
      </fieldset>
      <SiteInput label="Notes">
        <textarea className="textarea" rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Accès, conditions habituelles, points d'attention" />
      </SiteInput>
      <SiteInput label="Plan de secours : point d'accès, RDV des secours" hint="Repris dans la conduite à tenir de la fiche de sécurité et la fenêtre URGENCE.">
        <textarea className="textarea" rows={2} value={form.acces_secours} onChange={e => setField('acces_secours', e.target.value)} placeholder="Parking, voie d'accès véhicule, héliport…" />
      </SiteInput>
      <SiteInput label="Caisson ou hôpital de référence">
        <input className="input" value={form.caisson} onChange={e => setField('caisson', e.target.value)} placeholder="Caisson hyperbare le plus proche, téléphone" />
      </SiteInput>
    </Dialog>
  );
}

// ── ScreenAdminSites ───────────────────────────────────────────────────────
function ScreenAdminSites({ sites, setSites, sitesLoaded }) {
  const club = useClub();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loading = !sitesLoaded;

  const openNew  = () => setEditing('new');
  const openEdit = (s) => setEditing(s);
  const closeModal = () => { setEditing(null); setError(''); };

  const siteToForm = (s) => ({
    nom: s.nom, milieu: s.milieu || 'En mer',
    profondeur_max: s.profondeur_max != null ? String(s.profondeur_max) : '',
    coordonnees: s.coordonnees || null, notes: s.notes || '',
    depart_bord: !!s.depart_bord, depart_bateau: !!s.depart_bateau,
    shot_line: !!s.shot_line,
    ville: s.ville || '', pays: s.pays || '', pays_code: s.pays_code || '', region: s.region || '',
    acces_secours: s.acces_secours || '', caisson: s.caisson || '',
  });

  const onSave = async (payload) => {
    if (editing === 'new') {
      const s = await api.sites.create(payload);
      setSites(prev => [...prev, s].sort((a, b) => a.nom.localeCompare(b.nom)));
    } else {
      const s = await api.sites.update(editing.id, payload);
      setSites(prev => prev.map(x => x.id === s.id ? s : x));
    }
  };

  const onDelete = async (id) => {
    try {
      await api.sites.delete(id);
      setSites(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
    setConfirmDelete(null);
  };

  const canWrite = club.can('sites.write');
  const filtered = sites.filter(s => {
    const f = filter.toLowerCase();
    return !f || s.nom.toLowerCase().includes(f) || (s.milieu || '').toLowerCase().includes(f);
  });

  return (
    <div>
      <div className="page-head">
        <h1>Sites de plongée</h1>
        <p>{sites.length} site{sites.length > 1 ? 's' : ''} enregistré{sites.length > 1 ? 's' : ''}.</p>
      </div>
      {error && <Alert tone="err">{error}</Alert>}
      <div className="toolbar">
        <label className="sr-only" htmlFor="sites-search">Rechercher un site</label>
        <input id="sites-search" className="input" type="search" placeholder="Nom ou milieu" value={filter} onChange={e => setFilter(e.target.value)} />
        {canWrite && <button type="button" className="btn primary" onClick={openNew}><Icon.Plus />Nouveau site</button>}
      </div>
      <div className="diver-admin-list">
        {loading && <DiveListSkeleton rows={3} />}
        {filtered.map(s => (
          <div className="diver-admin-row" key={s.id}>
            <div className="info">
              <b>{s.nom}
                {s._pending && <span className="pending-dot" title="Pas encore synchronisé"><StatusIcon tone="warn" />en attente d'envoi</span>}
                {s.ville && <span className="muted small">{flagEmoji(s.pays_code)} {s.ville}{s.pays ? `, ${s.pays}` : ''}</span>}
              </b>
              <div className="meta-row">
                {s.milieu && <Pill>{s.milieu}</Pill>}
                {s.depart_bord && <Pill>Bord</Pill>}
                {s.depart_bateau && <Pill>Bateau</Pill>}
                {s.shot_line && <Pill>Shot-line</Pill>}
                {s.profondeur_max != null && <Pill>{s.profondeur_max} m max</Pill>}
                {s.coordonnees?.lat && (
                  <a className="small num" href={`https://www.google.com/maps?q=${s.coordonnees.lat},${s.coordonnees.lng}`} target="_blank" rel="noopener noreferrer">
                    {Number(s.coordonnees.lat).toFixed(4)}, {Number(s.coordonnees.lng).toFixed(4)}
                  </a>
                )}
              </div>
              {s.notes && <span className="muted small">{s.notes}</span>}
            </div>
            {canWrite && (
              <div className="diver-admin-actions">
                <button type="button" className="btn" onClick={() => openEdit(s)}><Icon.Edit />Modifier</button>
                <button type="button" className="btn danger icon" aria-label={`Supprimer ${s.nom}`} onClick={() => setConfirmDelete(s)}><Icon.Trash /></button>
              </div>
            )}
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <b>{sites.length === 0 ? 'Aucun site enregistré' : 'Aucun site ne correspond'}</b>
            <span>{sites.length === 0 ? 'Ajoutez vos sites avec leur plan de secours : il sera repris sur la fiche.' : 'Modifiez la recherche.'}</span>
          </div>
        )}
      </div>

      {editing !== null && (
        <SiteFormModal initial={editing === 'new' ? undefined : siteToForm(editing)}
          title={editing === 'new' ? 'Nouveau site' : `Modifier ${editing.nom}`} onSave={onSave} onClose={closeModal} />
      )}
      {confirmDelete && (
        <ConfirmDialog title={`Supprimer « ${confirmDelete.nom} » ?`} danger confirmLabel="Supprimer"
          onCancel={() => setConfirmDelete(null)} onConfirm={() => onDelete(confirmDelete.id)}>
          <p>Le site sera retiré de la liste. Les plongées archivées ne sont pas modifiées.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export { ScreenAdminSites, SiteFormModal, emptySite, MILIEUX_LIST };
