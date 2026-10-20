// DP Assistant — Étape 5 : archiver la plongée.
//
// L'archivage ne dépend jamais de Google Drive : la plongée passe en
// « archived » par l'outbox (hors ligne compris) et le SERVEUR génère et
// conserve la fiche de sécurité et la check-list en PDF (A322-72, un an).
// « Archivée » n'est affiché qu'après confirmation du serveur
// (useArchiveConfirmation) ; sinon « en attente de synchronisation », ou
// refus avec son motif et Réessayer.
// La copie dans Google Drive est facultative (préférence de l'appareil,
// src/api/drive-preference.js) et faite après la confirmation ; un échec
// ne remet jamais l'archive en cause (reprise depuis ici ou l'accueil).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOnline } from '../offline/use-online.jsx';
import { offlineStore } from '../offline/offline-store.js';
import { Notice } from '../components/ui.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { formatDateTime } from '../components/format.js';
import { api } from '../api/api.js';
import { getDriveToken, isGisAvailable } from '../api/google-drive.js';
import { driveGetOrCreateFolder, driveUploadFile } from '../api/drive-upload.js';
import { useDriveExport } from '../api/drive-preference.js';
import { useArchiveConfirmation } from './archive/use-archive-confirmation.js';
import { DiveDocuments } from './archives/dive-documents.jsx';

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

function archivePayload(props) {
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
  };
}

function ConfirmationNotice({ conf, onRearchive, onStartNew }) {
  const newDive = <button type="button" className="btn primary" onClick={onStartNew}><Icon.Plus />Nouvelle plongée</button>;
  switch (conf.state) {
    case 'confirmed':
      return (
        <Notice tone="ok" live title="Plongée archivée, confirmée par le serveur" actions={newDive}>
          <p>La fiche de sécurité et la check-list sont archivées en PDF par le club (conservation d'un an, art. A322-72).</p>
        </Notice>
      );
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
          <p>L'archive est enregistrée sur cet appareil et partira au retour du réseau ; le serveur produira alors les PDF.</p>
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

// Archivage (outbox) : jamais bloqué par Google, fonctionne hors ligne.
function useArchiveFlow(props) {
  const { answers, diveId, onArchiveDone } = props;
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const archive = useCallback(async () => {
    setStatus('saving'); setError('');
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
  return { status, error, archive };
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

// Copie Drive d'une plongée archivée (confirmée par le serveur) : automatique
// une fois si la préférence est active, sinon à la demande.
function useDriveCopy({ diveId, confirmed, existingLink, enabled, online }) {
  const [copy, setCopy] = useState({ status: 'idle', step: '', link: '', error: '' });
  const run = useCallback(async () => {
    setCopy({ status: 'running', step: 'préparation', link: '', error: '' });
    try {
      const record = await offlineStore.get('dives', diveId);
      if (!record) throw new Error('Archive introuvable sur cet appareil : déposez-la depuis l\'historique.');
      const link = await finalizePendingDrive(record, [], null, (step) => setCopy(c => ({ ...c, step })));
      setCopy({ status: 'done', step: '', link, error: '' });
    } catch (err) {
      setCopy({ status: 'error', step: '', link: '', error: err.message });
    }
  }, [diveId]);
  const tried = useRef(false);
  useEffect(() => {
    if (!confirmed || existingLink || !enabled || !online || tried.current) return;
    tried.current = true;
    run();
  }, [confirmed, existingLink, enabled, online, run]);
  return { ...copy, link: copy.link || existingLink || '', run };
}

function DriveCopyCard({ copy, enabled, setEnabled, confirmed, online }) {
  return (
    <section className="card" aria-labelledby="archive-drive">
      <div className="card-head"><h2 id="archive-drive">Copie dans Google Drive</h2><span className="hint">Facultatif</span></div>
      <div className="card-body stack">
        <label className={`qualif-toggle ${enabled ? 'on' : ''}`}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Déposer automatiquement une copie dans mon Google Drive (dossier dp-fede, sur cet appareil)
        </label>
        {copy.link && (
          <p className="doc-status" role="status"><StatusIcon tone="ok" />Copie déposée dans Google Drive.
            {' '}<a className="btn" href={copy.link} target="_blank" rel="noopener noreferrer"><Icon.External />Ouvrir la fiche</a></p>
        )}
        {copy.status === 'running' && (
          <p className="doc-status" role="status"><span className="spin" aria-hidden="true"><Icon.Refresh /></span>Copie en cours : {copy.step}…</p>
        )}
        {copy.status === 'error' && (
          <Notice tone="info" live title="Copie Google Drive non effectuée"
            actions={<button type="button" className="btn" onClick={copy.run} disabled={!online}><Icon.Refresh />Réessayer la copie</button>}>
            <p>{copy.error}</p>
            <p className="small">L'archive du club n'est pas concernée. La copie peut aussi être faite plus tard depuis l'accueil.</p>
          </Notice>
        )}
        {!copy.link && copy.status === 'idle' && (
          <div className="row">
            <button type="button" className="btn" onClick={copy.run} disabled={!confirmed || !online}>
              <Icon.Upload />Déposer une copie maintenant
            </button>
            {!confirmed && <span className="small muted">Disponible une fois l'archivage confirmé par le serveur.</span>}
          </div>
        )}
      </div>
    </section>
  );
}

function ScreenArchive(props) {
  const { answers, palanquees, onStartNew, diveId } = props;
  const online = useOnline();
  const flow = useArchiveFlow(props);
  const already = useAlreadyArchived(diveId);
  const recorded = already.archived || flow.status === 'queued';
  const conf = useArchiveConfirmation(diveId, recorded);
  const confirmed = conf.state === 'confirmed';
  const [driveEnabled, setDriveEnabled] = useDriveExport();
  const copy = useDriveCopy({ diveId, confirmed, existingLink: conf.driveLink, enabled: driveEnabled, online });

  // Archivage automatique à l'arrivée (l'étape 4 a demandé confirmation),
  // en ligne comme hors ligne : l'outbox enverra au retour du réseau.
  useEffect(() => {
    if (!already.checked || already.archived) return;
    if (flow.status === 'idle') flow.archive();
  }, [already.checked]); // eslint-disable-line react-hooks/exhaustive-deps

  const plongeurs = palanquees.reduce((n, p) => n + (p.membres || []).length, 0);

  return (
    <div>
      <div className="page-head">
        <p className="step-tag"><span className="num">5</span>Archivage</p>
        <h1>Archiver la plongée</h1>
        <p>La fiche de sécurité et la check-list sont archivées en PDF par le serveur du club et conservées un an. Une copie dans votre Google Drive est possible en complément.</p>
      </div>

      <section className="card" aria-labelledby="archive-state">
        <div className="card-head"><h2 id="archive-state">État de l'archivage</h2></div>
        <div className="card-body stack">
          {flow.status === 'saving' && <p className="doc-status" role="status"><span className="spin" aria-hidden="true"><Icon.Refresh /></span>Enregistrement de l'archive…</p>}
          {flow.status === 'error' && (
            <Notice tone="warn" live title="Archivage interrompu"
              actions={<button type="button" className="btn primary" onClick={flow.archive}><Icon.Refresh />Réessayer</button>}>
              <p>{flow.error}</p>
            </Notice>
          )}
          {recorded && <ConfirmationNotice conf={conf} onRearchive={flow.archive} onStartNew={onStartNew} />}
        </div>
      </section>

      {confirmed && <DiveDocuments dive={{ id: diveId, client_uuid: diveId, documents_status: 'pending' }} />}

      <DriveCopyCard copy={copy} enabled={driveEnabled} setEnabled={setDriveEnabled} confirmed={confirmed} online={online} />

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
