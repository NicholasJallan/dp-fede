// DP Assistant — Administration des sites de plongée

import React, { useState } from 'react';
import { Alert, Pill } from '../components/components.jsx';
import { ConfirmDialog } from '../components/dialog.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { DiveListSkeleton } from './home-parts.jsx';
import { api } from '../api/api.js';
import { useClub } from '../club/club-context.jsx';

import { SiteFormModal } from './sites/site-form-modal.jsx';
import { flagEmoji } from './sites/map-picker.jsx';

function ScreenAdminSites({ sites, setSites, sitesLoaded }) {
  const club = useClub();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loading = !sitesLoaded;

  const openNew = () => setEditing('new');
  const openEdit = (s) => setEditing(s);
  const closeModal = () => {
    setEditing(null);
    setError('');
  };

  const siteToForm = (s) => ({
    nom: s.nom,
    milieu: s.milieu || 'En mer',
    profondeur_max: s.profondeur_max != null ? String(s.profondeur_max) : '',
    coordonnees: s.coordonnees || null,
    notes: s.notes || '',
    depart_bord: !!s.depart_bord,
    depart_bateau: !!s.depart_bateau,
    shot_line: !!s.shot_line,
    ville: s.ville || '',
    pays: s.pays || '',
    pays_code: s.pays_code || '',
    region: s.region || '',
    acces_secours: s.acces_secours || '',
    caisson: s.caisson || '',
  });

  const onSave = async (payload) => {
    if (editing === 'new') {
      const s = await api.sites.create(payload);
      setSites((prev) => [...prev, s].sort((a, b) => a.nom.localeCompare(b.nom)));
    } else {
      const s = await api.sites.update(editing.id, payload);
      setSites((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    }
  };

  const onDelete = async (id) => {
    try {
      await api.sites.delete(id);
      setSites((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
    setConfirmDelete(null);
  };

  const canWrite = club.can('sites.write');
  const filtered = sites.filter((s) => {
    const f = filter.toLowerCase();
    return !f || s.nom.toLowerCase().includes(f) || (s.milieu || '').toLowerCase().includes(f);
  });

  return (
    <div>
      <div className="page-head">
        <h1>Sites de plongée</h1>
        <p>
          {sites.length} site{sites.length > 1 ? 's' : ''} enregistré{sites.length > 1 ? 's' : ''}.
        </p>
      </div>
      {error && <Alert tone="err">{error}</Alert>}
      <div className="toolbar">
        <label className="sr-only" htmlFor="sites-search">
          Rechercher un site
        </label>
        <input
          id="sites-search"
          className="input"
          type="search"
          placeholder="Nom ou milieu"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {canWrite && (
          <button type="button" className="btn primary" onClick={openNew}>
            <Icon.Plus />
            Nouveau site
          </button>
        )}
      </div>
      <div className="diver-admin-list">
        {loading && <DiveListSkeleton rows={3} />}
        {filtered.map((s) => (
          <div className="diver-admin-row" key={s.id}>
            <div className="info">
              <b>
                {s.nom}
                {s._pending && (
                  <span className="pending-dot" title="Pas encore synchronisé">
                    <StatusIcon tone="warn" />
                    en attente d'envoi
                  </span>
                )}
                {s.ville && (
                  <span className="muted small">
                    {flagEmoji(s.pays_code)} {s.ville}
                    {s.pays ? `, ${s.pays}` : ''}
                  </span>
                )}
              </b>
              <div className="meta-row">
                {s.milieu && <Pill>{s.milieu}</Pill>}
                {s.depart_bord && <Pill>Bord</Pill>}
                {s.depart_bateau && <Pill>Bateau</Pill>}
                {s.shot_line && <Pill>Shot-line</Pill>}
                {s.profondeur_max != null && <Pill>{s.profondeur_max} m max</Pill>}
                {s.coordonnees?.lat && (
                  <a
                    className="small num"
                    href={`https://www.google.com/maps?q=${s.coordonnees.lat},${s.coordonnees.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {Number(s.coordonnees.lat).toFixed(4)}, {Number(s.coordonnees.lng).toFixed(4)}
                  </a>
                )}
              </div>
              {s.notes && <span className="muted small">{s.notes}</span>}
            </div>
            {canWrite && (
              <div className="diver-admin-actions">
                <button type="button" className="btn" onClick={() => openEdit(s)}>
                  <Icon.Edit />
                  Modifier
                </button>
                <button
                  type="button"
                  className="btn danger icon"
                  aria-label={`Supprimer ${s.nom}`}
                  onClick={() => setConfirmDelete(s)}
                >
                  <Icon.Trash />
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <b>{sites.length === 0 ? 'Aucun site enregistré' : 'Aucun site ne correspond'}</b>
            <span>
              {sites.length === 0
                ? 'Ajoutez vos sites avec leur plan de secours : il sera repris sur la fiche.'
                : 'Modifiez la recherche.'}
            </span>
          </div>
        )}
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
        <ConfirmDialog
          title={`Supprimer « ${confirmDelete.nom} » ?`}
          danger
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => onDelete(confirmDelete.id)}
        >
          <p>Le site sera retiré de la liste. Les plongées archivées ne sont pas modifiées.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export { ScreenAdminSites };
