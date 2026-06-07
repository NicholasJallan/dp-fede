// DP Assistant — Écran d'accueil

// Convertit YYYY-MM-DD ou YYYY-MM-DDTHH:mm → dd-mm-yyyy
function fmtArchiveDate(dt) {
  if (!dt) return '—';
  const d = String(dt).slice(0, 10);
  if (d.length < 10) return dt;
  return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
}

function ScreenHome({ onNew, onResume, hasDraft, plongeeFigee, onClone }) {
  const [archives,  setArchives]  = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [cloneErr,  setCloneErr]  = useState('');
  const online = window.useOnline ? window.useOnline() : true;
  const { user } = useAuth();
  const { showToast } = useToasts();

  // Pré-autorisation Google Drive — obtient le token avant la plongée pour que
  // l'archivage offline→online fonctionne sans geste user à la reconnexion.
  // 'pending'          : tentative silencieuse en cours (pas d'UI)
  // 'idle'             : tentative silencieuse échouée/timeout → affiche bouton
  // 'pending-explicit' : l'utilisateur a cliqué le bouton, popup en cours
  // 'ok'               : token valide stocké dans window.dp_driveToken
  const [driveAuth, setDriveAuth] = useState('pending');

  const requestDriveAccess = useCallback((explicit = false) => {
    if (!window.google?.accounts?.oauth2) { setDriveAuth('idle'); return; }
    setDriveAuth(explicit ? 'pending-explicit' : 'pending');
    // Timeout court pour la tentative silencieuse (4 s), long pour le popup explicit (2 min).
    const tid = setTimeout(() => setDriveAuth('idle'), explicit ? 120000 : 4000);
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: window.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        clearTimeout(tid);
        if (resp.error) { setDriveAuth('idle'); return; }
        window.dp_driveToken = {
          access_token: resp.access_token,
          expires_at: Date.now() + 55 * 60 * 1000, // 55 min (conservateur)
        };
        setDriveAuth('ok');
      },
    });
    tc.requestAccessToken({ prompt: explicit ? 'consent' : '' });
  }, []);

  // Tentative silencieuse au montage (si online). Si le scope a déjà été accordé,
  // GIS répond immédiatement ; sinon le timeout de 4 s bascule en 'idle'.
  useEffect(() => {
    if (!online) { setDriveAuth('idle'); return; }
    requestDriveAccess(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry silencieux à la reconnexion (utile si le composant a monté offline).
  useEffect(() => {
    if (online && driveAuth === 'idle') requestDriveAccess(false);
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive en attente : archives synced=true mais drive_synced=false.
  // Récupéré depuis le store local (cf. offline-api).
  const [pendingDrive, setPendingDrive] = useState([]);
  const [finalizing,   setFinalizing]   = useState(false);
  const [finalizeMsg,  setFinalizeMsg]  = useState('');

  const refreshPending = useCallback(async () => {
    if (window.api?.archives?.pendingDrive) {
      const list = await window.api.archives.pendingDrive();
      setPendingDrive(list);
    }
  }, []);

  useEffect(() => {
    refreshPending();
    const on = () => refreshPending();
    window.addEventListener('dp:dataChanged', on);
    window.addEventListener('dp:syncDone',    on);
    return () => {
      window.removeEventListener('dp:dataChanged', on);
      window.removeEventListener('dp:syncDone',    on);
    };
  }, [refreshPending]);

  // Lance la finalisation Drive séquentielle pour les archives pendantes.
  // Si une étape échoue (token refusé, réseau), on stoppe et on conserve
  // ce qui reste pour un nouveau clic plus tard.
  const finalizeAll = useCallback(async () => {
    if (finalizing) return;
    setFinalizing(true); setFinalizeMsg('');
    // Récupère la liste fraîche des plongeurs (annuaire local).
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
        break; // on stoppe à la première erreur pour ne pas multiplier les prompts Google
      }
    }
    setFinalizing(false);
    setFinalizeMsg('');
    if (ok > 0) {
      showToast({ tone: 'ok', title: 'Drive synchronisé', body: `${ok} plongée${ok > 1 ? 's' : ''} déposée${ok > 1 ? 's' : ''}.` });
    }
    refreshPending();
    // Rafraîchir aussi la liste d'archives affichée juste en dessous.
    api.archives.list().then(rows => setArchives(rows)).catch(() => {});
  }, [pendingDrive, user, finalizing, showToast, refreshPending]);

  useEffect(() => {
    api.archives.list()
      .then(rows => setArchives(rows))
      .catch(() => setArchives([]));
  }, []);

  const handleClone = async (id) => {
    setCloningId(id); setCloneErr('');
    try {
      await onClone(id);
    } catch (err) {
      setCloneErr(err.message);
      setCloningId(null);
    }
  };

  const canResume = hasDraft && !plongeeFigee;

  return (
    <div>
      <div className="home-hero">
        <span className="corner">v1.1</span>
        <img src="logo-ffessm.png" alt="FFESSM" className="home-ffessm-logo" />
        <div className="eyebrow">Outil d'aide à la décision · Code du Sport · FFESSM</div>
        <h1>Préparer la plongée du jour.</h1>
        <p>Profilage, check-list conditionnelle, palanquées validées et fiche de sécurité conforme Art. A322-72 — sur un même outil.</p>
        <div className="actions">
          <button className="btn primary lg" onClick={onNew}>+ Nouvelle plongée</button>
          {canResume && <button className="btn lg" onClick={onResume}>Reprendre le brouillon</button>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, minHeight:28 }}>
          {driveAuth === 'ok' && (
            <span style={{ fontSize:13, color:'var(--kelp,#2d8653)', fontWeight:500 }}>
              ✓ Google Drive autorisé
            </span>
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
        {plongeeFigee && (
          <p style={{ marginTop:12, fontSize:13, color:'var(--ink-3)' }}>
            La dernière plongée est figée et archivée. Commencez une nouvelle plongée ou reprenez les paramètres d'une plongée précédente ci-dessous.
          </p>
        )}
      </div>

      {pendingDrive.length > 0 && (
        <div style={{
          marginTop: 18, padding: '14px 18px', borderRadius: 10,
          background: 'rgba(226,162,58,0.10)', border: '1px solid rgba(226,162,58,0.45)',
          display: 'grid', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>△</span>
            <b>{pendingDrive.length} plongée{pendingDrive.length > 1 ? 's' : ''} sans dépôt Drive</b>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {pendingDrive.length === 1 ? 'Une plongée a été' : `${pendingDrive.length} plongées ont été`} enregistrée{pendingDrive.length > 1 ? 's' : ''} hors ligne.
            La fiche de sécurité PDF et le dépôt Google Drive peuvent maintenant
            être produits.
          </div>
          {finalizeMsg && (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--t-mono)' }}>
              {finalizeMsg}
            </div>
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

      {/* Liste des plongées archivées */}
      <div style={{ marginTop:28 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:600 }}>Plongées archivées</h2>
          {archives && archives.length > 0 && (
            <span style={{ fontFamily:'var(--t-mono)', fontSize:11, color:'var(--ink-3)' }}>
              {archives.length} fiche{archives.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {cloneErr && (
          <div style={{ marginBottom:10, padding:'8px 12px', background:'var(--coral-bg,#fff0f0)',
                        borderRadius:6, fontSize:13, color:'var(--coral,#c0392b)' }}>
            {cloneErr}
          </div>
        )}

        <div className="card">
          <div className="card-body" style={{ padding:0 }}>
            {archives === null && (
              <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>Chargement…</div>
            )}
            {archives !== null && archives.length === 0 && (
              <div className="muted" style={{ padding:20, textAlign:'center', fontSize:13 }}>
                Aucune plongée archivée pour le moment.
              </div>
            )}
            {archives && archives.map((row, i) => (
              <div key={row.id} style={{
                display:'grid',
                gridTemplateColumns:'1fr auto',
                gap:'4px 12px',
                padding:'12px 16px',
                borderBottom: i < archives.length - 1 ? '1px solid var(--line)' : 'none',
                alignItems:'center',
              }}>
                {/* Infos */}
                <div>
                  <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{row.site_nom || '—'}</div>
                  <div style={{ fontSize:12, color:'var(--ink-3)' }}>
                    <b style={{ color:'var(--ink-2)' }}>{fmtArchiveDate(row.date_plongee)}</b>
                    {' · DP : '}{row.dp_nom || '—'}{' ('}{row.dp_qual || '—'}{')'}{' · '}{row.activite || '—'}
                    {row.nb_palanquees > 0 && (
                      <>{' · '}{row.nb_palanquees} pal. · {row.nb_plongeurs} plongeur{row.nb_plongeurs > 1 ? 's' : ''}</>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                  {row.drive_link && (
                    <a href={row.drive_link} target="_blank" rel="noopener noreferrer"
                      className="btn" style={{ fontSize:12, padding:'4px 10px', whiteSpace:'nowrap' }}
                      title="Ouvrir le PDF sur Google Drive">
                      ↗ Drive
                    </a>
                  )}
                  <button
                    className="btn"
                    style={{ fontSize:12, padding:'4px 10px', whiteSpace:'nowrap' }}
                    title="Reprendre les mêmes paramètres (site, plongeurs, palanquées) pour une nouvelle plongée"
                    disabled={cloningId !== null}
                    onClick={() => handleClone(row.id)}>
                    {cloningId === row.id ? '…' : '↺ Reprendre'}
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
