// DP Assistant — Étape 5 : Archiver la plongée sur Google Drive

function ScreenArchive({ answers, palanquees, divers }) {
  const [status,    setStatus]    = useState('idle'); // idle | requesting | generating | uploading | done | error
  const [driveLink, setDriveLink] = useState('');
  const [error,     setError]     = useState('');

  const buildFilename = () => {
    const date = (answers.date || '').slice(0, 10);
    const site = (answers.site_nom || answers.site || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    return `fiche-securite-${date}-${site}.pdf`;
  };

  const generatePdf = async () => {
    const ficheEl = document.querySelector('.fiche');
    if (!ficheEl) throw new Error('Élément .fiche introuvable — naviguer vers l'étape Fiche d'abord.');
    if (!window.html2canvas) throw new Error('html2canvas non chargé.');
    if (!window.jspdf?.jsPDF) throw new Error('jsPDF non chargé.');

    const canvas = await window.html2canvas(ficheEl, { scale:2, useCORS:true, logging:false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const MARGIN = 10, W = 210, H = 297;
    const imgW  = W - MARGIN * 2;
    const imgH  = (canvas.height / canvas.width) * imgW;
    const pageH = H - MARGIN * 2;
    let posY = 0;
    while (posY < imgH) {
      const clip = Math.min(pageH, imgH - posY);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', MARGIN, MARGIN - posY, imgW, imgH);
      posY += pageH;
      if (posY < imgH) pdf.addPage();
    }
    return pdf.output('blob');
  };

  const getOrCreateFolder = async (token) => {
    const q = encodeURIComponent("name='dp-fede' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const r  = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization:`Bearer ${token}` }
    });
    const data = await r.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
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
          const pdfBlob = await generatePdf();
          setStatus('uploading');
          const folderId = await getOrCreateFolder(token);
          const file     = await uploadPdf(token, pdfBlob, folderId);
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

  const statusMsg = {
    requesting: 'Autorisation Google Drive en cours…',
    generating: 'Génération du PDF…',
    uploading:  'Envoi vers Google Drive…',
  }[status] || '';

  const busy = ['requesting','generating','uploading'].includes(status);

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 5 / 5 · Archiver</div>
        <h1>Archiver la plongée</h1>
        <p>
          Génère un PDF de la fiche de sécurité et le dépose dans votre Google Drive (dossier <code>dp-fede</code>,
          créé automatiquement si absent). L'envoi se fait directement depuis votre navigateur — aucun intermédiaire.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h2>Export Google Drive</h2></div>
        <div className="card-body" style={{ display:'grid', gap:16 }}>
          {statusMsg && <div className="muted" style={{ fontSize:14 }}>{statusMsg}</div>}

          {status === 'done' && (
            <Alert tone="ok">
              Archivée dans le dossier <code>dp-fede</code> de votre Drive.
              {driveLink && <> · <a href={driveLink} target="_blank" rel="noopener noreferrer">Ouvrir ↗</a></>}
            </Alert>
          )}
          {status === 'error' && <Alert tone="warn">Erreur : {error}</Alert>}

          {status === 'idle' && (
            <p style={{ margin:0, color:'var(--ink-3)', fontSize:14 }}>
              Cliquer pour autoriser l'accès à Google Drive, générer le PDF et le déposer dans <code>dp-fede</code>.
              La fiche doit être visible à l'écran (étape 4) pour que la capture fonctionne correctement.
            </p>
          )}

          <button className="btn primary" style={{ alignSelf:'flex-start' }}
            onClick={doArchive} disabled={busy}>
            {status === 'done' ? 'Ré-archiver' : busy ? statusMsg : 'Archiver sur Google Drive'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-head"><h2>Synthèse de la plongée archivée</h2></div>
        <div className="card-body">
          {[
            ['Site',       answers.site_nom || answers.site || '—'],
            ['Date',       answers.date ? formatDateTime(answers.date) : '—'],
            ['DP',         `${answers.dp_nom || '—'} (${answers.dp_qual || '—'})`],
            ['Activité',   answers.activite || '—'],
            ['Palanquées', `${palanquees.length} palanquée(s) · ${palanquees.reduce((n,p)=>n+(p.membres||[]).length,0)} plongeurs`],
            ['Fichier',    buildFilename()],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px dashed var(--line)', fontSize:13 }}>
              <span style={{ color:'var(--ink-3)', fontFamily:'var(--t-mono)', fontSize:11, textTransform:'uppercase', minWidth:100 }}>{k}</span>
              <span style={{ fontWeight:500, textAlign:'right', wordBreak:'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenArchive });
