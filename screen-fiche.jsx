// DP Assistant — Fiche de sécurité (Art. A322-72)

const PRESSION_SORTIE_OPTIONS = [
  'panne d\'air','20','30','40','50','60','70','80','90','100','100+',
];

function ScreenFiche({ answers, palanquees, divers, setAnswer, pressions, setPressions, realises, setRealises, heuresDebut, setHeuresDebut, heuresFin, setHeuresFin }) {
  const { user } = useAuth();
  const diversById = useMemo(() => {
    const m = {};
    divers.forEach(d => m[d.id] = d);
    return m;
  }, [divers]);

  // heuresDebut, heuresFin, pressions, realises sont levés dans app.jsx
  const [finModal,      setFinModal]      = useState(null);
  const [finForm,       setFinForm]       = useState({ duree:'', profMax:'', dtr:'' });
  const [obs,           setObs]           = useState(answers.fiche_observations || '');
  const [confirmDepart, setConfirmDepart] = useState(null); // palId en attente de confirmation

  // Persister obs au global au blur
  useEffect(() => {
    if (setAnswer) setAnswer('fiche_observations', obs);
  }, [obs]);

  const nowHHMM = () => {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  };

  const diffMinutes = (startHHMM, endHHMM) => {
    const [sh, sm] = startHHMM.split(':').map(Number);
    const [eh, em] = endHHMM.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

  const startDive = (palId) => {
    // Premier départ : demander confirmation avant de verrouiller les étapes précédentes
    if (Object.keys(heuresDebut).length === 0) {
      setConfirmDepart(palId);
    } else {
      setHeuresDebut(prev => ({ ...prev, [palId]: nowHHMM() }));
    }
  };

  const confirmDepartAction = () => {
    if (!confirmDepart) return;
    setHeuresDebut(prev => ({ ...prev, [confirmDepart]: nowHHMM() }));
    setConfirmDepart(null);
  };

  const openFinModal = (palId, pal) => {
    const endTime  = nowHHMM();
    const debut    = heuresDebut[palId];
    const elapsed  = debut ? diffMinutes(debut, endTime) : null;
    const dtrBrut  = pal.dtr || window.calcDTR(pal.profMax);
    const dtrCapped = (elapsed !== null && dtrBrut > elapsed) ? elapsed : dtrBrut;
    setFinForm({
      duree:   elapsed !== null ? String(elapsed) : '',
      profMax: String(pal.profMax || ''),
      dtr:     String(dtrCapped),
    });
    setFinModal({ palId, endTime, elapsed });
  };

  const confirmFin = () => {
    if (!finModal) return;
    setHeuresFin(prev => ({ ...prev, [finModal.palId]: finModal.endTime }));
    setRealises(prev => ({ ...prev, [finModal.palId]: { ...finForm } }));
    setFinModal(null);
  };

  const setPression = (palId, diverId, v) =>
    setPressions(prev => ({ ...prev, [`${palId}-${diverId}`]: v }));

  // Téléchargement PDF côté serveur (wkhtmltopdf)
  const onPrintPdf = async () => {
    try {
      const ficheEl = document.querySelector('.fiche');
      if (!ficheEl) return;
      // URL absolue pour que wkhtmltopdf puisse charger les feuilles de style
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
        body: JSON.stringify({
          html,
          filename: `fiche-securite-${(answers.date || '').slice(0, 10)}.pdf`,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        alert('Erreur génération PDF serveur (HTTP ' + res.status + ') : ' + t.slice(0, 300) + '\n\nFallback : impression navigateur.');
        window.print();
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fiche-securite-${(answers.date || '').slice(0, 10)}.pdf`;
      a.click();
    } catch (err) {
      alert('Erreur PDF : ' + (err?.message || err) + '\n\nFallback : impression navigateur.');
      window.print();
    }
  };

  const onExportJson = () => {
    const snapshot = {
      answers, palanquees, realises, pressions, observations: obs,
      divers: divers.map(d => ({ id:d.id, nom:d.nom, prenom:d.prenom, niveau_plongeur:d.niveau_plongeur, niveau_encadrant:d.niveau_encadrant })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fiche-securite-${(answers.date || '').slice(0, 10)}.json`;
    a.click();
  };

  const siteName = answers.site_nom || answers.site || '—';
  const depart   = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(' / ') || '—';

  // Structure : depuis le compte utilisateur
  const structureLabels = {
    club: 'Club FFESSM associatif',
    sca:  'Structure Commerciale Agréée (SCA)',
    csa:  'Convention de Section d\'Activité (CSA)',
    autre:'Autre',
  };
  const structure = user?.club_nom
    ? `${user.club_nom}${user.structure_type ? ' — ' + structureLabels[user.structure_type] : ''}${user.club_numero ? ' (' + user.club_numero + ')' : ''}`
    : 'Structure non renseignée (à compléter dans Mon compte)';

  // Mélanges agrégés par palanquée
  const palMelange = (p) => {
    const arr = p.melanges || [];
    if (arr.length === 0) return p.melange || (answers.air ? 'Air' : '—');
    return arr.join(' · ');
  };

  // Aptitudes utilisées (résumé pour la fiche)
  const aptUsage = useMemo(() => {
    const counts = {};
    palanquees.forEach(p => p.membres.forEach(m => {
      const a = m.aptitude || 'Sans';
      counts[a] = (counts[a] || 0) + 1;
    }));
    return counts;
  }, [palanquees]);

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 4 / 5 · Fiche de sécurité</div>
        <h1>Fiche de sécurité <CdsLink art="A322-72" /></h1>
        <p>Document à compléter avant la mise à l'eau, à conserver 1 an minimum. Imprimable A4 portrait, lisible en noir et blanc.</p>
      </div>

      <div className="fiche-actions">
        <button className="btn" onClick={onExportJson}>⤓ Export JSON</button>
        <button className="btn primary" onClick={onPrintPdf}>Imprimer / PDF</button>
      </div>

      <div className="fiche">
        <div className="fheader">
          <div className="left">
            <b>FICHE DE SÉCURITÉ — Art. A322-72 du Code du Sport</b>
            <h1>{siteName}{answers.site_ville ? `, ${answers.site_ville}` : ''}{answers.site_pays ? `, ${answers.site_pays}` : ''}</h1>
            <div className="muted" style={{ fontFamily:'var(--t-mono)', fontSize:11 }}>
              {structure}
              {user?.president_nom && (
                <div>Président : {user.president_prenom} {user.president_nom}{user.president_tel ? ` · ${user.president_tel}` : ''}</div>
              )}
            </div>
          </div>
          <div className="right">
            <b>{formatDateTime(answers.date)}</b>
            <div>DP : {answers.dp_nom || '—'} ({answers.dp_qual || '—'})</div>
            <div>Activité : {answers.activite || '—'}</div>
            <div>Urgences : <b>{answers.urgence_num || user?.urgence_defaut || '18'}</b></div>
          </div>
        </div>

        <div className="fiche-grid">
          <div className="cell">
            <div className="k">Milieu</div>
            <div className="v">{answers.milieu || '—'}</div>
          </div>
          <div className="cell">
            <div className="k">Départ</div>
            <div className="v">{depart}{answers.shot_line ? ' · Shot-line' : ''}</div>
          </div>
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

        <h2>Palanquées — paramètres prévus et réalisés</h2>
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
              <th>Pression sortie</th>
              <th className="no-print" style={{ width:100 }}>Suivi</th>
            </tr>
          </thead>
          <tbody>
            {palanquees.map((p, pi) => {
              const sorted  = window.sortMembresForFiche(p.membres || []);
              const debut   = heuresDebut[p.id];
              const fin     = heuresFin[p.id];
              const real    = realises[p.id];
              const gpCount = sorted.filter(m => m.aptitude === 'GP').length;
              const isSFPal = sorted.length === 6 && gpCount >= 2;

              return (
                <React.Fragment key={p.id}>
                  {sorted.map((m, mi) => {
                    const d      = m._bapteme ? m : (diversById[m.diverId] || {});
                    const fullName = m._bapteme ? `${m.prenom || ''} ${(m.nom || '').toUpperCase()}` : diverFullName(d);
                    const isLast = mi === sorted.length - 1;
                    const isSF   = isSFPal && isLast && m.aptitude === 'GP';
                    const presKey = `${p.id}-${m.diverId || m.id}`;
                    return (
                      <tr key={`${p.id}-${mi}`}>
                        {mi === 0 && (
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontWeight:700, fontFamily:'var(--t-mono)' }}>
                            P{pi + 1}
                          </td>
                        )}
                        <td>
                          <b>{fullName}</b>
                          <br />
                          <span className="muted" style={{ fontFamily:'var(--t-mono)', fontSize:10 }}>
                            {m._bapteme ? 'Baptême' : (d.licence || '—')}
                          </span>
                        </td>
                        <td style={{ fontFamily:'var(--t-mono)', fontSize:11, whiteSpace:'nowrap' }}>
                          {m.aptitude || '—'}
                          {isSF && <span className="muted"> · SF</span>}
                        </td>
                        {mi === 0 && (
                          <>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top' }}>
                              {palMelange(p)}
                              {p.shot_line && <><br /><small className="muted">+ shot-line</small></>}
                              {p.no_deco && <><br /><small className="muted">no déco</small></>}
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                              <div>prévu : <b>{p.profMax} m</b></div>
                              <div className="muted">réalisé : {real ? <b>{real.profMax} m</b> : '—'}</div>
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                              <div>prévu : <b>{p.duree} min</b></div>
                              <div className="muted">réalisé : {real ? <b>{real.duree} min</b> : '—'}</div>
                            </td>
                            <td rowSpan={sorted.length} style={{ verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                              <div>prévu : <b>{p.dtr || window.calcDTR(p.profMax)} min</b></div>
                              <div className="muted">réalisé : {real ? <b>{real.dtr} min</b> : '—'}</div>
                            </td>
                          </>
                        )}
                        <td className="no-print" style={{ width: 110 }}>
                          {debut && !fin
                            ? <span className="muted" style={{ fontSize:12 }}>— en cours</span>
                            : (
                              <select className="input small tight"
                                value={pressions[presKey] || '50'}
                                onChange={e => setPression(p.id, m.diverId || m.id, e.target.value)}>
                                {PRESSION_SORTIE_OPTIONS.map(o => (
                                  <option key={o} value={o}>{o === 'panne d\'air' ? o : `${o} bar`}</option>
                                ))}
                              </select>
                            )
                          }
                        </td>
                        {mi === 0 && (
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
          {Array.isArray(answers.sec_surface_membres) && answers.sec_surface_membres.length > 0 && (
            <div>• Plongeurs surveillance : <b>{answers.sec_surface_membres.map(id => {
              const d = diversById[id]; return d ? diverFullName(d) : id;
            }).join(', ')}</b></div>
          )}
          {answers.sec_surface_externes && (
            <div>• Non-plongeurs : <b>{answers.sec_surface_externes}</b></div>
          )}
          <div>• Plan de secours : <b>{answers.plan_secours ? 'Affiché et à jour' : 'À vérifier'}</b></div>
          <div>• Matériel O₂ vérifié : <b>{answers.o2 ? 'Oui' : 'Non'}</b></div>
          <div>• Trousse de secours + couv. iso : <b>{answers.trousse ? 'Oui' : 'Non'}</b></div>
          <div>• VHF : <b>{answers.vhf ? 'Embarquée et testée' : '—'}</b></div>
          <div>• Pavillon Alpha : <b>{answers.pavillon_alpha || answers.bouee_surface ? 'Hissé / présent' : '—'}</b></div>
          <div>• Eau douce potable : <b>{answers.eau_potable ? 'Oui' : 'Non'}</b></div>
          <div>• Moyen de rappel : <b>{answers.moyen_rappel || (answers.rappel ? 'Oui' : '—')}</b></div>
          <div>• Numéro d'urgence : <b>{answers.urgence_num || user?.urgence_defaut || '18'}</b></div>
        </div>

        <h2>Aptitudes mises en œuvre</h2>
        <div style={{ fontSize: 12, display:'flex', gap:8, flexWrap:'wrap' }}>
          {Object.entries(aptUsage).map(([apt, n]) => (
            <span key={apt} className="pill outline">{apt} × {n}</span>
          ))}
          {Object.keys(aptUsage).length === 0 && <span className="muted">—</span>}
        </div>

        <h2>Observations générales</h2>
        <textarea className="textarea"
          style={{ width: '100%', minHeight: 80, fontSize: 12 }}
          value={obs} onChange={e => setObs(e.target.value)}
          placeholder={(answers.shot_line ? 'Shot-line installée. ' : '') + 'Conditions particulières, incidents, points d\'attention, signature des plongeurs…'} />

        <div className="signatures">
          <div className="sig"><div className="area"></div><div className="k">Signature DP — {answers.dp_nom || '—'}</div></div>
          <div className="sig"><div className="area"></div><div className="k">Signature Encadrant(s)</div></div>
          <div className="sig"><div className="area"></div><div className="k">Signature Exploitant</div></div>
        </div>

        <div className="legal">
          Document à conserver 1 an minimum par l'établissement <CdsLink art="A322-72" compact />.
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
                    const raw = e.target.value;
                    const v   = parseInt(raw, 10);
                    const max = finModal.elapsed;
                    const newDuree = (max !== null && v > max) ? String(max) : raw;
                    // DTR ne peut pas dépasser la durée réelle de la plongée
                    setFinForm(f => {
                      const dtrInt   = parseInt(f.dtr, 10);
                      const dureeInt = parseInt(newDuree, 10);
                      const capDtr = (isFinite(dtrInt) && isFinite(dureeInt) && dtrInt > dureeInt)
                        ? String(dureeInt)
                        : f.dtr;
                      return { ...f, duree: newDuree, dtr: capDtr };
                    });
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
                <label>DTR réel (min){finForm.duree ? ` — max ${finForm.duree} min` : ''}</label>
                <input className="input" type="number" min="0"
                  max={finForm.duree ? parseInt(finForm.duree, 10) : 120}
                  value={finForm.dtr}
                  onChange={e => {
                    const raw = e.target.value;
                    const v   = parseInt(raw, 10);
                    const max = parseInt(finForm.duree, 10);
                    // Capper DTR à la durée réelle de la plongée
                    const clamped = (isFinite(max) && isFinite(v) && v > max) ? String(max) : raw;
                    setFinForm(f => ({ ...f, dtr: clamped }));
                  }}
                  placeholder="ex. 4" />
                <div className="field-hint">La DTR ne peut pas excéder la durée réelle de la plongée.</div>
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

      {/* Confirmation premier départ — verrouillage irréversible des étapes précédentes */}
      {confirmDepart && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:28, maxWidth:420, width:'100%',
                        boxShadow:'0 8px 40px rgba(0,0,0,0.3)', display:'grid', gap:18 }}>
            <h2 style={{ margin:0, fontSize:18 }}>Confirmer le départ en plongée</h2>
            <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
              Dès que la première palanquée est mise à l'eau, <b>les étapes Profil, Palanquées et Check-list seront définitivement verrouillées</b> et ne pourront plus être modifiées.
            </p>
            <p style={{ margin:0, color:'var(--ink-3)', fontSize:13, lineHeight:1.5 }}>
              Confirmez-vous que toutes les informations préalables sont complètes et validées ?
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn" onClick={() => setConfirmDepart(null)}>Annuler</button>
              <button className="btn primary" onClick={confirmDepartAction}>▶ Confirmer le départ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ScreenFiche });
