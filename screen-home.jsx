// DP Assistant — Écran d'accueil

function ScreenHome({ onNew, onResume, hasDraft, plongeeFigee, onClone }) {
  const [archives,  setArchives]  = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [cloneErr,  setCloneErr]  = useState('');

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
        {plongeeFigee && (
          <p style={{ marginTop:12, fontSize:13, color:'var(--ink-3)' }}>
            La dernière plongée est figée et archivée. Commencez une nouvelle plongée ou reprenez les paramètres d'une plongée précédente ci-dessous.
          </p>
        )}
      </div>

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
                    {row.date_plongee || '—'} · DP : {row.dp_nom || '—'} ({row.dp_qual || '—'}) · {row.activite || '—'}
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
