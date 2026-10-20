// DP Assistant — Accueil : plongée en cours, alertes de l'annuaire,
// plongées préparées et archivées du club courant.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { useOnline } from '../offline/use-online.jsx';
import { useToasts } from '../components/toast.jsx';
import { Notice } from '../components/ui.jsx';
import { ConfirmDialog } from '../components/dialog.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { formatDate, formatDateLong, formatDateTime } from '../components/format.js';
import { finalizePendingDrive } from './screen-archive.jsx';
import { DiveRow, DiveListSkeleton, useNow } from './home-parts.jsx';
import { api } from '../api/api.js';
import { getCachedToken, getDriveToken, isGisAvailable } from '../api/google-drive.js';
import { offlineStore } from '../offline/offline-store.js';
import { useClub } from '../club/club-context.jsx';
import { useClubAlerts } from '../club/use-club-alerts.js';
import { roleLabel } from '../club/permissions.js';
import { AlertsBanner } from './alerts/club-alerts.jsx';

const diveKey = (d) => d.client_uuid || d.id;

// Répartition des plongées par statut, triées pour le terrain.
function splitDives(dives) {
  if (!dives) return { inProgress: [], prepared: [], archived: [] };
  const by = (k) => (a, b) => (a[k] || '').localeCompare(b[k] || '');
  return {
    inProgress: dives.filter(d => d.status === 'in_progress').sort((a, b) => by('started_at')(b, a)),
    prepared: dives.filter(d => d.status === 'prepared').sort((a, b) => {
      const cmp = (a.planned_at || a.date_plongee || '').localeCompare(b.planned_at || b.date_plongee || '');
      return cmp !== 0 ? cmp : (a.dp_nom || '').localeCompare(b.dp_nom || '');
    }),
    archived: dives.filter(d => !d.status || d.status === 'archived').sort((a, b) => by('date_plongee')(b, a)),
  };
}

