// DP Assistant — Administration des sites de plongée

const MILIEUX_LIST = ['En mer','Lac','Carrière','Piscine','Autre'];
const emptySite = () => ({ nom: '', milieu: 'En mer', profondeur_max: '', coordonnees: null, notes: '' });

function ScreenAdminSites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptySite());
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    api.sites.list()
      .then(setSites)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openNew = () => { setForm(emptySite()); setEditing('new'); };
  const openEdit = (s) => {
    setForm({
      nom: s.nom, milieu: s.milieu || 'En mer',
      profondeur_max: s.profondeur_max != null ? String(s.profondeur_max) : '',
      coordonnees: s.coordonnees || null, notes: s.notes || '',
    });
    setEditing(s);
  };
  const closeModal = () => { setEditing(null); setSaving(false); setError(''); };
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onSave = async () => {
    if (!form.nom.trim()) { setError('Le nom du site est requis'); return; }
    setSaving(true); setError('');
    const payload = {
      ...form,
      profondeur_max: form.profondeur_max !== '' ? parseFloat(form.profondeur_max) : null,
    };
    try {
      if (editing === 'new') {
        const s = await api.sites.create(payload);
        setSites(prev => [...prev, s].sort((a, b) => a.nom.localeCompare(b.nom)));
      } else {
        const s = await api.sites.update(editing.id, payload);
        setSites(prev => prev.map(x => x.id === s.id ? s : x));
      }
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
              <b>{s.nom}</b>
              <div className="meta-row">
                {s.milieu && <Pill>{s.milieu}</Pill>}
                {s.profondeur_max != null && <Pill tone="marine">max {s.profondeur_max} m</Pill>}
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

      {/* Modal édition */}
      {editing !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-head">
              <h3>{editing === 'new' ? 'Nouveau site' : `Modifier ${editing.nom}`}</h3>
              <button className="x" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {error && <Alert tone="warn" style={{ marginBottom: 10 }}>{error}</Alert>}

              <div className="field">
                <label>Nom du site *</label>
                <input className="input" value={form.nom} onChange={e => setField('nom', e.target.value)}
                  placeholder="Épave du Rhône, Lac de Salanfe…" />
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div className="field">
                  <label>Latitude</label>
                  <input className="input" type="number" step="0.000001"
                    value={form.coordonnees?.lat || ''}
                    onChange={e => setField('coordonnees', { ...(form.coordonnees || {}), lat: parseFloat(e.target.value) || null })}
                    placeholder="46.1234" />
                </div>
                <div className="field">
                  <label>Longitude</label>
                  <input className="input" type="number" step="0.000001"
                    value={form.coordonnees?.lng || ''}
                    onChange={e => setField('coordonnees', { ...(form.coordonnees || {}), lng: parseFloat(e.target.value) || null })}
                    placeholder="7.5678" />
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <label>Notes</label>
                <textarea className="textarea" rows={2} value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  placeholder="Accès, conditions habituelles, points d'attention…" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={closeModal}>Annuler</button>
              <button className="btn primary" onClick={onSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
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

Object.assign(window, { ScreenAdminSites, MILIEUX_LIST });
