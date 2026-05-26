// DP Assistant — Administration de l'annuaire des plongeurs

const NIVEAUX_LIST = ['N1','N2','N3','N4','GP','E1','E2','E3','E4','P5','MF1','MF2','BEES1','DEJEPS','DESJEPS'];
const QUALIFS_LIST = [
  { id: 'PN',     label: 'Nitrox (PN)' },
  { id: 'PN-C',   label: 'Nitrox Confirmé' },
  { id: 'PTH-70', label: 'Hyperoxique 70' },
  { id: 'PTH-120',label: 'Hyperoxique 120' },
  { id: 'REC-CCR',label: 'Recycleur CCR (loisir)' },
  { id: 'TEC-CCR',label: 'Recycleur CCR (tec)' },
  { id: 'TIV',    label: 'Trimix (TIV)' },
  { id: 'RIFAP',  label: 'RIFAP' },
  { id: 'PSC1',   label: 'PSC1' },
  { id: 'DAEFR',  label: 'Défibrillation' },
  { id: 'PE-40',  label: 'Prérogative Enfant 40m' },
  { id: 'PE-60',  label: 'Prérogative Enfant 60m' },
  { id: 'Apnée',  label: 'Apnée' },
  { id: 'Chasse', label: 'Chasse sous-marine' },
];

const emptyDiver = () => ({
  nom: '', prenom: '', licence: '', niveau: '', qualifs: [], medical: '', notes: ''
});

function ScreenAdminDivers() {
  const [divers, setDivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | diver object
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyDiver());
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    api.divers.list()
      .then(setDivers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openNew = () => { setForm(emptyDiver()); setEditing('new'); };
  const openEdit = (d) => { setForm({ ...d, medical: d.medical || '', notes: d.notes || '' }); setEditing(d); };
  const closeModal = () => { setEditing(null); setSaving(false); setError(''); };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleQualif = (q) => setForm(f => ({
    ...f,
    qualifs: f.qualifs.includes(q) ? f.qualifs.filter(x => x !== q) : [...f.qualifs, q]
  }));

  const onSave = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        const d = await api.divers.create(form);
        setDivers(prev => [...prev, d].sort((a, b) => a.nom.localeCompare(b.nom)));
      } else {
        const d = await api.divers.update(editing.id, form);
        setDivers(prev => prev.map(x => x.id === d.id ? d : x));
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
      await api.divers.delete(id);
      setDivers(prev => prev.filter(d => d.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const filtered = divers.filter(d => {
    const f = filter.toLowerCase();
    return !f || d.nom.toLowerCase().includes(f) || (d.prenom || '').toLowerCase().includes(f)
      || (d.niveau || '').toLowerCase().includes(f) || (d.licence || '').includes(f);
  });

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Administration</div>
        <h1>Annuaire des plongeurs</h1>
        <p>{divers.length} plongeur{divers.length !== 1 ? 's' : ''} enregistré{divers.length !== 1 ? 's' : ''}.</p>
      </div>

      {error && <Alert tone="warn">{error}</Alert>}

      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <input className="input" placeholder="Rechercher…" value={filter}
          onChange={e => setFilter(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary" onClick={openNew}>+ Nouveau plongeur</button>
      </div>

      {loading && <div className="muted">Chargement…</div>}

      <div className="diver-admin-list">
        {filtered.map(d => (
          <div className="diver-admin-row" key={d.id}>
            <div className="info">
              <b>{diverFullName(d)}</b>
              <div className="meta-row">
                {d.niveau && <Pill tone="ink">{d.niveau}</Pill>}
                {(d.qualifs || []).map(q => <Pill key={q}>{q}</Pill>)}
                {d.licence && <span className="muted" style={{ fontSize: 11, fontFamily: 'var(--t-mono)' }}>{d.licence}</span>}
              </div>
              {d.medical && (
                <small className={`muted ${new Date(d.medical) < new Date() ? 'text-coral' : ''}`}>
                  Certificat médical : {d.medical}
                  {new Date(d.medical) < new Date() ? ' ⚠ Expiré' : ''}
                </small>
              )}
            </div>
            <div className="diver-admin-actions">
              <button className="btn ghost" onClick={() => openEdit(d)}>Modifier</button>
              <button className="btn ghost err" onClick={() => setConfirmDelete(d)}>Supprimer</button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="empty">Aucun plongeur trouvé.</div>
        )}
      </div>

      {/* Modal édition */}
      {editing !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-head">
              <h3>{editing === 'new' ? 'Nouveau plongeur' : `Modifier ${diverFullName(editing)}`}</h3>
              <button className="x" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {error && <Alert tone="warn" style={{ marginBottom: 10 }}>{error}</Alert>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Nom *</label>
                  <input className="input" value={form.nom} onChange={e => setField('nom', e.target.value)} />
                </div>
                <div className="field">
                  <label>Prénom</label>
                  <input className="input" value={form.prenom} onChange={e => setField('prenom', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div className="field">
                  <label>Numéro de licence</label>
                  <input className="input" value={form.licence} onChange={e => setField('licence', e.target.value)}
                    placeholder="A-29-001234" style={{ fontFamily: 'var(--t-mono)' }} />
                </div>
                <div className="field">
                  <label>Niveau</label>
                  <select className="input" value={form.niveau} onChange={e => setField('niveau', e.target.value)}>
                    <option value="">— sélectionner —</option>
                    {NIVEAUX_LIST.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <label>Qualifications complémentaires</label>
                <div className="qualifs-grid">
                  {QUALIFS_LIST.map(q => (
                    <label key={q.id} className={`qualif-toggle ${form.qualifs.includes(q.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={form.qualifs.includes(q.id)}
                        onChange={() => toggleQualif(q.id)} />
                      {q.id} — {q.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div className="field">
                  <label>Certificat médical (expiration)</label>
                  <input className="input" type="date" value={form.medical}
                    onChange={e => setField('medical', e.target.value)} />
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <label>Notes</label>
                <textarea className="textarea" value={form.notes}
                  onChange={e => setField('notes', e.target.value)} rows={2} />
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

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head"><h3>Supprimer {diverFullName(confirmDelete)} ?</h3></div>
            <div className="modal-body">
              <p>Cette action est irréversible. Le plongeur sera retiré de l'annuaire.</p>
            </div>
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

Object.assign(window, { ScreenAdminDivers, NIVEAUX_LIST, QUALIFS_LIST });
