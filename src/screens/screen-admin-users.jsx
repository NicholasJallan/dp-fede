// DP Assistant — Administration des utilisateurs (super-administrateur uniquement).

import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { Alert, Pill } from '../components/components.jsx';
import { ConfirmDialog } from '../components/dialog.jsx';
import { formatDate } from '../components/format.js';
import { DiveListSkeleton } from './home-parts.jsx';
import { api } from '../api/api.js';
import { SUPER_ADMIN_EMAIL } from '../auth/super-admin.js';

const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function UserRow({ u, isMe, onToggleRole, onDelete }) {
  return (
    <div className="diver-admin-row">
      <div className="info">
        <b>{u.prenom ? `${u.prenom} ${u.nom}` : u.email}{isMe && <Pill tone="ink">Moi</Pill>}</b>
        <div className="meta-row">
          <Pill tone={u.role === 'admin' ? 'warn' : 'default'}>{u.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</Pill>
          <span className="muted small">{u.email}</span>
        </div>
        {u.club_nom && <span className="muted small">{u.club_nom}</span>}
        <div className="meta-row">
          <span><span className="stat">{u.nb_fiches || 0}</span> fiche{u.nb_fiches > 1 ? 's' : ''}</span>
          <span><span className="stat">{u.nb_divers || 0}</span> plongeur{u.nb_divers > 1 ? 's' : ''}</span>
          <span><span className="stat">{u.nb_sites || 0}</span> site{u.nb_sites > 1 ? 's' : ''}</span>
        </div>
        <span className="muted small">Dernière connexion : {u.last_login ? formatDate(u.last_login) : 'jamais'}</span>
      </div>
      {!isMe && (
        <div className="diver-admin-actions">
          <button type="button" className="btn" onClick={onToggleRole}>
            {u.role === 'admin' ? 'Retirer l\'administration' : 'Nommer administrateur'}
          </button>
          <button type="button" className="btn danger" onClick={onDelete}>Supprimer</button>
        </div>
      )}
    </div>
  );
}

function ScreenAdminUsers() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const isSuperAdmin = me?.email === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return; }
    api.users.stats().then(setStats).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div>
        <div className="page-head"><h1>Utilisateurs</h1></div>
        <Alert tone="info">Section réservée au super-administrateur.</Alert>
      </div>
    );
  }

  const toggleRole = async (u) => {
    const role = u.role === 'admin' ? 'user' : 'admin';
    try {
      await api.users.setRole(u.id, role);
      setStats(prev => prev.map(x => (x.id === u.id ? { ...x, role } : x)));
    } catch (err) { setError(err.message); }
  };

  const onDelete = async (id) => {
    try {
      await api.users.delete(id);
      setStats(prev => prev.filter(u => u.id !== id));
      setConfirmDelete(null);
    } catch (err) { setError(err.message); setConfirmDelete(null); }
  };

  const total = (k) => stats.reduce((s, u) => s + (u[k] || 0), 0);

  return (
    <div>
      <div className="page-head">
        <h1>Utilisateurs</h1>
        <p>{plural(stats.length, 'compte')}, {plural(total('nb_fiches'), 'fiche')}, {plural(total('nb_divers'), 'plongeur')}, {plural(total('nb_sites'), 'site')}.</p>
      </div>
      {error && <Alert tone="err">{error}</Alert>}
      <div className="diver-admin-list">
        {loading && <DiveListSkeleton rows={3} />}
        {stats.map(u => (
          <UserRow key={u.id} u={u} isMe={u.id === me?.id}
            onToggleRole={() => toggleRole(u)} onDelete={() => setConfirmDelete(u)} />
        ))}
        {!loading && stats.length === 0 && <p className="empty">Aucun utilisateur.</p>}
      </div>

      {confirmDelete && (
        <ConfirmDialog title={`Supprimer ${confirmDelete.email} ?`} danger confirmLabel="Supprimer le compte"
          onCancel={() => setConfirmDelete(null)} onConfirm={() => onDelete(confirmDelete.id)}>
          <p>Toutes les données de ce compte (plongeurs, sites, archives) seront supprimées définitivement.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export { ScreenAdminUsers, SUPER_ADMIN_EMAIL };
