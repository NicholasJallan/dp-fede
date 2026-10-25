// DP Assistant — Annuaire des plongeurs du club : alertes (CACI, licences,
// autorisations parentales), import CSV, fiches. Écriture réservée aux
// rôles responsable / dp (divers.write).

import React, { useState } from 'react';
import { Alert, Pill, diverFullName } from '../components/components.jsx';
import { ConfirmDialog, Dialog } from '../components/dialog.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { formatDate, parseDateLike } from '../components/format.js';
import { gasQualSummary } from '../domain/index.js';
import {
  DiverFormFields,
  diverToForm,
  emptyDiver,
  formToPayload,
  useDiverForm,
  validateDiverForm,
  NIVEAUX_PLONGEUR,
  NIVEAUX_ENCADRANT,
  sourceLabel,
} from '../components/diver-form.jsx';
import { DiveListSkeleton } from './home-parts.jsx';
import { AlertsPanel } from './alerts/club-alerts.jsx';
import { api } from '../api/api.js';
import { useClub } from '../club/club-context.jsx';
import { useClubAlerts } from '../club/use-club-alerts.js';
import { describeApiError, roleLabel } from '../club/permissions.js';

// Validité du certificat médical : un an après la date d'émission.
function medicalExpiry(d) {
  const issued = parseDateLike(d.medical);
  if (!issued) return null;
  const exp = new Date(issued);
  exp.setFullYear(exp.getFullYear() + 1);
  return exp;
}

