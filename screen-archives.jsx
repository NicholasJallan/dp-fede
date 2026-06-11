// DP Assistant — Historique des plongées archivées (lecture seule)

function ArchiveDetail({ item, onBack }) {
  const data      = item;
  const answers   = (typeof data.answers   === 'string' ? JSON.parse(data.answers)   : data.answers)   || {};
  const palanquees = (typeof data.palanquees === 'string' ? JSON.parse(data.palanquees) : data.palanquees) || [];

  const depart = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(' / ') || '—';

  return (
    <div>
      <div className="page-head">
        <button className="btn" onClick={onBack} style={{ marginBottom:12 }}>← Retour à l'historique</button>
        <div className="eyebrow">Archive · {data.date_plongee || '—'}</div>
        <h1>{data.site_nom || '—'}</h1>
        <p style={{ margin:0, fontSize:14, color:'var(--ink-3)' }}>
          DP : <b>{data.dp_nom || '—'}</b> ({data.dp_qual || '—'}) · {data.activite || '—'}
          {data.drive_link && (
            <> · <a href={data.drive_link} target="_blank" rel="noopener noreferrer">Ouvrir sur Drive ↗</a></>
          )}
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h2>Informations générales</h2></div>
        <div className="card-body">
          {[
            ['Site',      data.site_nom  || '—'],
            ['Date',      data.date_plongee || '—'],
            ['DP',        `${data.dp_nom || '—'} (${data.dp_qual || '—'})`],
            ['Activité',  data.activite  || '—'],
            ['Milieu',    answers.milieu || '—'],
            ['Départ',    depart],
            ['Prof. max', answers.prof_max ? `${answers.prof_max} m` : '—'],
            ['Structure', answers.structure || '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
                                   borderBottom:'1px dashed var(--line)', fontSize:13 }}>
              <span style={{ color:'var(--ink-3)', fontFamily:'var(--t-mono)', fontSize:11, textTransform:'uppercase', minWidth:120 }}>{k}</span>
              <span style={{ fontWeight:500, textAlign:'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {palanquees.length > 0 && (
        <div className="card" style={{ marginTop:16 }}>
          <div className="card-head"><h2>Palanquées</h2></div>
          <div className="card-body" style={{ padding:0 }}>
            {palanquees.map((p, pi) => {
              const sorted = window.sortMembresForFiche(p.membres || []);
              return (
                <div key={p.id || pi} style={{ padding:'12px 16px', borderBottom:'1px solid var(--line)' }}>
                  <div style={{ fontWeight:700, fontFamily:'var(--t-mono)', fontSize:12, marginBottom:8, color:'var(--ink-2)' }}>
                    P{pi + 1} · {p.profMax} m · {p.duree} min · DTR {window.calcDTR(p.profMax)} min · {p.melange || 'Air'}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {sorted.map((m, mi) => (
                      <div key={mi} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13 }}>
                        <span style={{ fontFamily:'var(--t-mono)', fontSize:10, background:'var(--bg-2)',
                                        padding:'1px 6px', borderRadius:4, minWidth:56, textAlign:'center' }}>
                          {m.aptitude || '—'}
                        </span>
                        <span>{m.prenom || ''} {(m.nom || '?').toUpperCase()}</span>
                        {m.licence && <span className="muted" style={{ fontFamily:'var(--t-mono)', fontSize:10 }}>{m.licence}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {answers.meteo && (
        <div className="card" style={{ marginTop:16 }}>
          <div className="card-head"><h2>Conditions météo / mer</h2></div>
          <div className="card-body">
            <p style={{ margin:0, fontSize:14 }}>{answers.meteo}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ScreenArchives() {
  const [archives, setArchives] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [error,    setError]    = useState('');

  const refresh = useCallback(() => {
    api.dives.listArchived()
      .then(rows => setArchives(rows))
      .catch(err => { setError(err.message); setArchives([]); });
  }, []);

  useEffect(() => {
    refresh();
    // Auto-refresh quand l'outbox change ou qu'un sync se termine — ainsi
    // les badges « en attente » disparaissent dès que le serveur a accusé.
    const onChange = () => refresh();
    window.addEventListener('dp:dataChanged', onChange);
    window.addEventListener('dp:syncDone',    onChange);
    return () => {
      window.removeEventListener('dp:dataChanged', onChange);
      window.removeEventListener('dp:syncDone',    onChange);
    };
  }, [refresh]);

  const openArchive = async (id) => {
    setLoadingId(id); setError('');
    try {
      const data = await api.dives.get(id);
      setSelected(data);
    } catch (err) {
      setError('Impossible de charger l\'archive : ' + err.message);
    } finally {
      setLoadingId(null);
    }
  };

  if (selected) {
    return <ArchiveDetail item={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Historique · Lecture seule</div>
        <h1>Plongées archivées</h1>
        <p>Consultation uniquement — aucune modification possible.</p>
      </div>

      {error && <Alert tone="warn">{error}</Alert>}

      <div className="card">
        <div className="card-head"><h2>Archives</h2></div>
        <div className="card-body" style={{ padding:0 }}>
          {archives === null && !error && (
            <div className="muted" style={{ padding:20, textAlign:'center' }}>Chargement…</div>
          )}
          {archives?.length === 0 && !error && (
            <div className="muted" style={{ padding:20, textAlign:'center', fontSize:14 }}>
              Aucune plongée archivée pour le moment.
            </div>
          )}
          {archives?.map(row => {
            const syncBadge = row._pending
              ? { label: '● en attente d\'envoi',  color: 'var(--coral, #e07856)' }
              : (row.synced && !row.drive_synced)
                ? { label: '△ Drive en attente',   color: 'var(--sun, #e2a23a)' }
                : null;
            const rowId = row.client_uuid || row.id;
            const openable = !row._pending; // une archive non encore synced n'a pas d'id serveur
            return (
              <button key={rowId}
                onClick={() => openable && row.id && openArchive(row.id)}
                disabled={loadingId !== null || !openable}
                title={!openable ? 'Synchronisation en attente — ouverture indisponible' : undefined}
                style={{
                  display:'grid',
                  gridTemplateColumns:'1fr auto',
                  gap:'2px 12px',
                  width:'100%',
                  padding:'12px 16px',
                  background: loadingId === row.id ? 'var(--bg-2)' : 'transparent',
                  border:'none',
                  borderBottom:'1px solid var(--line)',
                  cursor: openable ? 'pointer' : 'default',
                  textAlign:'left',
                  transition:'background 150ms',
                  opacity: openable ? 1 : 0.7,
                }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{row.site_nom || '—'}</div>
                <div style={{ fontFamily:'var(--t-mono)', fontSize:11, color:'var(--ink-3)', textAlign:'right' }}>
                  {row.date_plongee || '—'}
                </div>
                <div style={{ fontSize:12, color:'var(--ink-3)' }}>
                  DP : {row.dp_nom || '—'} ({row.dp_qual || '—'}) · {row.activite || '—'}
                </div>
                <div style={{ fontSize:11, textAlign:'right', display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center' }}>
                  {syncBadge && (
                    <span style={{ color: syncBadge.color, fontWeight:600 }}>{syncBadge.label}</span>
                  )}
                  {row.drive_link && !syncBadge && (
                    <span style={{ color:'var(--ink-4)' }}>↗ Drive</span>
                  )}
                  {loadingId === row.id ? ' …' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenArchives });
