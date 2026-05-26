// DP Assistant — Compte utilisateur

function ScreenAccount() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    nom: user?.nom || '',
    prenom: user?.prenom || '',
    club_nom: user?.club_nom || '',
    club_numero: user?.club_numero || '',
    club_siret: user?.club_siret || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await api.auth.update(form);
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Paramètres</div>
        <h1>Mon compte</h1>
        <p>Informations personnelles et club / association.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Identité</h2>
          <small className="muted">Connecté via Google · {user?.email}</small>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Prénom</label>
              <input className="input" value={form.prenom} onChange={e => set('prenom', e.target.value)} />
            </div>
            <div className="field">
              <label>Nom</label>
              <input className="input" value={form.nom} onChange={e => set('nom', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Club / Association</h2></div>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label>Nom de la structure</label>
            <input className="input" value={form.club_nom} onChange={e => set('club_nom', e.target.value)}
              placeholder="Club de Plongée XYZ / ACSMJ 29" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Numéro de club FFESSM</label>
              <input className="input" value={form.club_numero} onChange={e => set('club_numero', e.target.value)}
                placeholder="A-29-001" />
            </div>
            <div className="field">
              <label>SIRET / Numéro d'entreprise</label>
              <input className="input" value={form.club_siret} onChange={e => set('club_siret', e.target.value)}
                placeholder="123 456 789 00012" />
            </div>
          </div>
        </div>
      </div>

      {error && <Alert tone="warn" style={{ marginTop: 12 }}>{error}</Alert>}
      {saved && <Alert tone="ok" style={{ marginTop: 12 }}>Enregistré.</Alert>}

      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        <button className="btn primary" onClick={onSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenAccount });
