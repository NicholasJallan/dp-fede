// DP Assistant — Étape 5 : archiver la plongée (PDF serveur + Google Drive).
//
// « Archivée » n'est affiché que lorsque le serveur a confirmé le passage à
// status 'archived' (cf. useArchiveConfirmation). Sinon : « en attente de
// synchronisation », ou refus du serveur avec son motif et Réessayer.
// Le dépôt Drive n'est pas un kind d'outbox : en cas d'échec, il est relancé
// depuis l'accueil (finalizePendingDrive).

import React, { useState, useEffect, useCallback } from 'react';
import { useToasts } from '../components/toast.jsx';
import { useOnline } from '../offline/use-online.jsx';
import { Notice } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { formatDateTime } from '../components/format.js';
import { api } from '../api/api.js';
import { getDriveToken, isGisAvailable } from '../api/google-drive.js';
import { driveGetOrCreateFolder, driveUploadFile } from '../api/drive-upload.js';
import { useArchiveConfirmation } from './archive/use-archive-confirmation.js';

// Noms de fichiers : date-heure en tête pour un tri naturel dans Drive.
function buildFilename(answers, type, siteNom) {
  const dt = answers.date || '';
  const time = dt.length >= 16 ? dt.slice(11, 16).replace(':', 'h') : '';
  const site = (siteNom || answers.site_nom || answers.site || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
  return `${dt.slice(0, 10)}${time ? `-${time}` : ''}-${type}-${site}.pdf`;
}

// Palanquées enrichies des noms et licences (l'archive reste lisible même si
// l'annuaire change ensuite).
function enrichPalanquees(palanquees, divers) {
  const byId = Object.fromEntries(divers.map(d => [d.id, d]));
  return palanquees.map(p => ({
    ...p,
    membres: (p.membres || []).map(m => {
      const d = byId[m.diverId] || {};
      return { ...m, nom: d.nom || m.nom || '?', prenom: d.prenom || m.prenom || '', licence: d.licence || '' };
    }),
  }));
}

function archivePayload(props, extra = {}) {
  const { answers, palanquees, divers, pressions, realises, heuresDebut, heuresFin, checked, comments } = props;
  return {
    status: 'archived',
    closed_at: new Date().toISOString(),
    site_nom: answers.site_nom || answers.site || '',
    dp_nom: answers.dp_nom || '',
    dp_qual: answers.dp_qual || '',
    activite: answers.activite || '',
    date_plongee: answers.date || '',
    answers,
    palanquees: enrichPalanquees(palanquees, divers),
    render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
    ...extra,
  };
}

const STEPS = [
  { id: 'requesting', label: 'Autorisation Google Drive' },
  { id: 'generating', label: 'Génération des PDF (fiche et check-list)' },
  { id: 'uploading',  label: 'Envoi vers Google Drive' },
  { id: 'saving',     label: 'Enregistrement de l\'archive' },
];

function ProgressSteps({ status }) {
  const current = STEPS.findIndex(s => s.id === status);
  if (current < 0) return null;
  return (
    <ol className="progress-steps" aria-label="Avancement de l'archivage">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i < current ? 'is-done' : i === current ? 'is-current' : ''}
          aria-current={i === current ? 'step' : undefined}>
          <span className="num">{i < current ? <Icon.Check /> : i + 1}</span>{s.label}
          {i === current && <span className="spin" aria-hidden="true"><Icon.Refresh /></span>}
        </li>
      ))}
    </ol>
  );
}

