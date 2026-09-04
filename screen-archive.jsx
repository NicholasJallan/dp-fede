// DP Assistant — Étape 5 : Archiver la plongée sur Google Drive

import React, { useState, useEffect, useCallback } from 'react';
import { useToasts } from './toast.jsx';
import { Alert, diverFullName, formatDateTime } from './components.jsx';

// ---------------------------------------------------------------------------
// Écran d'archivage principal
// ---------------------------------------------------------------------------
function ScreenArchive({ answers, palanquees, divers, user, pressions, realises, heuresDebut, heuresFin, checked, comments, plongeeFigee, onStartNew, onArchiveDone, diveId }) {
  const { showToast } = useToasts();
  // Session BEPPA Hendaye 2026 : pas d'archivage Google Drive, juste les PDF
  // à télécharger. cf. workspaces.php::wsSlugify('BEPPA Hendaye 2026').
  const isBeppaHendaye = user?.workspace?.slug === 'beppa-hendaye-2026';
  // ficheRef / checklistRef supprimés — PDF rendu côté serveur (C1.2)
  const [status,         setStatus]         = useState('idle');
  const [driveLinks,     setDriveLinks]     = useState({ fiche:'', checklist:'' });
  const [pdfLinks,       setPdfLinks]       = useState({ fiche:'', checklist:'' });
  const [error,          setError]          = useState('');
  // true uniquement si la plongée était déjà archivée AVANT d'arriver sur cet
  // écran (chargement depuis l'historique). Distinct de plongeeFigee qui est
  // mis à true par confirmArchive() avant la première visite sur cet écran.
  const [alreadyArchived, setAlreadyArchived] = useState(false);
  const [savedDriveLink,  setSavedDriveLink]  = useState(null);
  // Vrai une fois que init() a vérifié le statut de la plongée. Empêche
  // useEffect([online]) de déclencher doArchive() avant que init() ait
  // eu le temps de détecter une plongée déjà archivée.
  const [initialized,     setInitialized]     = useState(false);
  const online = window.useOnline ? window.useOnline() : true;

  // Enqueue offline : enregistre l'archive localement (passe via offline-api
  // qui pose un client_uuid et déclenche le sync). Le rendu PDF a besoin de
  // pressions/realises/heuresDebut/heuresFin/checked/comments — on les passe
  // dans _render pour rejouer le rendu plus tard.
  const saveOffline = useCallback(async () => {
    setError('');
    try {
      const diversById = {};
      divers.forEach(d => { diversById[d.id] = d; });
      const enrichedPals = palanquees.map(p => ({
        ...p,
        membres: (p.membres || []).map(m => {
          const d = diversById[m.diverId] || {};
          return { ...m, nom: d.nom || '?', prenom: d.prenom || '', licence: d.licence || '' };
        })
      }));

      if (diveId) {
        await api.dives.update(diveId, {
          status:       'archived',
          closed_at:    new Date().toISOString(),
          site_nom:     answers.site_nom || answers.site || '',
          dp_nom:       answers.dp_nom || '',
          dp_qual:      answers.dp_qual || '',
          activite:     answers.activite || '',
          date_plongee: answers.date || '',
          answers,
          palanquees:   enrichedPals,
          drive_synced: isBeppaHendaye,
          render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
        });
      } else {
        await api.dives.create({
          status:       'archived',
          site_nom:     answers.site_nom || answers.site || '',
          date_plongee: (answers.date || '').slice(0, 10),
          dp_nom:       answers.dp_nom || '',
          dp_qual:      answers.dp_qual || '',
          activite:     answers.activite || '',
          answers,
          palanquees:   enrichedPals,
          drive_link:   '',
          drive_synced: isBeppaHendaye,
          render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
        });
      }
      setStatus('queued');
      if (onArchiveDone) onArchiveDone();
    } catch (err) {
      setError(err.message);
    }
  }, [diveId, answers, palanquees, divers, pressions, realises, heuresDebut, heuresFin, checked, comments, onArchiveDone]);

  // Nom de fichier : date-heure en premier pour tri naturel
  const buildFilename = (type = 'fiche-securite') => {
    const dt   = answers.date || '';
    const date = dt.slice(0, 10);
    const time = dt.length >= 16 ? dt.slice(11, 16).replace(':', 'h') : '';
    const site = (answers.site_nom || answers.site || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
    return `${date}${time ? '-' + time : ''}-${type}-${site}.pdf`;
  };

  // Génération PDF via le backend (C1.2) : envoie dive_id, le serveur charge
  // les données depuis la DB et appelle wkhtmltopdf. Plus de DOM offscreen.
  const generatePdfBlob = async (type = 'fiche') => {
    if (!diveId) throw new Error('diveId requis pour la génération PDF côté serveur.');
    const csrf = window.getCsrfToken ? window.getCsrfToken() : '';
    const res  = await fetch('/api/pdf/fiche', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ dive_id: diveId, type }),
    });
    if (!res.ok) {
      const t = await res.text();
      let detail = t.slice(0, 300);
      try { const j = JSON.parse(t); if (j?.error) detail = j.error; }
      catch { /* fallback texte déjà défini */ }
      throw new Error(`PDF ${type} — HTTP ${res.status} : ${detail}`);
    }
    return await res.blob();
  };

  // Logique d'archivage une fois le token Drive obtenu.
  const proceedWithToken = async (token) => {
    try {
      // Flush immédiat du render_state avant la génération PDF : le serveur doit
      // avoir les données à jour (pressions, heures, check-list) avant de rendre.
      const csrf = window.getCsrfToken ? window.getCsrfToken() : '';
      if (diveId) {
        await fetch(`/api/dives/${diveId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments } }),
        });
      }

      setStatus('generating');
      const fichePdf     = await generatePdfBlob('fiche');
      const checklistPdf = await generatePdfBlob('checklist');

      setStatus('uploading');
      let folderId, ficheFile, clFile;
      try {
        folderId  = await window.driveGetOrCreateFolder(token, 'dp-fede');
        ficheFile = await window.driveUploadFile(token, fichePdf,     buildFilename('fiche-securite'), folderId);
        clFile    = await window.driveUploadFile(token, checklistPdf, buildFilename('checklist'),      folderId);
      } catch (driveErr) {
        // Drive inaccessible (réseau, token, quota…) — on archive localement.
        // Le dépôt Drive sera relancé depuis l'accueil via « Finaliser sur Drive ».
        showToast({
          tone: 'warn',
          title: 'Drive inaccessible',
          body: 'Plongée archivée localement. Relancez le dépôt Drive depuis l\'accueil dès que possible.',
        });
        await saveOffline();
        return;
      }

      setStatus('saving');
      const diversById = {};
      divers.forEach(d => { diversById[d.id] = d; });
      const enrichedPals = palanquees.map(p => ({
        ...p,
        membres: (p.membres || []).map(m => {
          const d = diversById[m.diverId] || {};
          return { ...m, nom: d.nom || '?', prenom: d.prenom || '', licence: d.licence || '' };
        })
      }));

      const archivePayload = {
        status:       'archived',
        closed_at:    new Date().toISOString(),
        site_nom:     answers.site_nom || answers.site || '',
        dp_nom:       answers.dp_nom || '',
        dp_qual:      answers.dp_qual || '',
        activite:     answers.activite || '',
        date_plongee: answers.date || '',
        answers,
        palanquees:   enrichedPals,
        drive_link:   ficheFile.webViewLink || '',
        render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
      };
      if (diveId) {
        await api.dives.update(diveId, archivePayload);
      } else {
        await api.dives.create(archivePayload);
      }

      setDriveLinks({ fiche: ficheFile.webViewLink || '', checklist: clFile.webViewLink || '' });
      setStatus('done');
      if (onArchiveDone) onArchiveDone();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const doArchive = async () => {
    if (!window.isGisAvailable || !window.isGisAvailable()) {
      setError('Google Identity Services non disponible — recharger la page.');
      setStatus('error');
      return;
    }
    setStatus('requesting'); setError('');

    try {
      // window.getDriveToken gère le cache (réutilise un token valide sans GIS)
      // et le timeout (15 s par défaut, en cas de popup bloqué silencieusement).
      const token = await window.getDriveToken({ explicit: false, timeoutMs: 15000 });
      proceedWithToken(token);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  // Session BEPPA Hendaye : fiche + check-list en PDF, téléchargement direct,
  // aucun appel Drive/GIS. drive_synced:true empêche le dive de réapparaître
  // dans « Finaliser sur Drive » sur l'accueil (cf. offline-api.js).
  const doPdfOnly = async () => {
    setStatus('generating'); setError('');
    try {
      const csrf = window.getCsrfToken ? window.getCsrfToken() : '';
      if (diveId) {
        await fetch(`/api/dives/${diveId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments } }),
        });
      }
      const fichePdf     = await generatePdfBlob('fiche');
      const checklistPdf = await generatePdfBlob('checklist');

      setStatus('saving');
      const diversById = {};
      divers.forEach(d => { diversById[d.id] = d; });
      const enrichedPals = palanquees.map(p => ({
        ...p,
        membres: (p.membres || []).map(m => {
          const d = diversById[m.diverId] || {};
          return { ...m, nom: d.nom || '?', prenom: d.prenom || '', licence: d.licence || '' };
        })
      }));
      const archivePayload = {
        status:       'archived',
        closed_at:    new Date().toISOString(),
        site_nom:     answers.site_nom || answers.site || '',
        dp_nom:       answers.dp_nom || '',
        dp_qual:      answers.dp_qual || '',
        activite:     answers.activite || '',
        date_plongee: answers.date || '',
        answers,
        palanquees:   enrichedPals,
        drive_synced: true,
        render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
      };
      if (diveId) {
        await api.dives.update(diveId, archivePayload);
      } else {
        await api.dives.create(archivePayload);
      }

      setPdfLinks({ fiche: URL.createObjectURL(fichePdf), checklist: URL.createObjectURL(checklistPdf) });
      setStatus('done');
      if (onArchiveDone) onArchiveDone();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  // Régénère les PDF d'une plongée déjà archivée (pas de lien sauvegardé
  // puisqu'il n'y a jamais eu d'upload Drive à mémoriser).
  const regeneratePdfs = async () => {
    setStatus('generating'); setError('');
    try {
      const fichePdf     = await generatePdfBlob('fiche');
      const checklistPdf = await generatePdfBlob('checklist');
      setPdfLinks({ fiche: URL.createObjectURL(fichePdf), checklist: URL.createObjectURL(checklistPdf) });
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  // Vérifie si la plongée est déjà archivée (visite depuis l'historique), puis
  // marque initialized=true pour débloquer le déclenchement de doArchive().
  // Ne lance PAS doArchive() directement : c'est l'effet [initialized, online]
  // ci-dessous qui s'en charge, après avoir reçu le résultat de init().
  useEffect(() => {
    async function init() {
      if (diveId) {
        try {
          const dive = await api.dives.get(diveId);
          if (dive?.status === 'archived') {
            setAlreadyArchived(true);
            if (dive.drive_link) setSavedDriveLink(dive.drive_link);
          }
        } catch {}
      }
      setInitialized(true);
    }
    init();
  }, []); // eslint-disable-line

  // Déclenchement de l'archivage : au montage (quand initialized passe à true)
  // et à chaque retour en ligne. La garde !initialized empêche tout déclenchement
  // avant que init() ait vérifié le statut de la plongée.
  useEffect(() => {
    if (!initialized) return;
    if (!alreadyArchived && online && (status === 'idle' || status === 'error')) {
      if (isBeppaHendaye) doPdfOnly(); else doArchive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, online]);

  const STATUS_MSGS = {
    requesting: '1/4 · Autorisation Google Drive…',
    generating: '2/4 · Génération des PDFs (fiche + check-list)…',
    uploading:  '3/4 · Envoi vers Google Drive…',
    saving:     '4/4 · Enregistrement de l\'archive…',
  };

  const busy = ['requesting','generating','uploading','saving'].includes(status);

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 5 / 5 · Archiver</div>
        <h1>Archiver la plongée</h1>
        <p>
          {isBeppaHendaye
            ? 'Génère la fiche de sécurité et la check-list en PDF, à télécharger directement (session BEPPA Hendaye 2026 — pas d\'archivage Google Drive).'
            : <>Génère la fiche de sécurité et la check-list en PDF et les dépose dans votre Google Drive
               (dossier <code>dp-fede</code>, créé automatiquement si absent).</>}
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h2>{isBeppaHendaye ? 'Fiche PDF' : 'Export Google Drive'}</h2></div>
        <div className="card-body" style={{ display:'grid', gap:16 }}>

          {/* Avancement */}
          {STATUS_MSGS[status] && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                          background:'var(--bg-2)', borderRadius:8, fontSize:14, color:'var(--ink-2)' }}>
              <span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>↻</span>
              {STATUS_MSGS[status]}
            </div>
          )}

          {/* Erreur → réessayer, ou archiver sans Drive (hors BEPPA Hendaye) */}
          {status === 'error' && (
            <>
              <Alert tone="warn">Erreur : {error}</Alert>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn primary" onClick={isBeppaHendaye ? doPdfOnly : doArchive}>
                  {isBeppaHendaye ? '↻ Réessayer' : '↑ Réessayer Drive'}
                </button>
                {!isBeppaHendaye && <button className="btn" onClick={saveOffline}>✓ Archiver sans Drive</button>}
              </div>
            </>
          )}

          {/* Hors ligne → file d'attente (BEPPA Hendaye : PDF nécessite aussi le réseau) */}
          {!online && status === 'idle' && (
            <div style={{
              display:'grid', gap:10, padding:'14px 16px',
              background:'rgba(224,120,86,0.08)', border:'1px solid rgba(224,120,86,0.35)',
              borderRadius:8, fontSize:14, color:'var(--ink-2)',
            }}>
              <div style={{ fontWeight:600, color:'var(--coral, #e07856)' }}>● Hors ligne</div>
              <div>
                {isBeppaHendaye
                  ? 'La génération des PDF nécessite internet (rendu côté serveur).'
                  : 'Le dépôt Drive et la génération PDF nécessitent internet.'}
                {' '}Enregistrez en file d'attente — tout sera produit automatiquement à la reconnexion.
              </div>
              <div>
                <button className="btn primary" onClick={saveOffline}>
                  {isBeppaHendaye ? '✓ Enregistrer (PDF plus tard)' : '✓ Enregistrer (Drive plus tard)'}
                </button>
              </div>
            </div>
          )}

          {/* Enregistrement local confirmé */}
          {status === 'queued' && (
            <div style={{
              display:'grid', gap:10, padding:'14px 16px',
              background:'rgba(45,134,83,0.06)', border:'1px solid rgba(45,134,83,0.3)',
              borderRadius:8, fontSize:14, color:'var(--ink-2)',
            }}>
              <div style={{ fontWeight:600, color:'var(--kelp, #2d8653)' }}>✓ Plongée enregistrée localement</div>
              <div>
                Fiche PDF et dépôt Drive produits dès la reconnexion.
                Retrouvez cette plongée dans l'Historique avec la mention <em>△ Drive en attente</em>.
              </div>
              <div><button className="btn primary" onClick={onStartNew}>↩ Nouvelle plongée</button></div>
            </div>
          )}

          {/* Archivage terminé — liens Drive, ou téléchargement PDF direct (BEPPA Hendaye) */}
          {status === 'done' && (
            <div style={{ display:'grid', gap:12 }}>
              <Alert tone="ok">
                {isBeppaHendaye
                  ? 'Plongée archivée · fiche de sécurité et check-list générées en PDF.'
                  : <>Plongée archivée · 2 fichiers déposés dans <code>dp-fede</code>.</>}
              </Alert>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {isBeppaHendaye ? (
                  <>
                    {pdfLinks.fiche && (
                      <a href={pdfLinks.fiche} download={buildFilename('fiche-securite')} className="btn">
                        ⬇ Fiche de sécurité
                      </a>
                    )}
                    {pdfLinks.checklist && (
                      <a href={pdfLinks.checklist} download={buildFilename('checklist')} className="btn">
                        ⬇ Check-list
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    {driveLinks.fiche     && (
                      <a href={driveLinks.fiche}     target="_blank" rel="noopener noreferrer" className="btn">
                        ↗ Fiche de sécurité
                      </a>
                    )}
                    {driveLinks.checklist && (
                      <a href={driveLinks.checklist} target="_blank" rel="noopener noreferrer" className="btn">
                        ↗ Check-list
                      </a>
                    )}
                  </>
                )}
              </div>
              <div><button className="btn primary" onClick={onStartNew}>↩ Nouvelle plongée</button></div>
            </div>
          )}

          {/* Plongée déjà archivée au chargement */}
          {alreadyArchived && status === 'idle' && (
            <div style={{ display:'grid', gap:12 }}>
              <Alert tone="ok">Plongée déjà archivée.</Alert>
              {isBeppaHendaye ? (
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <button className="btn primary" onClick={regeneratePdfs}>↻ Régénérer les PDF</button>
                </div>
              ) : savedDriveLink ? (
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <a href={savedDriveLink} target="_blank" rel="noopener noreferrer" className="btn">
                    ↗ Ouvrir dans Google Drive
                  </a>
                </div>
              ) : (
                <p style={{ margin:0, fontSize:13, color:'var(--ink-3)' }}>Lien Drive non disponible pour cette archive.</p>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-head"><h2>Fichiers générés</h2></div>
        <div className="card-body">
          {[
            ['Fiche sécurité', buildFilename('fiche-securite')],
            ['Check-list',     buildFilename('checklist')],
            ['Site',           answers.site_nom || answers.site || '—'],
            ['Date',           answers.date ? formatDateTime(answers.date) : '—'],
            ['DP',             `${answers.dp_nom || '—'} (${answers.dp_qual || '—'})`],
            ['Palanquées',     `${palanquees.length} palanquée(s) · ${palanquees.reduce((n,p)=>n+(p.membres||[]).length,0)} plongeur(s)`],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0',
                                   borderBottom:'1px dashed var(--line)', fontSize:13 }}>
              <span style={{ color:'var(--ink-3)', fontFamily:'var(--t-mono)', fontSize:11, textTransform:'uppercase', minWidth:110 }}>{k}</span>
              <span style={{ fontWeight:500, textAlign:'right', wordBreak:'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* PDF rendu côté serveur (C1.2) — pas de DOM offscreen */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// finalizePendingDrive — pour les plongées enregistrées hors ligne dont le
// PDF + Drive doivent être produits a posteriori. Appelé depuis ScreenHome
// (banner « Finaliser sur Drive ») ou ScreenArchives.
//
// archive : entrée offlineStore.archives (synced=true, drive_synced=false)
//   doit contenir : answers, palanquees, divers (enrichis), client_uuid,
//   server_id, et _render = { pressions, realises, heuresDebut, heuresFin,
//   checked, comments }
// divers  : annuaire courant (pour résoudre les noms si non enrichis)
// user    : utilisateur courant
//
// Génère les deux PDFs depuis le serveur (C1.2), upload sur Drive, PATCH server.
// Le rendu est délégué au backend (templates PHP + wkhtmltopdf) : plus de DOM
// offscreen, plus de outerHTML. Le backend charge les données depuis dive_id.
// ---------------------------------------------------------------------------
async function finalizePendingDrive(archive, divers, user, onProgress) {
  if (!window.isGisAvailable || !window.isGisAvailable()) {
    throw new Error('Google Identity Services indisponible — recharger la page.');
  }
  if (!archive.server_id) {
    throw new Error('Archive non encore synchronisée côté serveur — relancer plus tard.');
  }

  const answers = typeof archive.answers === 'string' ? JSON.parse(archive.answers) : (archive.answers || {});

  const buildFilename = (kind) => {
    const dt   = answers.date || '';
    const date = dt.slice(0, 10);
    const time = dt.length >= 16 ? dt.slice(11, 16).replace(':', 'h') : '';
    const site = (archive.site_nom || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
    return `${date}${time ? '-' + time : ''}-${kind}-${site}.pdf`;
  };

  const csrf = window.getCsrfToken ? window.getCsrfToken() : '';

  async function genPdf(type) {
    const res = await fetch('/api/pdf/fiche', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ dive_id: archive.server_id, type }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`PDF ${type} HTTP ${res.status} : ${t.slice(0, 200)}`);
    }
    return await res.blob();
  }

  if (onProgress) onProgress('generating');
  const fichePdf     = await genPdf('fiche');
  const checklistPdf = await genPdf('checklist');

  if (onProgress) onProgress('requesting');
  const token = await window.getDriveToken({ explicit: false, timeoutMs: 15000 });

  if (onProgress) onProgress('uploading');
  const folderId  = await window.driveGetOrCreateFolder(token, 'dp-fede');
  const ficheFile = await window.driveUploadFile(token, fichePdf,     buildFilename('fiche-securite'), folderId);
  await window.driveUploadFile(token, checklistPdf, buildFilename('checklist'), folderId);

  if (onProgress) onProgress('saving');
  await window.api.dives.markDriveDone(archive.client_uuid, ficheFile.webViewLink || '');
  return ficheFile.webViewLink || '';
}

export { ScreenArchive, finalizePendingDrive };
