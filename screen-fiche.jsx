// DP Assistant — Fiche de sécurité (Art. A322-72)

function sortMembresForFiche(membres) {
  const priority = { E4:0, E3:1, E2:2, E1:3, N4:4, PA60:5, PA40:6, PA20:7, PE60:8, PE40:9, PE20:10, PTH120:11, PTH70:12, Baptême:13 };
  const n4Count = membres.filter(m => m.aptitude === 'N4').length;
  const isSerreFilePal = membres.length === 6 && n4Count >= 2;

  const sorted = [...membres].sort((a, b) =>
    (priority[a.aptitude] ?? 99) - (priority[b.aptitude] ?? 99)
  );

  if (isSerreFilePal) {
    let sfIdx = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].aptitude === 'N4') { sfIdx = i; break; }
    }
    if (sfIdx !== -1) {
      const sf = sorted.splice(sfIdx, 1)[0];
      sorted.push(sf);
    }
  }
  return sorted;
}

function ScreenFiche({ answers, palanquees, divers }) {
  const diversById = useMemo(() => {
    const m = {};
    divers.forEach(d => m[d.id] = d);
    return m;
  }, [divers]);

  const [heuresDebut, setHeuresDebut] = useState({});
  const [heuresFin,   setHeuresFin]   = useState({});
  const [realises,    setRealises]    = useState({});
  const [finModal,    setFinModal]    = useState(null);
  const [finForm,     setFinForm]     = useState({ duree:'', profMax:'', dtr:'' });

  const nowHHMM = () => {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  };

  const diffMinutes = (startHHMM, endHHMM) => {
    const [sh, sm] = startHHMM.split(':').map(Number);
    const [eh, em] = endHHMM.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // passage minuit
    return diff;
  };

  const startDive = (palId) =>
    setHeuresDebut(prev => ({ ...prev, [palId]: nowHHMM() }));

  const openFinModal = (palId, pal) => {
    const endTime = nowHHMM();
    const debut   = heuresDebut[palId];
    const elapsed = debut ? diffMinutes(debut, endTime) : null;
    setFinForm({
      duree:   elapsed !== null ? String(elapsed) : '',
      profMax: String(pal.profMax || ''),
      dtr:     String(window.calcDTR(pal.profMax)),
    });
    setFinModal({ palId, endTime, elapsed });
  };

  const confirmFin = () => {
    if (!finModal) return;
    setHeuresFin(prev => ({ ...prev, [finModal.palId]: finModal.endTime }));
    setRealises(prev => ({ ...prev, [finModal.palId]: { ...finForm } }));
    setFinModal(null);
  };

  const onPrint = () => window.print();

  const onExportJson = () => {
    const snapshot = {
      answers, palanquees, realises,
      divers: divers.map(d => ({ id:d.id, nom:d.nom, prenom:d.prenom, niveau_plongeur:d.niveau_plongeur, niveau_encadrant:d.niveau_encadrant })),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fiche-securite-${(answers.date || '').slice(0, 10)}.json`;
    a.click();
  };

  const siteName = answers.site_nom || answers.site || '—';
  const depart   = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(' / ') || '—';

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 4 / 5 · Fiche de sécurité</div>
        <h1>Fiche de sécurité — Art. A322-72</h1>
        <p>Document à compléter avant la mise à l'eau, à conserver 1 an minimum par l'établissement. Imprimable A4 portrait, lisible en noir et blanc.</p>
      </div>

      <div className="fiche-actions">
        <button className="btn" onClick={onExportJson}>⤓ Export JSON</button>
        <button className="btn primary" onClick={onPrint}>Imprimer / PDF</button>
      </div>

      <div className="fiche">
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
          <div className="cell">
            <div className="k">Milieu</div>
            <div className="v">{answers.milieu || '—'}</div>
          </div>
          <div className="cell">
            <div className="k">Départ</div>
            <div className="v">{depart}</div>
          </div>
          <div className="cell">
            <div className="k">Distance / Délai secours</div>
            <div className="v">{answers.distance_cote ? `${answers.distance_cote} M · ` : ''}{answers.delai_secours || '—'}</div>
          </div>
          <div className="cell">
            <div className="k">Conditions</div>
            <div className="v" style={{ fontSize:12, fontWeight:500 }}>{answers.meteo || '—'}</div>
          </div>
        </div>

        <h2>Palanquées — paramètres prévus et réalisés</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width:28 }}>#</th>
              <th>Plongeur</th>
              <th>Aptitude</th>
              <th>Mélange</th>
              <th>Prof. prévue</th>
              <th>Durée prévue</th>
              <th>DTR</th>
              <th className="no-print" style={{ width:100 }}>Suivi</th>
            </tr>
          </thead>
          <tbody>
            {palanquees.map((p, pi) => {
              const sorted  = sortMembresForFiche(p.membres || []);
              const dtr      = window.calcDTR(p.profMax);
              const n4Count  = sorted.filter(m => m.aptitude === 'N4').length;
              const isSFPal  = sorted.length === 6 && n4Count >= 2;
              const debut    = heuresDebut[p.id];
              const fin      = heuresFin[p.id];
              const real     = realises[p.id];

              return (
                <React.Fragment key={p.id}>
                  {sorted.map((m, mi) => {
                    const d      = diversById[m.diverId] || {};
                    const isLast = mi === sorted.length - 1;
                    const isSF   = isSFPal && isLast && m.aptitude === 'N4';
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
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top' }}>
                              {p.melange || (answers.air ? 'Air' : '—')}
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                              {p.profMax} m
                              {real && <><br /><small className="muted">réel : {real.profMax} m</small></>}
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                              {p.duree} min
                              {real && <><br /><small className="muted">réel : {real.duree} min</small></>}
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                              {dtr} min
                              {real && <><br /><small className="muted">réel : {real.dtr} min</small></>}
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', minWidth:90 }} className="no-print">
                              {!debut
                                ? <button className="btn" style={{ fontSize:11, minHeight:28, padding:'3px 8px', display:'block', marginBottom:4 }}
                                    onClick={() => startDive(p.id)}>▶ Début</button>
                                : <div style={{ fontFamily:'var(--t-mono)', fontSize:11, marginBottom:4 }}>Entrée : <b>{debut}</b></div>
                              }
                              {debut && !fin && (
                                <button className="btn" style={{ fontSize:11, minHeight:28, padding:'3px 8px', display:'block' }}
                                  onClick={() => openFinModal(p.id, p)}>■ Fin</button>
                              )}
                              {fin && <div style={{ fontFamily:'var(--t-mono)', fontSize:11 }}>Sortie : <b>{fin}</b></div>}
                            </td>
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

      {finModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setFinModal(null)}>
          <div className="modal" style={{ maxWidth:420 }}>
            <div className="modal-head">
              <h3>Fin de plongée — P{palanquees.findIndex(p => p.id === finModal.palId) + 1}</h3>
              <button className="x" onClick={() => setFinModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gap:12 }}>
              <div className="field">
                <label>Durée réelle (min){finModal.elapsed !== null ? ` — max ${finModal.elapsed} min` : ''}</label>
                <input className="input" type="number" min="1" max={finModal.elapsed ?? 240}
                  value={finForm.duree}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    const max = finModal.elapsed;
                    const clamped = max !== null && v > max ? String(max) : e.target.value;
                    setFinForm(f => ({ ...f, duree: clamped }));
                  }}
                  placeholder="ex. 42" />
              </div>
              <div className="field">
                <label>Profondeur max réalisée (m)</label>
                <input className="input" type="number" min="1" max="200"
                  value={finForm.profMax} onChange={e => setFinForm(f => ({ ...f, profMax:e.target.value }))}
                  placeholder="ex. 35" />
              </div>
              <div className="field">
                <label>DTR réel (min)</label>
                <input className="input" type="number" min="0" max="120"
                  value={finForm.dtr} onChange={e => setFinForm(f => ({ ...f, dtr:e.target.value }))}
                  placeholder="ex. 4" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setFinModal(null)}>Annuler</button>
              <button className="btn primary" onClick={confirmFin}
                disabled={!finForm.duree || !finForm.profMax}>Valider</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ScreenFiche });
