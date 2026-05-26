// DP Assistant — Administration des utilisateurs (admin seulement)

function ScreenAdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleRole = async (u) => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    try {
      await api.users.setRole(u.id, newRole);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (id) => {
    try {
      await api.users.delete(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Administration</div>
        <h1>Utilisateurs</h1>
        <p>{users.length} compte{users.length !== 1 ? 's' : ''} actif{users.length !== 1 ? 's' : ''}.</p>
      </div>

      {error && <Alert tone="warn">{error}</Alert>}
      {loading && <div className="muted">Chargement…</div>}

      <div className="diver-admin-list">
        {users.map(u => (
          <div className="diver-admin-row" key={u.id}>
            <div className="info">
              <b>{u.prenom ? `${u.prenom} ${u.nom}` : u.email}</b>
              <div className="meta-row">
                <Pill tone={u.role === 'admin' ? 'coral' : 'ink'}>{u.role}</Pill>
                <span className="muted" style={{ fontSize: 12 }}>{u.email}</span>
              </div>
              {u.club_nom && <small className="muted">{u.club_nom}{u.club_numero ? ` · ${u.club_numero}` : ''}</small>}
              <small className="muted">Dernière connexion : {u.last_login ? new Date(u.last_login).toLocaleDateString('fr-FR') : 'jamais'}</small>
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
        {!loading && users.length === 0 && <div className="empty">Aucun utilisateur.</div>}
      </div>

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-head"><h3>Supprimer {confirmDelete.email} ?</h3></div>
            <div className="modal-body">
              <p>Toutes les données de cet utilisateur (plongeurs, sites) seront supprimées.</p>
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

Object.assign(window, { ScreenAdminUsers });
