// DP Assistant — Étape 5 : Archiver la plongée sur Google Drive

// ---------------------------------------------------------------------------
// Composant fiche de sécurité rendu hors-écran pour la capture PDF
// ---------------------------------------------------------------------------
function FicheStatique({ ficheRef, answers, palanquees, divers, user, pressions }) {
  const diversById = {};
  divers.forEach(d => { diversById[d.id] = d; });

  const siteName = answers.site_nom || answers.site || '—';
  const depart   = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(' / ') || '—';
  const STRUCTURE_LABELS = { club: 'Club FFESSM associatif', sca: 'Structure Commerciale Agréée (SCA)' };
  const structure = user?.club_nom
    ? `${user.club_nom}${user.structure_type ? ' — ' + (STRUCTURE_LABELS[user.structure_type] || user.structure_type) : ''}${user.club_numero ? ' (' + user.club_numero + ')' : ''}`
    : 'Structure non renseignée';

  return (
    <div className="fiche" ref={ficheRef} style={{ background:'white' }}>
      <div className="fheader">
        <div className="left">
          <b>FICHE DE SÉCURITÉ — Art. A322-72 du Code du Sport</b>
          <h1>{siteName}</h1>
          <div className="muted" style={{ fontFamily:'var(--t-mono)', fontSize:11 }}>{structure}</div>
        </div>
        <div className="right">
          <b>{formatDateTime(answers.date)}</b>
          <div>DP : {answers.dp_nom || '—'} ({answers.dp_qual || '—'})</div>
          <div>Activité : {answers.activite || '—'}</div>
        </div>
      </div>

      <div className="fiche-grid">
        <div className="cell"><div className="k">Milieu</div><div className="v">{answers.milieu || '—'}</div></div>
        <div className="cell"><div className="k">Départ</div><div className="v">{depart}</div></div>
        <div className="cell">
          <div className="k">Mélanges</div>
          <div className="v" style={{ fontSize:12 }}>
            {[answers.air && 'Air', answers.nitrox && 'Nitrox', answers.trimix && 'Trimix', answers.oxygene_pur && 'O₂'].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <div className="cell">
          <div className="k">Conditions</div>
          <div className="v" style={{ fontSize:12, fontWeight:500 }}>{answers.meteo || '—'}</div>
        </div>
      </div>

      <h2>Palanquées — paramètres prévus</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width:28 }}>#</th>
            <th>Plongeur</th>
            <th>Aptitude</th>
            <th>Mélange</th>
            <th>Profondeur</th>
            <th>Durée</th>
            <th>DTR</th>
            <th>P. sortie</th>
          </tr>
        </thead>
        <tbody>
          {palanquees.map((p, pi) => {
            const sorted  = window.sortMembresForFiche(p.membres || []);
            const dtr     = window.calcDTR(p.profMax);
            const n4Count = sorted.filter(m => m.aptitude === 'N4').length;
            const isSFPal = sorted.length === 6 && n4Count >= 2;
            return (
              <React.Fragment key={p.id || pi}>
                {sorted.map((m, mi) => {
                  const d       = diversById[m.diverId] || {};
                  const isSF    = isSFPal && mi === sorted.length - 1 && m.aptitude === 'N4';
                  const presKey = `${p.id}-${m.diverId || m.id}`;
                  const pres    = (pressions && pressions[presKey]) || '50';
                  const presLabel = pres === 'panne d\'air' ? 'panne d\'air' : `${pres} bar`;
                  return (
                    <tr key={`${p.id}-${m.diverId}-${mi}`}>
                      {mi === 0 && (
                        <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontWeight:700, fontFamily:'var(--t-mono)' }}>
                          P{pi + 1}
                        </td>
                      )}
                      <td>
                        <b>{diverFullName(d)}</b>
                        <br />
                        <span className="muted" style={{ fontFamily:'var(--t-mono)', fontSize:10 }}>{d.licence || '—'}</span>
                      </td>
                      <td style={{ fontFamily:'var(--t-mono)', fontSize:11, whiteSpace:'nowrap' }}>
                        {m.aptitude || '—'}
                        {isSF && <span className="muted"> · SF</span>}
                      </td>
                      {mi === 0 && (
                        <>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top' }}>{p.melange || (answers.air ? 'Air' : '—')}</td>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>{p.profMax} m</td>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>{p.duree} min</td>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>{dtr} min</td>
                        </>
                      )}
                      <td style={{ fontFamily:'var(--t-mono)', fontSize:11, whiteSpace:'nowrap' }}>{presLabel}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <h2>Sécurité surface</h2>
      <div style={{ fontSize:12, columns:2, columnGap:24 }}>
        <div>• Sécurité surface : <b>{answers.sec_surface ? 'Présente' : 'Non identifiée'}</b></div>
        <div>• Plan de secours : <b>{answers.plan_secours ? 'Affiché et à jour' : 'À vérifier'}</b></div>
        <div>• Matériel O₂ vérifié : <b>{answers.o2 ? 'Oui' : 'Non'}</b></div>
        <div>• Trousse de secours + couv. iso : <b>{answers.trousse ? 'Oui' : 'Non'}</b></div>
        <div>• VHF : <b>{answers.vhf ? 'Embarquée et testée' : '—'}</b></div>
        <div>• Pavillon Alpha : <b>{answers.pavillon_alpha || answers.bouee_surface ? 'Hissé / présent' : '—'}</b></div>
        <div>• Eau douce potable : <b>{answers.eau_potable ? 'Oui' : 'Non'}</b></div>
        <div>• Moyen de rappel : <b>{answers.rappel ? 'Oui' : '—'}</b></div>
      </div>

      <div className="signatures">
        <div className="sig"><div className="area"></div><div className="k">Signature DP — {answers.dp_nom || '—'}</div></div>
        <div className="sig"><div className="area"></div><div className="k">Signature Encadrant(s)</div></div>
        <div className="sig"><div className="area"></div><div className="k">Signature Exploitant</div></div>
      </div>

      <div className="legal">
        Document à conserver 1 an minimum par l'établissement (Art. A322-72 du Code du Sport).
        Outil d'aide à la décision — la responsabilité personnelle du Directeur de Plongée demeure pleine et entière.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant check-list rendu hors-écran pour la capture PDF
// ---------------------------------------------------------------------------
function ChecklistStatique({ checklistRef, answers, checked, comments, user }) {
  const STRUCTURE_LABELS = { club: 'Club FFESSM associatif', sca: 'Structure Commerciale Agréée (SCA)' };
  const structure = user?.club_nom
    ? `${user.club_nom}${user.structure_type ? ' — ' + (STRUCTURE_LABELS[user.structure_type] || user.structure_type) : ''}${user.club_numero ? ' (' + user.club_numero + ')' : ''}`
    : 'Structure non renseignée';

  const totalItems = window.CHECKLIST_RULES.reduce((n, phase) =>
    n + phase.items.filter(it => window.matchCondition(it.when, answers)).length, 0);
  const doneItems = window.CHECKLIST_RULES.reduce((n, phase) =>
    n + phase.items.filter(it => window.matchCondition(it.when, answers) && checked[it.id]).length, 0);

  return (
    <div ref={checklistRef} style={{ background:'white', padding:'28px 32px', fontFamily:'Arial, sans-serif', fontSize:12, color:'#222' }}>
      {/* En-tête */}
      <div style={{ borderBottom:'3px solid #0a4a6e', paddingBottom:14, marginBottom:20 }}>
        <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'#888', marginBottom:6 }}>
          Check-list opérationnelle · DP Assistant
        </div>
        <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>
          {answers.site_nom || answers.site || '—'}
        </div>
        <div style={{ fontSize:11, color:'#555', display:'flex', gap:16, flexWrap:'wrap' }}>
          <span>{structure}</span>
          <span>{formatDateTime(answers.date)}</span>
          <span>DP : {answers.dp_nom || '—'} ({answers.dp_qual || '—'})</span>
          <span style={{ marginLeft:'auto', fontWeight:600, color: doneItems === totalItems ? '#27ae60' : '#e67e22' }}>
            {doneItems}/{totalItems} items validés
          </span>
        </div>
      </div>

      {/* Phases */}
      {window.CHECKLIST_RULES.map(phase => {
        const items = phase.items.filter(it => window.matchCondition(it.when, answers));
        if (items.length === 0) return null;
        const phaseDone = items.filter(it => checked[it.id]).length;
        return (
          <div key={phase.phase} style={{ marginBottom:22 }}>
            <div style={{ fontWeight:700, fontSize:13, padding:'5px 10px', marginBottom:6,
                          background:'#eef3f8', borderLeft:'4px solid #0a4a6e',
                          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>{phase.phaseTitle}</span>
              <span style={{ fontWeight:400, fontSize:11, color:'#666' }}>{phaseDone}/{items.length}</span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <tbody>
                {items.map(it => {
                  const isChecked = !!checked[it.id];
                  const comment   = comments && comments[it.id];
                  return (
                    <tr key={it.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ width:26, textAlign:'center', fontWeight:700, padding:'5px 4px',
                                   fontSize:14, color: isChecked ? '#27ae60' : '#c0392b', verticalAlign:'top' }}>
                        {isChecked ? '✓' : '✗'}
                      </td>
                      <td style={{ padding:'5px 8px 5px 4px', verticalAlign:'top',
                                   color: isChecked ? '#333' : '#c0392b' }}>
                        <div>{it.text}</div>
                        {comment && (
                          <div style={{ color:'#888', fontSize:10, marginTop:3, fontStyle:'italic', paddingLeft:8 }}>
                            ↳ {comment}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Pied */}
      <div style={{ marginTop:20, padding:'8px 12px', background:'#f8f8f8', borderRadius:4,
                    fontSize:10, color:'#aaa', borderTop:'1px solid #eee' }}>
        Document généré par DP Assistant — outil d'aide à la décision.
        Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran d'archivage principal
// ---------------------------------------------------------------------------
function ScreenArchive({ answers, palanquees, divers, user, pressions, realises, checked, comments, plongeeFigee, onStartNew, onArchiveDone }) {
  const ficheRef     = useRef(null);
  const checklistRef = useRef(null);
  const [status,     setStatus]     = useState('idle');
  const [driveLinks, setDriveLinks] = useState({ fiche:'', checklist:'' });
  const [error,      setError]      = useState('');

  // Nom de fichier : date-heure en premier pour tri naturel
  const buildFilename = (type = 'fiche-securite') => {
    const dt   = answers.date || '';
    const date = dt.slice(0, 10);
    const time = dt.length >= 16 ? dt.slice(11, 16).replace(':', 'h') : '';
    const site = (answers.site_nom || answers.site || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
    return `${date}${time ? '-' + time : ''}-${type}-${site}.pdf`;
  };

  // Génération PDF via wkhtmltopdf côté serveur
  const generatePdfBlob = async (type = 'fiche') => {
    const el       = type === 'checklist' ? checklistRef.current : ficheRef.current;
    const filename = buildFilename(type === 'checklist' ? 'checklist' : 'fiche-securite');
    if (!el) throw new Error(`Rendu ${type} introuvable.`);
    const styles = Array.from(document.querySelectorAll('link[rel=stylesheet]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`).join('\n');
    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8">
<title>${type === 'checklist' ? 'Check-list' : 'Fiche de sécurité'}</title>
${styles}
<style>
  body { background: white; padding: 0; margin: 0; }
  .fiche { box-shadow: none; max-width: 100%; }
  .no-print, .fiche-actions { display: none !important; }
</style>
</head><body>${el.outerHTML}</body></html>`;

    const csrf = document.cookie.split('; ').find(c => c.startsWith('dp_csrf='))?.split('=')[1];
    const res  = await fetch('/api/pdf/fiche', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
      body: JSON.stringify({ html, filename }),
    });
    if (!res.ok) {
      const t = await res.text();
      let detail = t.slice(0, 300);
      try { const j = JSON.parse(t); if (j?.error) detail = j.error; } catch {}
      throw new Error(`PDF ${type} — HTTP ${res.status} : ${detail}`);
    }
    return await res.blob();
  };

  const onPrintFiche = async () => {
    try {
      const blob = await generatePdfBlob('fiche');
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) { alert('Erreur PDF fiche : ' + err.message); }
  };

  const onPrintChecklist = async () => {
    try {
      const blob = await generatePdfBlob('checklist');
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) { alert('Erreur PDF check-list : ' + err.message); }
  };

  const getOrCreateFolder = async (token) => {
    const q = encodeURIComponent("name='dp-fede' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) {
      const data = await r.json();
      if (data.files && data.files.length > 0) return data.files[0].id;
    }
    const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dp-fede', mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await cr.json();
    if (!cr.ok || !folder.id) {
      const msg = folder?.error?.message || folder?.error?.status || JSON.stringify(folder).slice(0, 200);
      throw new Error(`Drive — impossible de créer le dossier dp-fede : ${msg}`);
    }
    return folder.id;
  };

  const uploadFile = async (token, blob, filename, folderId) => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type:'application/json' }));
    form.append('file', blob, filename);
    const r = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:form }
    );
    const data = await r.json();
    if (!data.id) throw new Error('Upload Drive échoué : ' + JSON.stringify(data).slice(0, 200));
    return data;
  };

  const doArchive = () => {
    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity Services non disponible — recharger la page.');
      setStatus('error');
      return;
    }
    setStatus('requesting'); setError('');

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: async (resp) => {
        if (resp.error) { setError(resp.error); setStatus('error'); return; }
        const token = resp.access_token;
        try {
          setStatus('generating');
          const fichePdf     = await generatePdfBlob('fiche');
          const checklistPdf = await generatePdfBlob('checklist');

          setStatus('uploading');
          const folderId      = await getOrCreateFolder(token);
          const ficheFile     = await uploadFile(token, fichePdf,     buildFilename('fiche-securite'), folderId);
          const clFile        = await uploadFile(token, checklistPdf,  buildFilename('checklist'),      folderId);

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

          await api.archives.create({
            site_nom:     answers.site_nom || answers.site || '',
            date_plongee: (answers.date || '').slice(0, 10),
            dp_nom:       answers.dp_nom || '',
            dp_qual:      answers.dp_qual || '',
            activite:     answers.activite || '',
            answers,
            palanquees:   enrichedPals,
            drive_link:   ficheFile.webViewLink || '',
          });

          setDriveLinks({ fiche: ficheFile.webViewLink || '', checklist: clFile.webViewLink || '' });
          setStatus('done');
          if (onArchiveDone) onArchiveDone();
        } catch (err) {
          setError(err.message);
          setStatus('error');
        }
      }
    });
    tokenClient.requestAccessToken({ prompt:'' });
  };

  // Déclencher l'archivage automatiquement à l'arrivée sur l'écran
  useEffect(() => { doArchive(); }, []);

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
          Génère la fiche de sécurité et la check-list en PDF et les dépose dans votre Google Drive
          (dossier <code>dp-fede</code>, créé automatiquement si absent).
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h2>Export Google Drive</h2></div>
        <div className="card-body" style={{ display:'grid', gap:16 }}>

          {STATUS_MSGS[status] && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                          background:'var(--bg-2)', borderRadius:8, fontSize:14, color:'var(--ink-2)' }}>
              <span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>↻</span>
              {STATUS_MSGS[status]}
            </div>
          )}

          {status === 'error' && <Alert tone="warn">Erreur : {error}</Alert>}

          {status === 'idle' && (
            <p style={{ margin:0, color:'var(--ink-3)', fontSize:14 }}>
              Autorisez l'accès à Google Drive pour générer les deux PDFs et les archiver dans <code>dp-fede</code>.
            </p>
          )}

          {status === 'done' && plongeeFigee ? (
            <div style={{ display:'grid', gap:10 }}>
              <Alert tone="ok">
                Plongée archivée et figée · 2 fichiers déposés dans <code>dp-fede</code>.
              </Alert>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', fontSize:13, color:'var(--ink-3)' }}>
                {driveLinks.fiche     && <a href={driveLinks.fiche}     target="_blank" rel="noopener noreferrer" style={{ color:'var(--marine)' }}>↗ Fiche de sécurité</a>}
                {driveLinks.fiche && driveLinks.checklist && <span>·</span>}
                {driveLinks.checklist && <a href={driveLinks.checklist} target="_blank" rel="noopener noreferrer" style={{ color:'var(--marine)' }}>↗ Check-list</a>}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                <button className="btn primary" onClick={onStartNew}>↩ Nouvelle plongée</button>
                <button className="btn" onClick={onPrintFiche}>⎙ Fiche de sécurité</button>
                <button className="btn" onClick={onPrintChecklist}>⎙ Check-list</button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              <button className="btn primary" onClick={doArchive} disabled={busy || status === 'done'}>
                {status === 'done' ? '✓ Archivée' : '↑ Archiver sur Google Drive'}
              </button>
              <button className="btn" onClick={onPrintFiche}>⎙ Fiche de sécurité</button>
              <button className="btn" onClick={onPrintChecklist}>⎙ Check-list</button>
              {status === 'done' && (
                <button className="btn" style={{ fontSize:12 }}
                  onClick={() => { setStatus('idle'); setDriveLinks({ fiche:'', checklist:'' }); setError(''); }}>
                  Ré-archiver
                </button>
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

      {/* Rendu hors-écran pour capture PDF */}
      <div style={{ position:'fixed', left:'-9999px', top:0, width:794, overflow:'visible', zIndex:-1, pointerEvents:'none' }}>
        <FicheStatique ficheRef={ficheRef} answers={answers} palanquees={palanquees}
          divers={divers} user={user} pressions={pressions} />
      </div>
      <div style={{ position:'fixed', left:'-9999px', top:0, width:794, overflow:'visible', zIndex:-1, pointerEvents:'none' }}>
        <ChecklistStatique checklistRef={checklistRef} answers={answers}
          checked={checked || {}} comments={comments || {}} user={user} />
      </div>
    </div>
  );
}

Object.assign(window, { ScreenArchive });
