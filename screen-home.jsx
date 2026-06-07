// DP Assistant — Écran d'accueil (cycle de vie : préparées / en cours / archivées)

function fmtDate(dt) {
  if (!dt) return '—';
  const d = String(dt).slice(0, 10);
  if (d.length < 10) return dt;
  const time = String(dt).length >= 16 ? ' ' + String(dt).slice(11, 16) : '';
  return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}${time}`;
}

function DiveCardPrepared({ dive, onStart, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (!confirm(`Supprimer la plongée "${dive.site_nom || '—'}" du ${fmtDate(dive.planned_at || dive.date_plongee)} ?`)) return;
    setDeleting(true);
    try { await onDelete(dive.client_uuid || dive.id); }
    catch { setDeleting(false); }
  };

  return (
    <div style={{
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
      <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
        <button className="btn primary" style={{ fontSize:12, padding:'4px 10px' }}
          onClick={() => onStart(dive)} title="Démarrer l'exécution de cette plongée">
          ▶ Démarrer
        </button>
        <button className="btn" style={{ fontSize:12, padding:'4px 10px' }}
          onClick={() => onEdit(dive.client_uuid || dive.id)} title="Modifier la préparation">
          ✎ Modifier
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
    <div style={{
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
      <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
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

function ScreenHome({ onNew, onLoadDive, onStartExecution, onDeleteDive, onClone }) {
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

  const hasPending = inProgress.length > 0 || prepared.length > 0;

  return (
    <div>
      <div className="home-hero">
        <span className="corner">v1.2</span>
        <img src="logo-ffessm.png" alt="FFESSM" className="home-ffessm-logo" />
        <div className="eyebrow">Outil d'aide à la décision · Code du Sport · FFESSM</div>
        <h1>Préparer et diriger la plongée.</h1>
        <p>Profilage, check-list conditionnelle, palanquées validées et fiche de sécurité conforme Art. A322-72 — sur un même outil.</p>
        <div className="actions">
          <button className="btn primary lg" onClick={onNew}>+ Nouvelle plongée</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, minHeight:28 }}>
          {driveAuth === 'ok' && (
            <span style={{ fontSize:13, color:'var(--kelp,#2d8653)', fontWeight:500 }}>✓ Google Drive autorisé</span>
          )}
          {driveAuth === 'idle' && online && (
            <button className="btn" style={{ fontSize:13 }}
              onClick={() => requestDriveAccess(true)}
              title="Nécessaire pour l'archivage hors ligne — autorisez avant de couper la connexion">
              Autoriser Google Drive
            </button>
          )}
          {driveAuth === 'pending-explicit' && (
            <span style={{ fontSize:13, color:'var(--ink-3)' }}>↻ Autorisation Drive…</span>
          )}
        </div>
      </div>

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
      {inProgress.length > 0 && (
        <div style={{ marginTop:28 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:600, color:'var(--kelp,#2d8653)' }}>
              ● Plongées en cours
            </h2>
            <span style={{ fontFamily:'var(--t-mono)', fontSize:11, color:'var(--ink-3)' }}>
              {inProgress.length} fiche{inProgress.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="card">
            <div className="card-body" style={{ padding:0 }}>
              {inProgress.map(d => (
                <DiveCardInProgress key={d.client_uuid || d.id} dive={d}
                  onResume={onLoadDive}
                  onEdit={(id) => onLoadDive(id, 'profil', 'prepare')} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Plongées préparées ─────────────────────────────────────────── */}
      {prepared.length > 0 && (
        <div style={{ marginTop:inProgress.length > 0 ? 20 : 28 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:600 }}>Plongées préparées</h2>
            <span style={{ fontFamily:'var(--t-mono)', fontSize:11, color:'var(--ink-3)' }}>
              {prepared.length} plongée{prepared.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="card">
            <div className="card-body" style={{ padding:0 }}>
              {prepared.map(d => (
                <DiveCardPrepared key={d.client_uuid || d.id} dive={d}
                  onStart={onStartExecution}
                  onEdit={(id) => onLoadDive(id, 'profil', 'prepare')}
                  onDelete={onDeleteDive} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Séparateur ────────────────────────────────────────────────── */}
      {hasPending && archived.length > 0 && (
        <div style={{ margin:'28px 0 20px', display:'flex', alignItems:'center', gap:12, color:'var(--ink-4)', fontSize:12 }}>
          <div style={{ flex:1, height:1, background:'var(--line)' }} />
          <span>Plongées archivées</span>
          <div style={{ flex:1, height:1, background:'var(--line)' }} />
        </div>
      )}

      {/* ── Plongées archivées ─────────────────────────────────────────── */}
      <div style={{ marginTop: hasPending ? 0 : 28 }}>
        {!hasPending && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:600 }}>Plongées archivées</h2>
            {archived.length > 0 && (
              <span style={{ fontFamily:'var(--t-mono)', fontSize:11, color:'var(--ink-3)' }}>
                {archived.length} fiche{archived.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {cloneErr && (
          <div style={{ marginBottom:10, padding:'8px 12px', background:'var(--coral-bg,#fff0f0)',
                        borderRadius:6, fontSize:13, color:'var(--coral,#c0392b)' }}>
            {cloneErr}
          </div>
        )}

        <div className="card">
          <div className="card-body" style={{ padding:0 }}>
            {dives === null && (
              <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Chargement…</div>
            )}
            {dives !== null && archived.length === 0 && !hasPending && (
              <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>
                Aucune plongée archivée pour le moment.
              </div>
            )}
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
                    title="Reprendre les mêmes paramètres pour une nouvelle plongée"
                    disabled={cloningId !== null}
                    onClick={() => handleClone(row.id || row.client_uuid)}>
                    {cloningId === (row.id || row.client_uuid) ? '…' : '↺ Reprendre'}
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
