// DP Assistant — Écran d'accueil (cycle de vie : préparées / en cours / archivées)

function fmtDate(dt) {
  if (!dt) return '—';
  const d = String(dt).slice(0, 10);
  if (d.length < 10) return dt;
  const time = String(dt).length >= 16 ? ' ' + String(dt).slice(11, 16) : '';
  return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}${time}`;
}

function DiveCardPrepared({ dive, onStart, onEdit, onDelete, onCloneH3 }) {
  const [deleting,   setDeleting]   = useState(false);
  const [cloningH3,  setCloningH3]  = useState(false);

  const doDelete = async () => {
    if (!confirm(`Supprimer la plongée "${dive.site_nom || '—'}" du ${fmtDate(dive.planned_at || dive.date_plongee)} ?`)) return;
    setDeleting(true);
    try { await onDelete(dive.client_uuid || dive.id); }
    catch { setDeleting(false); }
  };

  const doCloneH3 = async () => {
    setCloningH3(true);
    try { await onCloneH3(dive.client_uuid || dive.id); }
    catch { setCloningH3(false); }
  };

  return (
    <div className="dive-card-row" style={{
      display:'grid', gridTemplateColumns:'1fr auto',
      gap:'4px 12px', padding:'12px 16px',
      borderBottom:'1px solid var(--line)', alignItems:'center',
    }}>
      <div>
        <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>
          {dive.site_nom || '—'}
          {dive._pending && (
            <span style={{ marginLeft:8, fontSize:11, color:'var(--coral)', fontWeight:400 }}>● en attente</span>
          )}
        </div>
        <div style={{ fontSize:12, color:'var(--ink-3)' }}>
          <b style={{ color:'var(--ink-2)' }}>{fmtDate(dive.planned_at || dive.date_plongee)}</b>
          {dive.dp_nom ? ` · DP : ${dive.dp_nom} (${dive.dp_qual || '—'})` : ''}
          {dive.nb_palanquees > 0 && ` · ${dive.nb_palanquees} pal. · ${dive.nb_plongeurs} plongeurs`}
        </div>
      </div>
      <div className="dive-card-actions" style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
        <button className="btn primary" style={{ fontSize:12, padding:'4px 10px' }}
          onClick={() => onStart(dive)} title="Démarrer l'exécution de cette plongée">
          ▶ Démarrer
        </button>
        <button className="btn" style={{ fontSize:12, padding:'4px 10px' }}
          onClick={() => onEdit(dive.client_uuid || dive.id)} title="Modifier la préparation">
          ✎ Modifier
        </button>
        <button className="btn" style={{ fontSize:12, padding:'4px 10px' }}
          disabled={cloningH3} onClick={doCloneH3}
          title="Créer une plongée identique débutant 3 h plus tard (météo à rafraîchir)">
          {cloningH3 ? '…' : 'Dupliquer +3h'}
        </button>
        <button className="btn" style={{ fontSize:12, padding:'4px 10px', color:'var(--coral)' }}
          disabled={deleting} onClick={doDelete} title="Supprimer cette plongée préparée">
          {deleting ? '…' : '✕'}
        </button>
      </div>
    </div>
  );
}

function DiveCardInProgress({ dive, onResume, onEdit }) {
  return (
    <div className="dive-card-row" style={{
      display:'grid', gridTemplateColumns:'1fr auto',
      gap:'4px 12px', padding:'12px 16px',
      borderBottom:'1px solid var(--line)', alignItems:'center',
      background:'rgba(10,74,110,0.04)',
    }}>
      <div>
        <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>
          <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%',
            background:'var(--kelp,#2d8653)', marginRight:7, verticalAlign:'middle' }} />
          {dive.site_nom || '—'}
        </div>
        <div style={{ fontSize:12, color:'var(--ink-3)' }}>
          <b style={{ color:'var(--ink-2)' }}>{fmtDate(dive.planned_at || dive.date_plongee)}</b>
          {dive.dp_nom ? ` · DP : ${dive.dp_nom} (${dive.dp_qual || '—'})` : ''}
          {dive.started_at && ` · MEE ${fmtDate(dive.started_at).slice(12)}`}
          {dive.nb_palanquees > 0 && ` · ${dive.nb_palanquees} pal.`}
        </div>
      </div>
      <div className="dive-card-actions" style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
        <button className="btn primary" style={{ fontSize:12, padding:'4px 10px' }}
          onClick={() => onResume(dive.client_uuid || dive.id, 'fiche', 'execute')}>
          ▶ Reprendre la fiche
        </button>
        <button className="btn" style={{ fontSize:12, padding:'4px 10px' }}
          onClick={() => onEdit(dive.client_uuid || dive.id)}>
          ✎ Modifier
        </button>
      </div>
    </div>
  );
}

function SectionHead({ icon, iconColor, label, count, unit }) {
  return (
    <div className="section-head">
      <h2>
        <span className="section-head-icon" style={{ color: iconColor }}>{icon}</span>
        <span style={{ color: iconColor || 'inherit' }}>{label}</span>
      </h2>
      {count != null && count > 0 && (
        <span className="section-head-count">{count} {unit}{count > 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

function ScreenHome({ onNew, onLoadDive, onStartExecution, onDeleteDive, onClone, onCloneH3 }) {
  const [dives,     setDives]     = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [cloneErr,  setCloneErr]  = useState('');
  const online = window.useOnline ? window.useOnline() : true;
  const { user } = useAuth();
  const { showToast } = useToasts();

  // ── Google Drive pré-autorisation ────────────────────────────────────────
  const [driveAuth, setDriveAuth] = useState('pending');

  const requestDriveAccess = useCallback((explicit = false) => {
    if (!window.google?.accounts?.oauth2) { setDriveAuth('idle'); return; }
    setDriveAuth(explicit ? 'pending-explicit' : 'pending');
    const tid = setTimeout(() => setDriveAuth('idle'), explicit ? 120000 : 4000);
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: window.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        clearTimeout(tid);
        if (resp.error) { setDriveAuth('idle'); return; }
        window.dp_driveToken = {
          access_token: resp.access_token,
          expires_at: Date.now() + 55 * 60 * 1000,
        };
        setDriveAuth('ok');
      },
    });
    tc.requestAccessToken({ prompt: explicit ? 'consent' : '' });
  }, []);

  const handleNew = useCallback(() => {
    if (!online || driveAuth === 'ok' || !window.google?.accounts?.oauth2) {
      onNew(); return;
    }
    setDriveAuth('pending-explicit');
    const tid = setTimeout(() => { setDriveAuth('idle'); onNew(); }, 15000);
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: window.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        clearTimeout(tid);
        if (!resp.error) {
          window.dp_driveToken = { access_token: resp.access_token, expires_at: Date.now() + 55 * 60 * 1000 };
          setDriveAuth('ok');
        } else {
          setDriveAuth('idle');
        }
        onNew();
      },
    });
    tc.requestAccessToken({ prompt: '' });
  }, [online, driveAuth, onNew]);

  useEffect(() => {
    if (!online) { setDriveAuth('idle'); return; }
    requestDriveAccess(false);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (online && driveAuth === 'idle') requestDriveAccess(false);
  }, [online]); // eslint-disable-line

  // ── Pending Drive ────────────────────────────────────────────────────────
  const [pendingDrive, setPendingDrive] = useState([]);
  const [finalizing,   setFinalizing]   = useState(false);
  const [finalizeMsg,  setFinalizeMsg]  = useState('');

  const refreshPending = useCallback(async () => {
    if (window.api?.dives?.pendingDrive) {
      const list = await window.api.dives.pendingDrive();
      setPendingDrive(list);
    }
  }, []);

  // ── Chargement des plongées ──────────────────────────────────────────────
  const loadDives = useCallback(async () => {
    try {
      const list = await api.dives.list();
      setDives(list);
    } catch {
      setDives([]);
    }
  }, []);

  useEffect(() => {
    loadDives();
    refreshPending();
    const onChange = () => { loadDives(); refreshPending(); };
    window.addEventListener('dp:dataChanged', onChange);
    window.addEventListener('dp:syncDone',    onChange);
    return () => {
      window.removeEventListener('dp:dataChanged', onChange);
      window.removeEventListener('dp:syncDone',    onChange);
    };
  }, [loadDives, refreshPending]);

  // ── Finalisation Drive ───────────────────────────────────────────────────
  const finalizeAll = useCallback(async () => {
    if (finalizing) return;
    setFinalizing(true); setFinalizeMsg('');
    let divers = [];
    try { divers = await window.offlineStore.all('divers'); } catch {}
    let ok = 0, fail = 0;
    for (const archive of pendingDrive) {
      try {
        setFinalizeMsg(`${ok + fail + 1}/${pendingDrive.length} — ${archive.site_nom || 'plongée'}`);
        await window.finalizePendingDrive(archive, divers, user, (step) => {
          setFinalizeMsg(`${ok + fail + 1}/${pendingDrive.length} — ${archive.site_nom || 'plongée'} · ${step}`);
        });
        ok++;
      } catch (err) {
        fail++;
        showToast({ tone: 'err', title: 'Drive — échec', body: err.message });
        break;
      }
    }
    setFinalizing(false); setFinalizeMsg('');
    if (ok > 0) showToast({ tone: 'ok', title: 'Drive synchronisé', body: `${ok} plongée${ok > 1 ? 's' : ''} déposée${ok > 1 ? 's' : ''}.` });
    refreshPending();
    loadDives();
  }, [pendingDrive, user, finalizing, showToast, refreshPending, loadDives]);

  const handleClone = async (id) => {
    setCloningId(id); setCloneErr('');
    try { await onClone(id); }
    catch (err) { setCloneErr(err.message); setCloningId(null); }
  };

  // ── Tri et split ─────────────────────────────────────────────────────────
  const { inProgress, prepared, archived } = useMemo(() => {
    if (!dives) return { inProgress: [], prepared: [], archived: [] };
    const ip = dives
      .filter(d => d.status === 'in_progress')
      .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
    const pr = dives
      .filter(d => d.status === 'prepared')
      .sort((a, b) => {
        const cmp = (a.planned_at || a.date_plongee || '').localeCompare(b.planned_at || b.date_plongee || '');
        return cmp !== 0 ? cmp : (a.dp_nom || '').localeCompare(b.dp_nom || '');
      });
    const ar = dives
      .filter(d => !d.status || d.status === 'archived')
      .sort((a, b) => (b.date_plongee || '').localeCompare(a.date_plongee || ''));
    return { inProgress: ip, prepared: pr, archived: ar };
  }, [dives]);

  return (
    <div>
      <div className="home-hero">
        <span className="corner">v1.2</span>
        <div className="home-hero-content">
          <div className="home-hero-identity">
            <img src="logo-ffessm.png" alt="FFESSM" className="home-ffessm-logo" />
            <h1>Préparer et diriger la plongée.</h1>
          </div>
          <div className="eyebrow">Outil d'aide à la décision · Code du Sport · FFESSM</div>
          <p>Profilage, check-list conditionnelle, palanquées validées et fiche de sécurité conforme Art. A322-72 — sur un même outil.</p>
        </div>
        <div className="home-hero-action">
          <button className="btn primary lg"
            onClick={handleNew}
            disabled={driveAuth === 'pending-explicit'}>
            {driveAuth === 'pending-explicit' ? '↻ Autorisation Drive…' : '+ Nouvelle plongée'}
          </button>
          {driveAuth === 'ok' && (
            <span style={{ fontSize:12, color:'var(--kelp,#2d8653)', fontWeight:500, whiteSpace:'nowrap' }}>✓ Google Drive autorisé</span>
          )}
        </div>
      </div>

      {/* Reprise rapide terrain : accès direct à la plongée en cours la plus récente */}
      {inProgress.length > 0 && (
        <div style={{
          marginTop:18, padding:'16px 18px', borderRadius:10,
          background:'rgba(45,134,83,0.10)', border:'1px solid rgba(45,134,83,0.45)',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap',
        }}>
          <div>
            <b style={{ fontSize:15 }}>▶ Plongée en cours</b>
            <div style={{ fontSize:13, color:'var(--ink-2)', marginTop:2 }}>
              {inProgress[0].site_nom || 'Site —'} · DP {inProgress[0].dp_nom || '—'}
              {inProgress.length > 1 ? ` · +${inProgress.length - 1} autre(s)` : ''}
            </div>
          </div>
          <button className="btn primary lg"
            onClick={() => onLoadDive(inProgress[0].client_uuid || inProgress[0].id, 'fiche', 'execute')}>
            Reprendre la plongée en cours
          </button>
        </div>
      )}

      {/* Pending Drive */}
      {pendingDrive.length > 0 && (
        <div style={{
          marginTop:18, padding:'14px 18px', borderRadius:10,
          background:'rgba(226,162,58,0.10)', border:'1px solid rgba(226,162,58,0.45)',
          display:'grid', gap:10,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:18 }}>△</span>
            <b>{pendingDrive.length} plongée{pendingDrive.length > 1 ? 's' : ''} sans dépôt Drive</b>
          </div>
          <div style={{ fontSize:13, color:'var(--ink-2)', lineHeight:1.5 }}>
            Enregistrée{pendingDrive.length > 1 ? 's' : ''} hors ligne. La fiche PDF et le dépôt Google Drive peuvent maintenant être produits.
          </div>
          {finalizeMsg && (
            <div style={{ fontSize:12, color:'var(--ink-3)', fontFamily:'var(--t-mono)' }}>{finalizeMsg}</div>
          )}
          <div>
            <button className="btn primary" onClick={finalizeAll}
              disabled={!online || finalizing}
              title={!online ? 'Hors ligne — impossible pour le moment' : undefined}>
              {finalizing ? '↻ Finalisation en cours…' : '↑ Finaliser sur Google Drive'}
            </button>
          </div>
        </div>
      )}

      {/* ── Plongées en cours ──────────────────────────────────────────── */}
      <div style={{ marginTop:24 }}>
        <SectionHead icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polygon fill="currentColor" stroke="none" points="10,8.5 16.5,12 10,15.5"/>
          </svg>
        } iconColor="var(--kelp,#2d8653)"
          label="Plongées en cours" count={inProgress.length} unit="fiche" />
        <div className="card">
          <div className="card-body" style={{ padding:0 }}>
            {dives === null
              ? <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Chargement…</div>
              : inProgress.length === 0
                ? <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Aucune plongée en cours.</div>
                : inProgress.map(d => (
                    <DiveCardInProgress key={d.client_uuid || d.id} dive={d}
                      onResume={onLoadDive}
                      onEdit={(id) => onLoadDive(id, 'profil', 'prepare')} />
                  ))
            }
          </div>
        </div>
      </div>

      {/* ── Plongées préparées ─────────────────────────────────────────── */}
      <div style={{ marginTop:24 }}>
        <SectionHead icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        } iconColor="var(--marine,#0a4a6e)"
          label="Plongées préparées" count={prepared.length} unit="plongée" />
        <div className="card">
          <div className="card-body" style={{ padding:0 }}>
            {dives === null
              ? <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Chargement…</div>
              : prepared.length === 0
                ? <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Aucune plongée préparée — cliquez sur « + Nouvelle plongée ».</div>
                : prepared.map(d => (
                    <DiveCardPrepared key={d.client_uuid || d.id} dive={d}
                      onStart={onStartExecution}
                      onEdit={(id) => onLoadDive(id, 'profil', 'prepare')}
                      onDelete={onDeleteDive}
                      onCloneH3={onCloneH3} />
                  ))
            }
          </div>
        </div>
      </div>

      {/* ── Plongées archivées ─────────────────────────────────────────── */}
      <div style={{ marginTop:24 }}>
        <SectionHead icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
        } iconColor="var(--ink-3)"
          label="Plongées archivées" count={archived.length} unit="fiche" />

        {cloneErr && (
          <div style={{ marginBottom:10, padding:'8px 12px', background:'var(--coral-bg,#fff0f0)',
                        borderRadius:6, fontSize:13, color:'var(--coral,#c0392b)' }}>
            {cloneErr}
          </div>
        )}

        <div className="card">
          <div className="card-body" style={{ padding:0 }}>
            {dives === null
              ? <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Chargement…</div>
              : archived.length === 0 && <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Aucune plongée archivée pour le moment.</div>
            }
            {archived.map((row, i) => (
              <div key={row.client_uuid || row.id} style={{
                display:'grid', gridTemplateColumns:'1fr auto',
                gap:'4px 12px', padding:'12px 16px',
                borderBottom: i < archived.length - 1 ? '1px solid var(--line)' : 'none',
                alignItems:'center',
              }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{row.site_nom || '—'}</div>
                  <div style={{ fontSize:12, color:'var(--ink-3)' }}>
                    <b style={{ color:'var(--ink-2)' }}>{fmtDate(row.date_plongee)}</b>
                    {' · DP : '}{row.dp_nom || '—'}{' ('}{row.dp_qual || '—'}{')'}{' · '}{row.activite || '—'}
                    {row.nb_palanquees > 0 && (
                      <>{' · '}{row.nb_palanquees} pal. · {row.nb_plongeurs} plongeurs</>
                    )}
                    {row._pending && <span style={{ marginLeft:8, color:'var(--coral)', fontWeight:600 }}>● en attente</span>}
                    {row.synced && !row.drive_synced && <span style={{ marginLeft:8, color:'var(--sun,#e2a23a)', fontWeight:600 }}>△ Drive en attente</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                  {row.drive_link && (
                    <a href={row.drive_link} target="_blank" rel="noopener noreferrer"
                      className="btn" style={{ fontSize:12, padding:'4px 10px', whiteSpace:'nowrap' }}>
                      ↗ Drive
                    </a>
                  )}
                  <button className="btn" style={{ fontSize:12, padding:'4px 10px', whiteSpace:'nowrap' }}
                    title="Créer une nouvelle plongée sur ce modèle, heure actuelle +3h"
                    disabled={cloningId !== null}
                    onClick={() => handleClone(row.id || row.client_uuid)}>
                    {cloningId === (row.id || row.client_uuid) ? '…' : 'Nouvelle plongée sur ce modèle'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="disclaimer" style={{ marginTop:24 }}>
        Outil d'aide à la décision. Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée, ni à la lecture du Code du Sport (Art. A322-71 à A322-101) et des textes fédéraux FFESSM en vigueur.
      </div>
    </div>
  );
}

Object.assign(window, { ScreenHome });
