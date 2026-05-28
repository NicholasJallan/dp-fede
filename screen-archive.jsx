// DP Assistant — Étape 5 : Archiver la plongée sur Google Drive

function FicheStatique({ ficheRef, answers, palanquees, divers }) {
  const diversById = {};
  divers.forEach(d => { diversById[d.id] = d; });

  const siteName = answers.site_nom || answers.site || '—';
  const depart   = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(' / ') || '—';

  return (
    <div className="fiche" ref={ficheRef} style={{ background:'white' }}>
      <div className="fheader">
        <div className="left">
          <b>FICHE DE SÉCURITÉ — Art. A322-72 du Code du Sport</b>
          <h1>{siteName}</h1>
          <div className="muted" style={{ fontFamily:'var(--t-mono)', fontSize:11 }}>
            {answers.structure || 'Structure non renseignée'}
          </div>
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
          <div className="v" style={{ fontSize: 12 }}>
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
                  const d    = diversById[m.diverId] || {};
                  const isSF = isSFPal && mi === sorted.length - 1 && m.aptitude === 'N4';
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

function ScreenArchive({ answers, palanquees, divers }) {
  const ficheRef = useRef(null);
  const [status,    setStatus]    = useState('idle');
  const [driveLink, setDriveLink] = useState('');
  const [error,     setError]     = useState('');

  const buildFilename = () => {
    const date = (answers.date || '').slice(0, 10);
    const site = (answers.site_nom || answers.site || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    return `fiche-securite-${date}-${site}.pdf`;
  };

  // Génération PDF côté serveur via wkhtmltopdf — récupère un Blob
  const generatePdfBlob = async () => {
    const ficheEl = ficheRef.current;
    if (!ficheEl) throw new Error('Rendu fiche introuvable.');
    const styles = Array.from(document.querySelectorAll('link[rel=stylesheet]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`).join('\n');
    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8">
<title>Fiche de sécurité</title>
${styles}
<style>
  body { background: white; padding: 0; margin: 0; }
  .fiche { box-shadow: none; max-width: 100%; }
  .no-print, .fiche-actions { display: none !important; }
</style>
</head><body>${ficheEl.outerHTML}</body></html>`;

    const csrf = document.cookie.split('; ').find(c => c.startsWith('dp_csrf='))?.split('=')[1];
    const res  = await fetch('/api/pdf/fiche', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
      body: JSON.stringify({ html, filename: buildFilename() }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('Génération serveur échouée : ' + t.slice(0, 200));
    }
    return await res.blob();
  };

  const onPrintPdf = async () => {
    try {
      const blob = await generatePdfBlob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      alert('Erreur PDF : ' + err.message);
    }
  };

  const getOrCreateFolder = async (token) => {
    const q = encodeURIComponent("name='dp-fede' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const r  = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization:`Bearer ${token}` }
    });
    const data = await r.json();
    if (data.files?.length > 0) return data.files[0].id;
    const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
      method:'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ name:'dp-fede', mimeType:'application/vnd.google-apps.folder' })
    });
    const folder = await cr.json();
    if (!folder.id) throw new Error('Création du dossier Drive échouée.');
    return folder.id;
  };

  const uploadPdf = async (token, pdfBlob, folderId) => {
    const name = buildFilename();
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name, parents:[folderId] })], { type:'application/json' }));
    form.append('file', pdfBlob, name);
    const r = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:form }
    );
    const data = await r.json();
    if (!data.id) throw new Error('Upload Drive échoué : ' + JSON.stringify(data));
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
          const pdfBlob = await generatePdfBlob();

          setStatus('uploading');
          const folderId = await getOrCreateFolder(token);
          const file     = await uploadPdf(token, pdfBlob, folderId);

          setStatus('saving');
          // Enrichir les membres avec noms/licence pour l'archive autonome
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
            drive_link:   file.webViewLink || '',
          });

          setDriveLink(file.webViewLink || '');
          setStatus('done');
        } catch (err) {
          setError(err.message);
          setStatus('error');
        }
      }
    });
    tokenClient.requestAccessToken({ prompt:'' });
  };

  const STATUS_MSGS = {
    requesting: '1/4 · Autorisation Google Drive…',
    generating: '2/4 · Génération du PDF…',
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
          Génère un PDF de la fiche de sécurité et le dépose dans votre Google Drive (dossier <code>dp-fede</code>,
          créé automatiquement si absent). La plongée sera consultable depuis l'historique.
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

          {status === 'done' && (
            <Alert tone="ok">
              Archivée dans <code>dp-fede</code>.
              {driveLink && <> · <a href={driveLink} target="_blank" rel="noopener noreferrer">Ouvrir sur Drive ↗</a></>}
            </Alert>
          )}
          {status === 'error' && <Alert tone="warn">Erreur : {error}</Alert>}

          {status === 'idle' && (
            <p style={{ margin:0, color:'var(--ink-3)', fontSize:14 }}>
              Autorisez l'accès à Google Drive pour générer le PDF et l'archiver dans <code>dp-fede</code>.
            </p>
          )}

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <button className="btn primary" onClick={doArchive} disabled={busy || status === 'done'}>
              {status === 'done' ? '✓ Archivée' : '↑ Archiver sur Google Drive'}
            </button>
            <button className="btn" onClick={onPrintPdf} title="Ouvrir le PDF dans un nouvel onglet pour imprimer">
              ⎙ Imprimer / PDF
            </button>
            {status === 'done' && (
              <button className="btn" style={{ fontSize:12 }}
                onClick={() => { setStatus('idle'); setDriveLink(''); setError(''); }}>
                Ré-archiver
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-head"><h2>Synthèse</h2></div>
        <div className="card-body">
          {[
            ['Site',       answers.site_nom || answers.site || '—'],
            ['Date',       answers.date ? formatDateTime(answers.date) : '—'],
            ['DP',         `${answers.dp_nom || '—'} (${answers.dp_qual || '—'})`],
            ['Activité',   answers.activite || '—'],
            ['Palanquées', `${palanquees.length} palanquée(s) · ${palanquees.reduce((n,p)=>n+(p.membres||[]).length,0)} plongeur(s)`],
            ['Fichier',    buildFilename()],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0',
                                   borderBottom:'1px dashed var(--line)', fontSize:13 }}>
              <span style={{ color:'var(--ink-3)', fontFamily:'var(--t-mono)', fontSize:11, textTransform:'uppercase', minWidth:100 }}>{k}</span>
              <span style={{ fontWeight:500, textAlign:'right', wordBreak:'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fiche rendue hors-écran pour la capture PDF */}
      <div style={{ position:'fixed', left:'-9999px', top:0, width:794, overflow:'visible', zIndex:-1, pointerEvents:'none' }}>
        <FicheStatique ficheRef={ficheRef} answers={answers} palanquees={palanquees} divers={divers} />
      </div>
    </div>
  );
}

Object.assign(window, { ScreenArchive });