function HomeConsole({ user, driveAuth, onNew, canWrite, role }) {
  const now = useNow(30_000);
  const pending = driveAuth === 'pending-explicit';
  return (
    <section className="home-console" aria-labelledby="home-title">
      <div className="home-console-id">
        <img src="logo-ffessm.png" alt="" className="home-logo" width="52" height="52" />
        <div>
          <p className="home-clock"><span className="long">{formatDateLong(now)}</span><span className="short">{formatDate(now)}</span><b>{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b></p>
          <h1 id="home-title">Préparer et diriger la plongée</h1>
          {user?.club_nom && <p className="home-club">{user.club_nom}</p>}
        </div>
      </div>
      <div className="home-console-action">
        {canWrite && (
          <button type="button" className="btn go lg" onClick={onNew} disabled={pending}>
            {pending ? <><Icon.Refresh />Autorisation Google Drive…</> : <><Icon.Plus />Nouvelle plongée</>}
          </button>
        )}
        {!canWrite && <span className="drive-state"><StatusIcon tone="info" />Rôle {roleLabel(role)} : consultation des plongées</span>}
        {canWrite && driveAuth === 'ok' && <span className="drive-state"><StatusIcon tone="ok" />Google Drive autorisé</span>}
      </div>
    </section>
  );
}

function ResumeCard({ dives, onResume }) {
  const d = dives[0];
  return (
    <section className="resume-card" aria-labelledby="resume-title">
      <div>
        <span className="label"><StatusIcon tone="ok" />Plongée en cours</span>
        <h2 id="resume-title">{d.site_nom || 'Site non renseigné'}</h2>
        <p>
          DP {d.dp_nom || '—'}{d.started_at ? `, mise à l'eau ${formatDateTime(d.started_at)}` : ''}
          {dives.length > 1 ? `. ${dives.length - 1} autre${dives.length > 2 ? 's' : ''} en cours.` : ''}
        </p>
      </div>
      <button type="button" className="btn primary lg" onClick={() => onResume(diveKey(d), 'fiche', 'execute')}>
        <Icon.Play />Reprendre le suivi
      </button>
    </section>
  );
}

function PendingDriveNotice({ count, online, finalizing, message, onFinalize }) {
  return (
    <Notice tone="warn" live
      title={`${count} plongée${count > 1 ? 's' : ''} archivée${count > 1 ? 's' : ''} sans dépôt Google Drive`}
      actions={
        <button type="button" className="btn primary" onClick={onFinalize} disabled={!online || finalizing}>
          {finalizing ? <><span className="spin"><Icon.Refresh /></span>Dépôt en cours…</> : 'Déposer sur Google Drive'}
        </button>
      }>
      <p>{online
        ? 'Elles ont été archivées hors ligne. La fiche PDF et le dépôt peuvent maintenant être produits.'
        : 'Le dépôt reprendra au retour du réseau.'}</p>
      {message && <p className="num small">{message}</p>}
    </Notice>
  );
}

function DiveSection({ id, title, count, loading, empty, children }) {
  return (
    <section className="dive-section" aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {!loading && <span className="count">{count}</span>}
      </div>
      <div className="dive-list">
        {loading ? <DiveListSkeleton /> : count === 0 ? empty : children}
      </div>
    </section>
  );
}

// Autorisation Drive demandée au clic « Nouvelle plongée » (jamais au chargement).
function useDriveAuth(online, onNew) {
  const [driveAuth, setDriveAuth] = useState(() => (getCachedToken && getCachedToken()) ? 'ok' : 'idle');
  const handleNew = useCallback(async () => {
    if (!online || !isGisAvailable || !isGisAvailable()) { onNew(); return; }
    if (getCachedToken && getCachedToken()) { setDriveAuth('ok'); onNew(); return; }
    setDriveAuth('pending-explicit');
    try {
      await getDriveToken({ explicit: false, timeoutMs: 15000 });
      setDriveAuth('ok');
    } catch {
      // Refus, délai dépassé ou fenêtre bloquée : l'archivage se fera plus tard.
      setDriveAuth('idle');
    } finally {
      onNew();
    }
  }, [online, onNew]);
  return [driveAuth, handleNew];
}

// Plongées archivées hors ligne dont le dépôt Drive reste à produire.
function usePendingDrive(user, showToast, reload) {
  const [pendingDrive, setPendingDrive] = useState([]);
  const [finalizing, setFinalizing] = useState(false);
  const [message, setMessage] = useState('');

  const refreshPending = useCallback(async () => {
    if (api?.dives?.pendingDrive) setPendingDrive(await api.dives.pendingDrive());
  }, []);

  const finalizeAll = useCallback(async () => {
    if (finalizing) return;
    setFinalizing(true); setMessage('');
    let divers = [];
    try { divers = await offlineStore.all('divers'); } catch (err) { console.warn('[DP] annuaire local illisible :', err.message); }
    let ok = 0;
    for (const [i, archive] of pendingDrive.entries()) {
      const label = `${i + 1}/${pendingDrive.length} ${archive.site_nom || 'plongée'}`;
      try {
        setMessage(label);
        await finalizePendingDrive(archive, divers, user, (step) => setMessage(`${label} : ${step}`));
        ok++;
      } catch (err) {
        showToast({ tone: 'err', title: 'Dépôt Google Drive impossible', body: err.message });
        break;
      }
    }
    setFinalizing(false); setMessage('');
    if (ok > 0) showToast({ tone: 'ok', title: 'Déposé sur Google Drive', body: `${ok} plongée${ok > 1 ? 's' : ''} déposée${ok > 1 ? 's' : ''}.` });
    refreshPending();
    reload();
  }, [pendingDrive, user, finalizing, showToast, refreshPending, reload]);

  return { pendingDrive, finalizing, message, refreshPending, finalizeAll };
}

function useDives() {
  const [dives, setDives] = useState(null);
  const [loadError, setLoadError] = useState('');
  const loadDives = useCallback(async () => {
    try { setDives(await api.dives.list()); setLoadError(''); }
    catch (err) { setDives([]); setLoadError(err.message); }
  }, []);
  return { dives, loadError, loadDives };
}

function ScreenHome({ onNew, onLoadDive, onStartExecution, onDeleteDive, onClone, onCloneH3, onNavigate }) {
  const online = useOnline();
  const { user } = useAuth();
  const club = useClub();
  const alerts = useClubAlerts();
  const canWrite = club.can('dives.write');
  const { showToast } = useToasts();
  const { dives, loadError, loadDives } = useDives();
  const [driveAuth, handleNew] = useDriveAuth(online, onNew);
  const drive = usePendingDrive(user, showToast, loadDives);
  const [busyId, setBusyId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const { refreshPending } = drive;

  useEffect(() => {
    loadDives();
    refreshPending();
    const onChange = () => { loadDives(); refreshPending(); };
    window.addEventListener('dp:dataChanged', onChange);
    window.addEventListener('dp:syncDone', onChange);
    return () => {
      window.removeEventListener('dp:dataChanged', onChange);
      window.removeEventListener('dp:syncDone', onChange);
    };
  }, [loadDives, refreshPending]);

  const run = (id, fn, errTitle) => async () => {
    setBusyId(id);
    try { await fn(); }
    catch (err) { showToast({ tone: 'err', title: errTitle, body: err.message }); }
    finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    const d = toDelete;
    setToDelete(null);
    await run(diveKey(d), () => onDeleteDive(diveKey(d)), 'Suppression impossible')();
  };

  const { inProgress, prepared, archived } = useMemo(() => splitDives(dives), [dives]);
  const loading = dives === null;
  // La 1re plongée en cours est dans la carte « Reprendre » (rôles qui écrivent).
  const otherLive = canWrite ? inProgress.slice(1) : inProgress;

  return (
    <div>
      <HomeConsole user={user} driveAuth={driveAuth} onNew={handleNew} canWrite={canWrite} role={club.role} />

      {inProgress.length > 0 && canWrite && <ResumeCard dives={inProgress} onResume={onLoadDive} />}

      <AlertsBanner data={alerts.data} onOpen={() => onNavigate('admin-divers')} />

      {drive.pendingDrive.length > 0 && (
        <PendingDriveNotice count={drive.pendingDrive.length} online={online} finalizing={drive.finalizing}
          message={drive.message} onFinalize={drive.finalizeAll} />
      )}

      {loadError && !online && (
        <Notice tone="info" title="Hors ligne">Liste issue de cet appareil. Elle se mettra à jour au retour du réseau.</Notice>
      )}

      {otherLive.length > 0 && (
      <DiveSection id="sec-progress" title={canWrite ? 'Autres plongées en cours' : 'Plongées en cours'} count={otherLive.length} loading={loading} empty={null}>
        {otherLive.map(d => (
          <DiveRow key={diveKey(d)} dive={d} live
            actions={canWrite && <button type="button" className="btn primary" onClick={() => onLoadDive(diveKey(d), 'fiche', 'execute')}>
              <Icon.Play />Reprendre</button>} />
        ))}
      </DiveSection>
      )}

      <DiveSection id="sec-prepared" title="Préparées" count={prepared.length} loading={loading}
        empty={<div className="empty-state"><b>Aucune plongée préparée</b><span>Créez une plongée avec « Nouvelle plongée » : profil, palanquées, puis check-list de préparation.</span></div>}>
        {prepared.map(d => {
          const id = diveKey(d);
          const busy = busyId === id;
          return (
            <DiveRow key={id} dive={d} actions={canWrite && <>
              <button type="button" className="btn primary" onClick={() => onStartExecution(d)}><Icon.Play />Démarrer</button>
              <button type="button" className="btn" onClick={() => onLoadDive(id, 'profil', 'prepare')}><Icon.Edit />Modifier</button>
              <button type="button" className="btn" disabled={busy} title="Copie identique, 3 heures plus tard (météo à refaire)"
                onClick={run(id, () => onCloneH3(id), 'Duplication impossible')}><Icon.Copy />Dupliquer +3 h</button>
              <button type="button" className="btn danger icon" disabled={busy} aria-label={`Supprimer la plongée ${d.site_nom || ''}`}
                onClick={() => setToDelete(d)}><Icon.Trash /></button>
            </>} />
          );
        })}
      </DiveSection>

      <DiveSection id="sec-archived" title="Archivées" count={archived.length} loading={loading}
        empty={<div className="empty-state"><b>Aucune plongée archivée</b><span>Les plongées terminées et archivées apparaîtront ici.</span></div>}>
        {archived.map(d => {
          const id = d.id || d.client_uuid;
          return (
            <DiveRow key={diveKey(d)} dive={d} archived actions={<>
              {d.drive_link && (
                <a className="btn" href={d.drive_link} target="_blank" rel="noopener noreferrer"><Icon.External />Drive</a>
              )}
              {canWrite && (
                <button type="button" className="btn" disabled={busyId !== null}
                  title="Nouvelle plongée sur ce modèle, dans 3 heures"
                  onClick={run(id, () => onClone(id), 'Duplication impossible')}><Icon.Copy />Réutiliser</button>
              )}
            </>} />
          );
        })}
      </DiveSection>

      {toDelete && (
        <ConfirmDialog title="Supprimer la plongée préparée ?" danger confirmLabel="Supprimer"
          onCancel={() => setToDelete(null)} onConfirm={confirmDelete}>
          <p><b>{toDelete.site_nom || 'Site non renseigné'}</b>, {formatDateTime(toDelete.planned_at || toDelete.date_plongee)}.</p>
          <p>La préparation (profil, palanquées, check-list) sera supprimée.</p>
        </ConfirmDialog>
      )}

      <p className="disclaimer">
        Outil d'aide à la décision. Il ne remplace ni la responsabilité personnelle du directeur de plongée,
        ni la lecture du Code du sport (art. A322-71 à A322-101) et des textes fédéraux en vigueur.
      </p>
    </div>
  );
}

export { ScreenHome };
