// DP Assistant — Administration des utilisateurs (super-admin nicholas.jallan@gmail.com uniquement)

const SUPER_ADMIN_EMAIL = 'nicholas.jallan@gmail.com';

function ScreenAdminUsers() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isSuperAdmin = me?.email === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return; }
    api.users.stats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div>
        <div className="page-head">
          <div className="eyebrow">Administration</div>
          <h1>Utilisateurs</h1>
        </div>
        <Alert tone="info">Section réservée au super-administrateur.</Alert>
      </div>
    );
  }

  const toggleRole = async (u) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    try {
      await api.users.setRole(u.id, newRole);
      setStats(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (id) => {
    try {
      await api.users.delete(id);
      setStats(prev => prev.filter(u => u.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Totaux
  const totalDivers = stats.reduce((s, u) => s + (u.nb_divers || 0), 0);
  const totalSites  = stats.reduce((s, u) => s + (u.nb_sites  || 0), 0);
  const totalFiches = stats.reduce((s, u) => s + (u.nb_fiches || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Administration</div>
        <h1>Utilisateurs</h1>
        <p>{stats.length} compte{stats.length !== 1 ? 's' : ''} · {totalFiches} fiche{totalFiches !== 1 ? 's' : ''} · {totalDivers} plongeur{totalDivers !== 1 ? 's' : ''} · {totalSites} site{totalSites !== 1 ? 's' : ''}.</p>
      </div>

      {error && <Alert tone="warn">{error}</Alert>}
      {loading && <div className="muted">Chargement…</div>}

      <div className="diver-admin-list">
        {stats.map(u => (
          <div className="diver-admin-row" key={u.id}>
            <div className="info">
              <b>{u.prenom ? `${u.prenom} ${u.nom}` : u.email}</b>
              <div className="meta-row">
                <Pill tone={u.role === 'admin' ? 'coral' : 'ink'}>{u.role}</Pill>
                <span className="muted" style={{ fontSize: 12 }}>{u.email}</span>
              </div>
              {u.club_nom && <small className="muted">{u.club_nom}</small>}
              <div className="meta-row" style={{ marginTop: 6, gap: 12 }}>
                <span><b>{u.nb_fiches || 0}</b> <span className="muted" style={{ fontSize: 11 }}>fiche{u.nb_fiches !== 1 ? 's' : ''}</span></span>
                <span><b>{u.nb_divers || 0}</b> <span className="muted" style={{ fontSize: 11 }}>plongeur{u.nb_divers !== 1 ? 's' : ''}</span></span>
                <span><b>{u.nb_sites || 0}</b> <span className="muted" style={{ fontSize: 11 }}>site{u.nb_sites !== 1 ? 's' : ''}</span></span>
              </div>
              <small className="muted" style={{ marginTop: 4 }}>
                Dernière connexion : {u.last_login ? new Date(u.last_login).toLocaleDateString('fr-FR') : 'jamais'}
              </small>
            </div>
            {u.id !== me?.id && (
              <div className="diver-admin-actions">
                <button className="btn ghost" onClick={() => toggleRole(u)}>
                  {u.role === 'admin' ? '→ user' : '→ admin'}
                </button>
                <button className="btn ghost err" onClick={() => setConfirmDelete(u)}>Supprimer</button>
              </div>
            )}
            {u.id === me?.id && <Pill tone="marine">Moi</Pill>}
          </div>
        ))}
        {!loading && stats.length === 0 && <div className="empty">Aucun utilisateur.</div>}
      </div>

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head"><h3>Supprimer {confirmDelete.email} ?</h3></div>
            <div className="modal-body">
              <p>Toutes les données de cet utilisateur (plongeurs, sites, archives) seront supprimées.</p>
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

Object.assign(window, { ScreenAdminUsers, SUPER_ADMIN_EMAIL });