function DiverEditDialog({ editing, onClose, onSaved }) {
  const f = useDiverForm(editing === 'new' ? emptyDiver() : diverToForm(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const problem = validateDiverForm(f.form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = formToPayload(f.form);
      const d = editing === 'new' ? await api.divers.create(payload) : await api.divers.update(editing.id, payload);
      onSaved(d, editing === 'new');
      onClose();
    } catch (err) {
      setError(describeApiError(err, "modifier l'annuaire"));
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={editing === 'new' ? 'Nouveau plongeur' : `Modifier ${diverFullName(editing)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      {error && <Alert tone="err">{error}</Alert>}
      <DiverFormFields f={f} />
    </Dialog>
  );
}

function QualPills({ d }) {
  return (
    <>
      <Pill tone={d.niveau_encadrant ? 'ink' : 'default'}>{d.niveau_encadrant || d.niveau_plongeur || 'Débutant'}</Pill>
      {gasQualSummary(d).map((q) => (
        <Pill key={q}>{q}</Pill>
      ))}
      {(d.recycleurs || []).length > 0 && <Pill>CCR</Pill>}
      {d.rifap && <Pill>RIFAP</Pill>}
      {d.tiv && <Pill>TIV</Pill>}
      {d.licence && <span className="num muted small">{d.licence}</span>}
      {d.source && d.source !== 'manuel' && <span className="muted small source-tag">{sourceLabel(d.source)}</span>}
    </>
  );
}

function DiverRow({ d, canWrite, onEdit, onDelete }) {
  const exp = medicalExpiry(d);
  const expired = exp && exp < new Date();
  return (
    <div className="diver-admin-row">
      <div className="info">
        <b>
          {diverFullName(d)}
          {d._pending && (
            <span className="pending-dot" title="Pas encore synchronisé">
              <StatusIcon tone="warn" />
              en attente d'envoi
            </span>
          )}
        </b>
        <div className="meta-row">
          <QualPills d={d} />
        </div>
        {exp && (
          <span className={`small ${expired ? 'text-err' : 'muted'}`}>
            {expired && <StatusIcon tone="err" />} Certificat médical du {formatDate(d.medical)},{' '}
            {expired ? 'expiré le' : "valable jusqu'au"} {formatDate(exp)}
          </span>
        )}
      </div>
      {canWrite && (
        <div className="diver-admin-actions">
          <button type="button" className="btn" onClick={onEdit}>
            <Icon.Edit />
            Modifier
          </button>
          <button
            type="button"
            className="btn danger icon"
            aria-label={`Supprimer ${diverFullName(d)}`}
            onClick={onDelete}
          >
            <Icon.Trash />
          </button>
        </div>
      )}
    </div>
  );
}

function ScreenAdminDivers({ divers, setDivers, diversLoaded, onNavigate }) {
  const club = useClub();
  const alerts = useClubAlerts();
  const canWrite = club.can('divers.write');
  const canImport = club.can('divers.import');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const onSaved = (d, isNew) =>
    setDivers((prev) =>
      isNew ? [...prev, d].sort((a, b) => a.nom.localeCompare(b.nom)) : prev.map((x) => (x.id === d.id ? d : x)),
    );

  const onDelete = async (id) => {
    try {
      await api.divers.delete(id);
      setDivers((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(describeApiError(err, "modifier l'annuaire"));
    }
    setConfirmDelete(null);
  };

  const editById = (id) => {
    const d = divers.find((x) => x.id === id);
    if (d) setEditing(d);
    else setError('Fiche introuvable sur cet appareil : synchronisez puis réessayez.');
  };

  const q = filter.trim().toLowerCase();
  const filtered = divers.filter(
    (d) =>
      !q ||
      d.nom.toLowerCase().includes(q) ||
      (d.prenom || '').toLowerCase().includes(q) ||
      (d.niveau_encadrant || d.niveau_plongeur || '').toLowerCase().includes(q) ||
      (d.licence || '').toLowerCase().includes(q),
  );

  return (
    <div>
      <div className="page-head">
        <h1>Annuaire des plongeurs</h1>
        <p>
          {divers.length} plongeur{divers.length > 1 ? 's' : ''} enregistré{divers.length > 1 ? 's' : ''}.
        </p>
      </div>
      {error && <Alert tone="err">{error}</Alert>}
      {alerts.allowed && <AlertsPanel data={alerts.data} canEdit={canWrite} onEdit={editById} />}
      {!canWrite && (
        <Alert tone="info">
          Consultation : votre rôle ({roleLabel(club.role)}) ne permet pas de modifier l'annuaire.
        </Alert>
      )}
      <div className="toolbar">
        <label className="sr-only" htmlFor="divers-search">
          Rechercher un plongeur
        </label>
        <input
          id="divers-search"
          className="input"
          type="search"
          placeholder="Nom, niveau ou licence"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {canImport && (
          <button type="button" className="btn" onClick={() => onNavigate('import-divers')}>
            <Icon.Upload />
            Importer un fichier
          </button>
        )}
        {canWrite && (
          <button type="button" className="btn primary" onClick={() => setEditing('new')}>
            <Icon.Plus />
            Nouveau plongeur
          </button>
        )}
      </div>
      <div className="diver-admin-list">
        {!diversLoaded && <DiveListSkeleton rows={3} />}
        {filtered.map((d) => (
          <DiverRow
            key={d.id}
            d={d}
            canWrite={canWrite}
            onEdit={() => setEditing(d)}
            onDelete={() => setConfirmDelete(d)}
          />
        ))}
        {diversLoaded && filtered.length === 0 && (
          <div className="empty-state">
            <b>{divers.length === 0 ? 'Annuaire vide' : 'Aucun plongeur ne correspond'}</b>
            <span>
              {divers.length === 0
                ? "Ajoutez les plongeurs du club, ou importez l'export VPDive, pour composer les palanquées."
                : 'Modifiez la recherche.'}
            </span>
          </div>
        )}
      </div>

      {editing !== null && <DiverEditDialog editing={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Supprimer ${diverFullName(confirmDelete)} ?`}
          danger
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => onDelete(confirmDelete.id)}
        >
          <p>Le plongeur sera retiré de l'annuaire. Les plongées archivées ne sont pas modifiées.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export { ScreenAdminDivers, NIVEAUX_PLONGEUR, NIVEAUX_ENCADRANT };