function ConfirmationNotice({ conf, driveLinks, onRearchive, onStartNew }) {
  const newDive = <button type="button" className="btn primary" onClick={onStartNew}><Icon.Plus />Nouvelle plongée</button>;
  switch (conf.state) {
    case 'confirmed': {
      const fiche = driveLinks.fiche || conf.driveLink;
      return (
        <Notice tone="ok" live title="Plongée archivée, confirmée par le serveur"
          actions={<>
            {fiche && <a className="btn" href={fiche} target="_blank" rel="noopener noreferrer"><Icon.External />Fiche sur Drive</a>}
            {driveLinks.checklist && <a className="btn" href={driveLinks.checklist} target="_blank" rel="noopener noreferrer"><Icon.External />Check-list sur Drive</a>}
            {newDive}
          </>}>
          <p>{fiche ? 'La fiche et la check-list sont déposées dans le dossier dp-fede.' : 'Le dépôt Google Drive reste à faire depuis l\'accueil.'}</p>
        </Notice>
      );
    }
    case 'review':
      return (
        <Notice tone="err" live title="Archivage refusé par le serveur"
          actions={<><button type="button" className="btn primary" onClick={conf.retry}><Icon.Refresh />Réessayer</button>{newDive}</>}>
          <p><b>Motif :</b> {conf.error}</p>
          <p>La plongée reste sur cet appareil. Corrigez si besoin puis réessayez.</p>
        </Notice>
      );
    case 'rejected':
      return (
        <Notice tone="err" live title="Archivage non enregistré"
          actions={<button type="button" className="btn primary" onClick={onRearchive}><Icon.Refresh />Relancer l'archivage</button>}>
          <p>{conf.error}</p>
        </Notice>
      );
    case 'offline':
      return (
        <Notice tone="warn" live title="Hors ligne : archivage en attente de synchronisation" actions={newDive}>
          <p>L'archive est enregistrée sur cet appareil. Elle sera envoyée au retour du réseau ; la fiche PDF et le dépôt Drive se font ensuite depuis l'accueil.</p>
        </Notice>
      );
    default:
      return (
        <Notice tone="info" live title="Archivage en attente de synchronisation" actions={newDive}>
          <p>Envoi au serveur en cours. Cette page se met à jour dès sa confirmation.</p>
          {conf.error && <p className="small">Dernière erreur : {conf.error}</p>}
        </Notice>
      );
  }
}

function useArchiveFlow(props) {
  const { answers, diveId, onArchiveDone } = props;
  const { showToast } = useToasts();
  const [status, setStatus] = useState('idle');
  const [driveLinks, setDriveLinks] = useState({ fiche: '', checklist: '' });
  const [error, setError] = useState('');

  const saveLocal = useCallback(async () => {
    setError('');
    try {
      if (diveId) await api.dives.update(diveId, archivePayload(props));
      else await api.dives.create({ ...archivePayload(props), drive_link: '', date_plongee: (answers.date || '').slice(0, 10) });
      setStatus('queued');
      onArchiveDone?.();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [props, diveId, answers.date, onArchiveDone]);

  const withToken = async (token) => {
    try {
      // Le serveur doit avoir l'état à jour avant de rendre le PDF : un échec
      // arrête l'archivage (pas de PDF réglementaire incomplet).
      const { palanquees, pressions, realises, heuresDebut, heuresFin, checked, comments } = props;
      if (diveId) await api.dives.pushNow(diveId, { answers, palanquees, render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments } });
      setStatus('generating');
      const fichePdf = await api.pdf.blob(diveId, 'fiche');
      const checklistPdf = await api.pdf.blob(diveId, 'checklist');
      setStatus('uploading');
      let ficheFile, clFile;
      try {
        const folderId = await driveGetOrCreateFolder(token, 'dp-fede');
        ficheFile = await driveUploadFile(token, fichePdf, buildFilename(answers, 'fiche-securite'), folderId);
        clFile = await driveUploadFile(token, checklistPdf, buildFilename(answers, 'checklist'), folderId);
      } catch {
        showToast({ tone: 'warn', title: 'Google Drive inaccessible', body: 'Archive enregistrée sans dépôt. Relancez le dépôt depuis l\'accueil.' });
        await saveLocal();
        return;
      }
      setStatus('saving');
      await api.dives.update(diveId, archivePayload(props, { drive_link: ficheFile.webViewLink || '' }));
      setDriveLinks({ fiche: ficheFile.webViewLink || '', checklist: clFile.webViewLink || '' });
      setStatus('done');
      onArchiveDone?.();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const archiveWithDrive = async () => {
    if (!diveId) { await saveLocal(); return; }
    if (!isGisAvailable || !isGisAvailable()) {
      setError('Connexion Google indisponible. Rechargez la page ou archivez sans dépôt Drive.');
      setStatus('error');
      return;
    }
    setStatus('requesting'); setError('');
    try {
      withToken(await getDriveToken({ explicit: false, timeoutMs: 15000 }));
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return { status, error, driveLinks, saveLocal, archiveWithDrive };
}

// Plongée déjà archivée avant l'arrivée sur l'écran (ouverte depuis l'historique) ?
function useAlreadyArchived(diveId) {
  const [state, setState] = useState({ checked: false, archived: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let archived = false;
      if (diveId) {
        try { archived = (await api.dives.get(diveId))?.status === 'archived'; }
        catch (err) { console.warn('[DP] état d\'archivage indisponible :', err.message); }
      }
      if (!cancelled) setState({ checked: true, archived });
    })();
    return () => { cancelled = true; };
  }, [diveId]);
  return state;
}

function ScreenArchive(props) {
  const { answers, palanquees, onStartNew, diveId } = props;
  const online = useOnline();
  const flow = useArchiveFlow(props);
  const already = useAlreadyArchived(diveId);
  const recorded = already.archived || flow.status === 'queued' || flow.status === 'done';
  const conf = useArchiveConfirmation(diveId, recorded);

  // Archivage automatique à l'arrivée et au retour en ligne.
  useEffect(() => {
    if (!already.checked || already.archived) return;
    if (online && (flow.status === 'idle' || flow.status === 'error')) flow.archiveWithDrive();
  }, [already.checked, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const plongeurs = palanquees.reduce((n, p) => n + (p.membres || []).length, 0);

  return (
    <div>
      <div className="page-head">
        <p className="step-tag"><span className="num">5</span>Archivage</p>
        <h1>Archiver la plongée</h1>
        <p>La fiche de sécurité et la check-list sont générées en PDF puis déposées dans votre Google Drive (dossier <code>dp-fede</code>).</p>
      </div>

      <section className="card" aria-labelledby="archive-state">
        <div className="card-head"><h2 id="archive-state">État de l'archivage</h2></div>
        <div className="card-body stack">
          <ProgressSteps status={flow.status} />
          {flow.status === 'error' && (
            <Notice tone="warn" live title="Archivage interrompu"
              actions={<>
                <button type="button" className="btn primary" onClick={flow.archiveWithDrive} disabled={!online}><Icon.Refresh />Réessayer avec Drive</button>
                <button type="button" className="btn" onClick={flow.saveLocal}>Archiver sans Drive</button>
              </>}>
              <p>{flow.error}</p>
            </Notice>
          )}
          {!online && flow.status === 'idle' && !already.archived && (
            <Notice tone="warn" title="Hors ligne"
              actions={<button type="button" className="btn primary" onClick={flow.saveLocal}>Archiver sur cet appareil</button>}>
              <p>Le PDF et le dépôt Drive demandent une connexion. L'archive sera envoyée automatiquement au retour du réseau.</p>
            </Notice>
          )}
          {recorded && (
            <ConfirmationNotice conf={conf} driveLinks={flow.driveLinks} onRearchive={flow.saveLocal} onStartNew={onStartNew} />
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="archive-files">
        <div className="card-head"><h2 id="archive-files">Contenu de l'archive</h2></div>
        <div className="card-body">
          <div className="kv-rows">
            <div><span className="k">Fiche de sécurité</span><span className="v num wrap-anywhere">{buildFilename(answers, 'fiche-securite')}</span></div>
            <div><span className="k">Check-list</span><span className="v num wrap-anywhere">{buildFilename(answers, 'checklist')}</span></div>
            <div><span className="k">Site</span><span className="v">{answers.site_nom || answers.site || '—'}</span></div>
            <div><span className="k">Date</span><span className="v">{formatDateTime(answers.date)}</span></div>
            <div><span className="k">DP</span><span className="v">{answers.dp_nom || '—'} ({answers.dp_qual || '—'})</span></div>
            <div><span className="k">Palanquées</span><span className="v">{palanquees.length} palanquée{palanquees.length > 1 ? 's' : ''}, {plongeurs} plongeur{plongeurs > 1 ? 's' : ''}</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// finalizePendingDrive — plongées archivées hors ligne dont le PDF + le dépôt
// Drive sont produits a posteriori (appelé depuis l'accueil).
//   archive : entrée offlineStore.dives (synced, !drive_synced, status archived)
// Rendu PDF délégué au serveur (C1.2), dépôt Drive, puis PATCH drive_link.
// ---------------------------------------------------------------------------
async function finalizePendingDrive(archive, divers, user, onProgress) {
  if (!isGisAvailable || !isGisAvailable()) throw new Error('Connexion Google indisponible : rechargez la page.');
  if (!archive.server_id) throw new Error('Archive pas encore synchronisée avec le serveur : réessayez plus tard.');
  const answers = typeof archive.answers === 'string' ? JSON.parse(archive.answers) : (archive.answers || {});

  onProgress?.('génération des PDF');
  const fichePdf = await api.pdf.blob(archive.server_id, 'fiche');
  const checklistPdf = await api.pdf.blob(archive.server_id, 'checklist');
  onProgress?.('autorisation Google');
  const token = await getDriveToken({ explicit: false, timeoutMs: 15000 });
  onProgress?.('envoi');
  const folderId = await driveGetOrCreateFolder(token, 'dp-fede');
  const ficheFile = await driveUploadFile(token, fichePdf, buildFilename(answers, 'fiche-securite', archive.site_nom), folderId);
  await driveUploadFile(token, checklistPdf, buildFilename(answers, 'checklist', archive.site_nom), folderId);
  onProgress?.('enregistrement');
  await api.dives.markDriveDone(archive.client_uuid, ficheFile.webViewLink || '');
  return ficheFile.webViewLink || '';
}

export { ScreenArchive, finalizePendingDrive };
