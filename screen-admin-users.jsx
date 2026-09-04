// DP Assistant — Administration des utilisateurs (super-admin nicholas.jallan@gmail.com uniquement)

import React, { useState, useEffect } from 'react';
import { useAuth } from './auth-context.jsx';
import { Alert, Pill } from './components.jsx';

const SUPER_ADMIN_EMAIL = 'nicholas.jallan@gmail.com';

function ScreenAdminUsers() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Structures partagées : un stage / club dont les membres mettent en commun
  // annuaire, sites et fiches. Créer une structure = une ligne + un code.
  const [workspaces, setWorkspaces] = useState([]);
  const [wsForm, setWsForm] = useState({ name: '', join_code: '' });
  const [wsBusy, setWsBusy] = useState(false);
  const [wsError, setWsError] = useState('');

  const isSuperAdmin = me?.email === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return; }
    api.users.stats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    api.workspaces.all().then(setWorkspaces).catch(() => {});
  }, [isSuperAdmin]);

  async function createWorkspace(ev) {
    ev.preventDefault();
    setWsError(''); setWsBusy(true);
    try {
      const ws = await api.workspaces.create({
        name: wsForm.name.trim(),
        join_code: wsForm.join_code.trim().toUpperCase(),
      });
      setWorkspaces(list => [ws, ...list]);
      setWsForm({ name: '', join_code: '' });
    } catch (e) {
      setWsError(e.message);
    } finally {
      setWsBusy(false);
    }
  }

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

      <div className="card">
        <div className="card-head"><h2>Structures partagées</h2>
          <span className="hint">{workspaces.length} structure{workspaces.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Les membres d'une structure partagent le même annuaire de plongeurs,
            les mêmes sites et les mêmes fiches de sécurité. Ils la rejoignent
            avec le code d'invitation, à la connexion.
          </p>

          {workspaces.map(ws => (
            <div className="diver-admin-row" key={ws.id}>
              <div className="info">
                <b>{ws.name}</b>
                <div className="meta-row">
                  <Pill tone="marine">{ws.join_code}</Pill>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {ws.members_count} membre{ws.members_count !== 1 ? 's' : ''} ·{' '}
                    {ws.divers_count || 0} plongeur{ws.divers_count !== 1 ? 's' : ''} ·{' '}
                    {ws.dives_count || 0} fiche{ws.dives_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {workspaces.length === 0 && <div className="empty">Aucune structure.</div>}

          <form onSubmit={createWorkspace} style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '2 1 200px' }}
              placeholder="Nom (ex. BEPPA Hendaye 2026)"
              value={wsForm.name}
              onChange={e => setWsForm({ ...wsForm, name: e.target.value })} />
            <input className="input" style={{ flex: '1 1 160px' }}
              placeholder="Code (ex. BEPPA-2026)"
              value={wsForm.join_code}
              autoCapitalize="characters" autoCorrect="off" spellCheck="false"
              onChange={e => setWsForm({ ...wsForm, join_code: e.target.value.toUpperCase() })} />
            <button className="btn primary" type="submit"
              disabled={wsBusy || wsForm.name.trim().length < 2 || wsForm.join_code.trim().length < 3}>
              Créer
            </button>
          </form>
          {wsError && <Alert tone="warn">{wsError}</Alert>}
        </div>
      </div>

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

export { ScreenAdminUsers, SUPER_ADMIN_EMAIL };
