// DP Assistant — Administration des sites de plongée

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
  const containerRef = React.useRef(null);
  const mapRef       = React.useRef(null);
  const markerRef    = React.useRef(null);
  const searchRef    = React.useRef(null);
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
    return (
      <div className="map-placeholder">
        <div className="muted" style={{ fontSize: 13 }}>Chargement de la carte…</div>
      </div>
    );
  }

  return (
    <div className="map-picker-wrap">
      <input
        ref={searchRef}
        className="input"
        placeholder="Rechercher un lieu, une épave, un site…"
        style={{ marginBottom: 8 }}
      />
      <div ref={containerRef} className="map-canvas" />
      {coordonnees?.lat && (
        <div className="map-coords">
          {coordonnees.lat.toFixed(6)}, {coordonnees.lng.toFixed(6)}
          <a
            href={`https://www.google.com/maps?q=${coordonnees.lat},${coordonnees.lng}`}
            target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 8, fontSize: 11 }}
          >Ouvrir dans Maps ↗</a>
        </div>
      )}
    </div>
  );
}

// ── SiteFormModal — formulaire complet, réutilisé depuis l'admin et le profil ──
function SiteFormModal({ initial, title, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? emptySite());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nom.trim()) { setError('Le nom du site est requis'); return; }
    if (!form.depart_bord && !form.depart_bateau) { setError('Indiquer au moins un type de départ (bord ou bateau)'); return; }
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <Alert tone="warn" style={{ marginBottom: 10 }}>{error}</Alert>}

          <div className="field">
            <label>Nom du site *</label>
            <input className="input" value={form.nom} onChange={e => setField('nom', e.target.value)}
              placeholder="Épave du Rhône, Lac de Salanfe, Sec de…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div className="field">
              <label>Milieu</label>
              <select className="input" value={form.milieu} onChange={e => setField('milieu', e.target.value)}>
                {MILIEUX_LIST.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Profondeur max (m)</label>
              <input className="input" type="number" min="0" max="300" step="0.5"
                value={form.profondeur_max} onChange={e => setField('profondeur_max', e.target.value)}
                placeholder="40" />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Localisation — cliquer sur la carte ou rechercher un lieu</label>
            <MapPicker
              coordonnees={form.coordonnees}
              onChange={async coords => {
                setField('coordonnees', coords);
                if (!form.nom && window.__lastPlaceName) {
                  setField('nom', window.__lastPlaceName);
                  window.__lastPlaceName = null;
                }
                const geo = await reverseGeocode(coords.lat, coords.lng);
                if (geo) {
                  setForm(f => ({
                    ...f,
                    ville: geo.ville || f.ville,
                    pays:  geo.pays  || f.pays,
                    pays_code: geo.pays_code || f.pays_code,
                    region: geo.region || f.region,
                  }));
                }
              }}
            />
            {form.ville && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {flagEmoji(form.pays_code)} {form.ville}{form.region ? ` · ${form.region}` : ''}{form.pays ? ` · ${form.pays}` : ''}
              </div>
            )}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Type de départ <span className="req">*</span></label>
            <div className="qualif-row">
              {[['depart_bord','Du bord'],['depart_bateau','En bateau']].map(([k, label]) => (
                <label key={k} className={`qualif-toggle ${form[k] ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!form[k]}
                    onChange={() => setField(k, !form[k])} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Équipement habituel</label>
            <div className="qualif-row">
              <label className={`qualif-toggle ${form.shot_line ? 'on' : ''}`}>
                <input type="checkbox" checked={!!form.shot_line}
                  onChange={() => setField('shot_line', !form.shot_line)} />
                Shot-line usuellement disponible
              </label>
            </div>
            <div className="field-hint">
              Shot-line habituellement présente sur ce site (ligne lestée pour descente/remontée). Le DP confirmera lors de chaque plongée.
            </div>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label>Notes</label>
            <textarea className="textarea" rows={2} value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Accès, conditions habituelles, points d'attention…" />
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label>Plan de secours — point d'accès / RDV secours</label>
            <textarea className="textarea" rows={2} value={form.acces_secours}
              onChange={e => setField('acces_secours', e.target.value)}
              placeholder="Parking, point de rendez-vous des secours, voie d'accès véhicule, héliport…" />
            <div className="field-hint">Réutilisé automatiquement dans le bloc « conduite à tenir » de la fiche de sécurité.</div>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label>Caisson / hôpital de référence</label>
            <input className="input" value={form.caisson}
              onChange={e => setField('caisson', e.target.value)}
              placeholder="Caisson hyperbare le plus proche, hôpital, téléphone…" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ScreenAdminSites ───────────────────────────────────────────────────────
function ScreenAdminSites({ sites, setSites, sitesLoaded }) {
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
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const filtered = sites.filter(s => {
    const f = filter.toLowerCase();
    return !f || s.nom.toLowerCase().includes(f) || (s.milieu || '').toLowerCase().includes(f);
  });

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Administration</div>
        <h1>Sites de plongée</h1>
        <p>{sites.length} site{sites.length !== 1 ? 's' : ''} enregistré{sites.length !== 1 ? 's' : ''}.</p>
      </div>

      {error && <Alert tone="warn">{error}</Alert>}

      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <input className="input" placeholder="Rechercher…" value={filter}
          onChange={e => setFilter(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary" onClick={openNew}>+ Nouveau site</button>
      </div>

      {loading && <div className="muted">Chargement…</div>}

      <div className="diver-admin-list">
        {filtered.map(s => (
          <div className="diver-admin-row" key={s.id}>
            <div className="info">
              <b>
                {s.nom}
                {s._pending && (
                  <span title="Modification non encore synchronisée avec le serveur"
                    style={{ display:'inline-block', width:8, height:8, borderRadius:'50%',
                      background:'var(--coral, #e07856)', marginLeft:8, verticalAlign:'middle' }} />
                )}
                {s.ville && (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 13 }}>
                    {flagEmoji(s.pays_code)} {s.ville}{s.pays ? `, ${s.pays}` : ''}
                  </span>
                )}
              </b>
              <div className="meta-row">
                {s.milieu && <Pill>{s.milieu}</Pill>}
                {s.depart_bord   && <Pill>Bord</Pill>}
                {s.depart_bateau && <Pill>Bateau</Pill>}
                {s.shot_line     && <Pill tone="kelp">Shot-line</Pill>}
                {s.profondeur_max != null && <Pill tone="marine">max {s.profondeur_max} m</Pill>}
                {s.coordonnees?.lat && (
                  <a
                    href={`https://www.google.com/maps?q=${s.coordonnees.lat},${s.coordonnees.lng}`}
                    target="_blank" rel="noopener noreferrer"
                    className="muted" style={{ fontSize: 11 }}
                  >
                    📍 {Number(s.coordonnees.lat).toFixed(4)}, {Number(s.coordonnees.lng).toFixed(4)}
                  </a>
                )}
              </div>
              {s.notes && <small className="muted">{s.notes}</small>}
            </div>
            <div className="diver-admin-actions">
              <button className="btn ghost" onClick={() => openEdit(s)}>Modifier</button>
              <button className="btn ghost err" onClick={() => setConfirmDelete(s)}>Supprimer</button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && <div className="empty">Aucun site trouvé.</div>}
      </div>

      {editing !== null && (
        <SiteFormModal
          initial={editing === 'new' ? undefined : siteToForm(editing)}
          title={editing === 'new' ? 'Nouveau site' : `Modifier ${editing.nom}`}
          onSave={onSave}
          onClose={closeModal}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head"><h3>Supprimer « {confirmDelete.nom} » ?</h3></div>
            <div className="modal-body"><p>Cette action est irréversible.</p></div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button className="btn primary err" onClick={() => onDelete(confirmDelete.id)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ScreenAdminSites, SiteFormModal, emptySite, MILIEUX_LIST });
