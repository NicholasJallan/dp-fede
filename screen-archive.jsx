// DP Assistant — Étape 5 : Archiver la plongée sur Google Drive

// ---------------------------------------------------------------------------
// Composant fiche de sécurité rendu hors-écran pour la capture PDF
// ---------------------------------------------------------------------------
function FicheStatique({ ficheRef, answers, palanquees, divers, user, pressions, realises, heuresDebut, heuresFin }) {
  const diversById = {};
  divers.forEach(d => { diversById[d.id] = d; });

  const siteName = answers.site_nom || answers.site || '—';
  const depart   = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(' / ') || '—';
  const STRUCTURE_LABELS = {
    club: 'Club FFESSM associatif',
    sca:  'Structure Commerciale Agréée (SCA)',
    csa:  'Convention de Section d\'Activité (CSA)',
    autre:'Autre',
  };
  const structure = user?.club_nom
    ? `${user.club_nom}${user.structure_type ? ' — ' + (STRUCTURE_LABELS[user.structure_type] || user.structure_type) : ''}${user.club_numero ? ' (' + user.club_numero + ')' : ''}`
    : 'Structure non renseignée';

  const palMelange = (p) => {
    const arr = p.melanges || [];
    return arr.length > 0 ? arr.join(' · ') : 'Air';
  };

  const allMelanges = (() => {
    const all = new Set();
    palanquees.forEach(p => (p.melanges || []).forEach(m => all.add(m)));
    return all.size > 0 ? [...all].join(' · ') : '—';
  })();

  const aptUsage = (() => {
    const counts = {};
    palanquees.forEach(p => (p.membres || []).forEach(m => {
      const a = m.aptitude || 'Sans';
      counts[a] = (counts[a] || 0) + 1;
    }));
    return counts;
  })();

  const obs = answers.fiche_observations || '';
  const sortFn = window.sortMembresForFiche || ((arr) => arr);

  const cellLabel = { fontSize:9, color:'#888', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:1 };

  return (
    <div className="fiche" ref={ficheRef} style={{ background:'white' }}>
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

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, margin:'12px 0 6px' }}>
        <div style={{ padding:'2px 0' }}>
          <div style={{ fontFamily:'var(--t-mono)', fontSize:9.5, letterSpacing:'0.06em', textTransform:'uppercase', color:'#888' }}>Milieu</div>
          <div style={{ fontWeight:600, fontSize:13 }}>{answers.milieu || '—'}</div>
        </div>
        <div style={{ padding:'2px 0' }}>
          <div style={{ fontFamily:'var(--t-mono)', fontSize:9.5, letterSpacing:'0.06em', textTransform:'uppercase', color:'#888' }}>Départ</div>
          <div style={{ fontWeight:600, fontSize:13 }}>{depart}{answers.shot_line ? ' · Shot-line' : ''}</div>
        </div>
        <div style={{ padding:'2px 0' }}>
          <div style={{ fontFamily:'var(--t-mono)', fontSize:9.5, letterSpacing:'0.06em', textTransform:'uppercase', color:'#888' }}>Mélanges</div>
          <div style={{ fontWeight:600, fontSize:12 }}>{allMelanges}</div>
        </div>
      </div>
      <div style={{ margin:'0 0 18px', padding:'2px 0' }}>
        <div style={{ fontFamily:'var(--t-mono)', fontSize:9.5, letterSpacing:'0.06em', textTransform:'uppercase', color:'#888' }}>Conditions</div>
        <div style={{ fontWeight:500, fontSize:12 }}>{answers.meteo || '—'}</div>
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
          </tr>
        </thead>
        <tbody>
          {palanquees.map((p, pi) => {
            const sorted  = sortFn(p.membres || []);
            const debut   = heuresDebut && heuresDebut[p.id];
            const fin     = heuresFin   && heuresFin[p.id];
            const real    = realises    && realises[p.id];
            const gpCount = sorted.filter(m => m.aptitude === 'GP').length;
            const isSFPal = gpCount >= 2;
            const palType = window.getPalType ? window.getPalType(p.membres || []) : '';
            const rowCls  = palType ? `row-${palType}` : '';
            const dtrPrevu = p.dtr || window.calcDTR(p.profMax);

            return (
              <React.Fragment key={p.id || pi}>
                {sorted.map((m, mi) => {
                  const d        = m._bapteme ? m : (diversById[m.diverId] || {});
                  const fullName = m._bapteme ? `${m.prenom || ''} ${(m.nom || '').toUpperCase()}` : diverFullName(d);
                  const isLast   = mi === sorted.length - 1;
                  const isSF     = isSFPal && isLast && m.aptitude === 'GP';
                  const presKey  = `${p.id}-${m.diverId || m.id}`;
                  // Si la palanquée est terminée mais qu'aucune pression n'a été
                  // explicitement saisie, on retombe sur la valeur par défaut 50 bar
                  // affichée dans le sélecteur de l'écran fiche (sécurité au cas où
                  // l'état serait antérieur à la matérialisation automatique).
                  const presRaw  = pressions && pressions[presKey];
                  const pres     = presRaw !== undefined ? presRaw : (fin ? '50' : null);
                  const presLabel = pres
                    ? (pres === "panne d'air" ? "panne d'air" : `${pres} bar`)
                    : '—';
                  return (
                    <tr key={`${p.id}-${mi}`} className={rowCls}>
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
                            {p.no_deco   && <><br /><small className="muted">no déco</small></>}
                          </td>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top' }}>
                            <div style={{ paddingBottom:3, marginBottom:4, borderBottom:'1px solid #ddd' }}>
                              <div style={cellLabel}>Prévu</div>
                              <b>{p.profMax} m</b>
                            </div>
                            <div>
                              <div style={cellLabel}>Réalisé</div>
                              <b style={{ color: real ? 'inherit' : '#bbb' }}>{real ? `${real.profMax} m` : '—'}</b>
                            </div>
                          </td>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top' }}>
                            <div style={{ paddingBottom:3, marginBottom:4, borderBottom:'1px solid #ddd' }}>
                              <div style={cellLabel}>Prévu</div>
                              <b>{p.duree} min</b>
                            </div>
                            <div>
                              <div style={cellLabel}>Réalisé</div>
                              <b style={{ color: real ? 'inherit' : '#bbb' }}>{real ? `${real.duree} min` : '—'}</b>
                              {debut && (
                                <div style={{ fontSize:10, color:'#888', marginTop:2, fontFamily:'monospace' }}>
                                  {debut}{fin ? ` → ${fin}` : ' →…'}
                                </div>
                              )}
                            </div>
                          </td>
                          <td rowSpan={sorted.length} style={{ verticalAlign:'top' }}>
                            <div style={{ paddingBottom:3, marginBottom:4, borderBottom:'1px solid #ddd' }}>
                              <div style={cellLabel}>Prévu</div>
                              <b>{dtrPrevu} min</b>
                              {p.no_deco && <div style={{ fontSize:9, color:'#2d8653', fontWeight:600, marginTop:2 }}>▲ no déco</div>}
                            </div>
                            <div>
                              <div style={cellLabel}>Réalisé</div>
                              <b style={{ color: real ? 'inherit' : '#bbb' }}>{real ? `${real.dtr} min` : '—'}</b>
                            </div>
                          </td>
                        </>
                      )}
                      <td style={{ fontFamily:'var(--t-mono)', fontSize:11, whiteSpace:'nowrap' }}>{presLabel}</td>
                    </tr>
                  );
                })}
                {real?.commentaire && (
                  <tr className={rowCls}>
                    <td colSpan={99} style={{ padding:'6px 10px', fontSize:11, color:'#333',
                                              borderTop:'1px dashed #ddd', whiteSpace:'pre-wrap' }}>
                      <b style={{ fontFamily:'var(--t-mono)', fontSize:9.5, textTransform:'uppercase',
                                  letterSpacing:'0.04em', color:'#888', marginRight:8 }}>Commentaire</b>
                      {real.commentaire}
                    </td>
                  </tr>
                )}
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
        <div>• Coordonnées secours : <b>{answers.coords_secours ? 'Disponibles et affichées' : 'À vérifier'}</b></div>
        <div>• Matériel O₂ vérifié : <b>{answers.o2 ? 'Oui' : 'Non'}</b></div>
        <div>• Trousse de secours + couv. iso : <b>{answers.trousse ? 'Oui' : 'Non'}</b></div>
        <div>• VHF : <b>{answers.vhf ? 'Embarquée et testée' : '—'}</b></div>
        <div>• Pavillon Alpha : <b>{answers.pavillon_alpha || answers.bouee_surface ? 'Hissé / présent' : '—'}</b></div>
        <div>• Eau douce potable : <b>{answers.eau_potable ? 'Oui' : 'Non'}</b></div>
        <div>• Moyen de rappel : <b>{answers.rappel ? 'Oui' : '—'}</b></div>
        <div>• Numéro d'urgence : <b>{answers.urgence_num || user?.urgence_defaut || '18'}</b></div>
      </div>

      <h2>Conduite à tenir — déclenchement des secours</h2>
      <div style={{ fontSize:12, border:'1px solid #000', padding:'8px 10px', borderRadius:4 }}>
        <div style={{ fontWeight:700, fontSize:13 }}>
          ☎ URGENCE : {answers.urgence_num || user?.urgence_defaut || '18'}
          <span className="muted" style={{ fontWeight:400 }}> · 112 (Europe) · 196 (secours en mer · CROSS)</span>
        </div>
        <div style={{ marginTop:4 }}>1. Sortir la victime de l'eau · 2. O₂ normobare 15 L/min · 3. Alerter les secours · 4. Surveiller / réanimer si besoin.</div>
        <div>• Lieu / RDV secours : <b>{answers.site_acces_secours || answers.site_nom || '—'}</b></div>
        <div>• Coordonnées GPS : <b>{(answers.site_coords?.lat != null)
          ? `${Number(answers.site_coords.lat).toFixed(5)}, ${Number(answers.site_coords.lng).toFixed(5)}`
          : '—'}</b></div>
        <div>• Caisson / hôpital de référence : <b>{answers.site_caisson || '—'}</b></div>
      </div>

      <h2>Aptitudes mises en œuvre</h2>
      <div style={{ fontSize:12, display:'flex', gap:8, flexWrap:'wrap' }}>
        {Object.entries(aptUsage).map(([apt, n]) => (
          <span key={apt} className="pill outline">{apt} × {n}</span>
        ))}
        {Object.keys(aptUsage).length === 0 && <span className="muted">—</span>}
      </div>

      <h2>Paramètres complémentaires</h2>
      <div style={{ fontSize:12, columns:2, columnGap:24 }}>
        {answers.prof_max && <div>• Profondeur max autorisée : <b>{answers.prof_max}</b></div>}
        <div>• Paliers décompression : <b>{answers.paliers ? 'Autorisés' : 'Non autorisés'}</b></div>
        {answers.successive && <div>• Plongée successive dans la journée : <b>Prévue</b></div>}
        {answers.maree_relevant && answers.maree_horaire && (
          <div>• Marées : <b>{answers.maree_horaire}</b></div>
        )}
        {answers.depart_bateau && (
          <div>• Chef de bord : <b>{answers.chef_bord ? 'Désigné' : 'Non désigné'}</b></div>
        )}
        {answers.depart_bateau && answers.distance_cote && (
          <div>• Distance côte : <b>{answers.distance_cote} M nautiques</b></div>
        )}
        {answers.recycleur && (
          <div>• Recycleurs : <b>Oui{answers.recycleur_modeles ? ` — ${answers.recycleur_modeles.replace(/\n/g, ' / ')}` : ''}</b>
            {answers.mixage_co_rec && <span style={{ color:'#888' }}> · CO+OC mixés</span>}
          </div>
        )}
        {answers.bloc_relais && (
          <div>• Bloc relais / déco : <b>{Array.isArray(answers.bloc_relais_gaz) && answers.bloc_relais_gaz.length > 0
            ? answers.bloc_relais_gaz.join(' · ') : 'Oui'}</b></div>
        )}
        {answers.parachute_obligatoire && <div>• Parachute de palier : <b>Obligatoire par palanquée</b></div>}
        {answers.parachute_par_plongeur && <div>• Parachute individuel : <b>Requis — chaque plongeur</b></div>}
        {answers.mineurs && <div>• Mineurs : <b>Présents</b></div>}
        {answers.etrangers && <div>• Brevets étrangers : <b>Présents — évaluation E3</b></div>}
        {answers.handisub && <div>• Handisub : <b>Présent(s)</b></div>}
      </div>

      {obs && (
        <>
          <h2>Observations générales</h2>
          <div style={{ fontSize:12, whiteSpace:'pre-wrap', padding:'8px 10px', border:'1px solid #ddd', borderRadius:4, background:'#fafafa' }}>
            {obs}
          </div>
        </>
      )}

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
function ScreenArchive({ answers, palanquees, divers, user, pressions, realises, heuresDebut, heuresFin, checked, comments, plongeeFigee, onStartNew, onArchiveDone, diveId }) {
  const { showToast } = useToasts();
  const ficheRef     = useRef(null);
  const checklistRef = useRef(null);
  const [status,         setStatus]         = useState('idle');
  const [driveLinks,     setDriveLinks]     = useState({ fiche:'', checklist:'' });
  const [error,          setError]          = useState('');
  // true uniquement si la plongée était déjà archivée AVANT d'arriver sur cet
  // écran (chargement depuis l'historique). Distinct de plongeeFigee qui est
  // mis à true par confirmArchive() avant la première visite sur cet écran.
  const [alreadyArchived, setAlreadyArchived] = useState(false);
  const [savedDriveLink,  setSavedDriveLink]  = useState(null);
  // Vrai une fois que init() a vérifié le statut de la plongée. Empêche
  // useEffect([online]) de déclencher doArchive() avant que init() ait
  // eu le temps de détecter une plongée déjà archivée.
  const [initialized,     setInitialized]     = useState(false);
  const online = window.useOnline ? window.useOnline() : true;

  // Enqueue offline : enregistre l'archive localement (passe via offline-api
  // qui pose un client_uuid et déclenche le sync). Le rendu PDF a besoin de
  // pressions/realises/heuresDebut/heuresFin/checked/comments — on les passe
  // dans _render pour rejouer le rendu plus tard.
  const saveOffline = useCallback(async () => {
    setError('');
    try {
      const diversById = {};
      divers.forEach(d => { diversById[d.id] = d; });
      const enrichedPals = palanquees.map(p => ({
        ...p,
        membres: (p.membres || []).map(m => {
          const d = diversById[m.diverId] || {};
          return { ...m, nom: d.nom || '?', prenom: d.prenom || '', licence: d.licence || '' };
        })
      }));

      if (diveId) {
        await api.dives.update(diveId, {
          status:       'archived',
          closed_at:    new Date().toISOString(),
          site_nom:     answers.site_nom || answers.site || '',
          dp_nom:       answers.dp_nom || '',
          dp_qual:      answers.dp_qual || '',
          activite:     answers.activite || '',
          date_plongee: answers.date || '',
          answers,
          palanquees:   enrichedPals,
          render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
        });
      } else {
        await api.dives.create({
          status:       'archived',
          site_nom:     answers.site_nom || answers.site || '',
          date_plongee: (answers.date || '').slice(0, 10),
          dp_nom:       answers.dp_nom || '',
          dp_qual:      answers.dp_qual || '',
          activite:     answers.activite || '',
          answers,
          palanquees:   enrichedPals,
          drive_link:   '',
          render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
        });
      }
      setStatus('queued');
      if (onArchiveDone) onArchiveDone();
    } catch (err) {
      setError(err.message);
    }
  }, [diveId, answers, palanquees, divers, pressions, realises, heuresDebut, heuresFin, checked, comments, onArchiveDone]);

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

    const csrf = window.getCsrfToken ? window.getCsrfToken() : '';
    const res  = await fetch('/api/pdf/fiche', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ html, filename }),
    });
    if (!res.ok) {
      const t = await res.text();
      let detail = t.slice(0, 300);
      // Best-effort : parser le body en JSON pour extraire {error}. Si ce n'est
      // pas du JSON, on garde le slice texte ci-dessus comme détail.
      try { const j = JSON.parse(t); if (j?.error) detail = j.error; }
      catch { /* fallback texte déjà défini */ }
      throw new Error(`PDF ${type} — HTTP ${res.status} : ${detail}`);
    }
    return await res.blob();
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

  // Logique d'archivage une fois le token Drive obtenu (pré-stocké ou frais via GIS).
  const proceedWithToken = async (token) => {
    try {
      setStatus('generating');
      const fichePdf     = await generatePdfBlob('fiche');
      const checklistPdf = await generatePdfBlob('checklist');

      setStatus('uploading');
      let folderId, ficheFile, clFile;
      try {
        folderId  = await getOrCreateFolder(token);
        ficheFile = await uploadFile(token, fichePdf,     buildFilename('fiche-securite'), folderId);
        clFile    = await uploadFile(token, checklistPdf, buildFilename('checklist'),      folderId);
      } catch (driveErr) {
        // Drive inaccessible (réseau, token, quota…) — on archive localement.
        // Le dépôt Drive sera relancé depuis l'accueil via « Finaliser sur Drive ».
        showToast({
          tone: 'warn',
          title: 'Drive inaccessible',
          body: 'Plongée archivée localement. Relancez le dépôt Drive depuis l\'accueil dès que possible.',
        });
        await saveOffline();
        return;
      }

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

      const archivePayload = {
        status:       'archived',
        closed_at:    new Date().toISOString(),
        site_nom:     answers.site_nom || answers.site || '',
        dp_nom:       answers.dp_nom || '',
        dp_qual:      answers.dp_qual || '',
        activite:     answers.activite || '',
        date_plongee: answers.date || '',
        answers,
        palanquees:   enrichedPals,
        drive_link:   ficheFile.webViewLink || '',
        render_state: { pressions, realises, heuresDebut, heuresFin, checked, comments },
      };
      if (diveId) {
        await api.dives.update(diveId, archivePayload);
      } else {
        await api.dives.create(archivePayload);
      }

      setDriveLinks({ fiche: ficheFile.webViewLink || '', checklist: clFile.webViewLink || '' });
      setStatus('done');
      if (onArchiveDone) onArchiveDone();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const doArchive = async () => {
    if (!window.isGisAvailable || !window.isGisAvailable()) {
      setError('Google Identity Services non disponible — recharger la page.');
      setStatus('error');
      return;
    }
    setStatus('requesting'); setError('');

    try {
      // window.getDriveToken gère le cache (réutilise un token valide sans GIS)
      // et le timeout (15 s par défaut, en cas de popup bloqué silencieusement).
      const token = await window.getDriveToken({ explicit: false, timeoutMs: 15000 });
      proceedWithToken(token);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  // Vérifie si la plongée est déjà archivée (visite depuis l'historique), puis
  // marque initialized=true pour débloquer le déclenchement de doArchive().
  // Ne lance PAS doArchive() directement : c'est l'effet [initialized, online]
  // ci-dessous qui s'en charge, après avoir reçu le résultat de init().
  useEffect(() => {
    async function init() {
      if (diveId) {
        try {
          const dive = await api.dives.get(diveId);
          if (dive?.status === 'archived') {
            setAlreadyArchived(true);
            if (dive.drive_link) setSavedDriveLink(dive.drive_link);
          }
        } catch {}
      }
      setInitialized(true);
    }
    init();
  }, []); // eslint-disable-line

  // Déclenchement de l'archivage : au montage (quand initialized passe à true)
  // et à chaque retour en ligne. La garde !initialized empêche tout déclenchement
  // avant que init() ait vérifié le statut de la plongée.
  useEffect(() => {
    if (!initialized) return;
    if (!alreadyArchived && online && (status === 'idle' || status === 'error')) {
      doArchive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, online]);

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

          {/* Avancement */}
          {STATUS_MSGS[status] && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                          background:'var(--bg-2)', borderRadius:8, fontSize:14, color:'var(--ink-2)' }}>
              <span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>↻</span>
              {STATUS_MSGS[status]}
            </div>
          )}

          {/* Erreur → réessayer Drive ou archiver localement */}
          {status === 'error' && (
            <>
              <Alert tone="warn">Erreur : {error}</Alert>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn primary" onClick={doArchive}>↑ Réessayer Drive</button>
                <button className="btn" onClick={saveOffline}>✓ Archiver sans Drive</button>
              </div>
            </>
          )}

          {/* Hors ligne → file d'attente */}
          {!online && status === 'idle' && (
            <div style={{
              display:'grid', gap:10, padding:'14px 16px',
              background:'rgba(224,120,86,0.08)', border:'1px solid rgba(224,120,86,0.35)',
              borderRadius:8, fontSize:14, color:'var(--ink-2)',
            }}>
              <div style={{ fontWeight:600, color:'var(--coral, #e07856)' }}>● Hors ligne</div>
              <div>
                Le dépôt Drive et la génération PDF nécessitent internet.
                Enregistrez en file d'attente — tout sera produit automatiquement à la reconnexion.
              </div>
              <div>
                <button className="btn primary" onClick={saveOffline}>✓ Enregistrer (Drive plus tard)</button>
              </div>
            </div>
          )}

          {/* Enregistrement local confirmé */}
          {status === 'queued' && (
            <div style={{
              display:'grid', gap:10, padding:'14px 16px',
              background:'rgba(45,134,83,0.06)', border:'1px solid rgba(45,134,83,0.3)',
              borderRadius:8, fontSize:14, color:'var(--ink-2)',
            }}>
              <div style={{ fontWeight:600, color:'var(--kelp, #2d8653)' }}>✓ Plongée enregistrée localement</div>
              <div>
                Fiche PDF et dépôt Drive produits dès la reconnexion.
                Retrouvez cette plongée dans l'Historique avec la mention <em>△ Drive en attente</em>.
              </div>
              <div><button className="btn primary" onClick={onStartNew}>↩ Nouvelle plongée</button></div>
            </div>
          )}

          {/* Archivage terminé — liens Drive uniquement, pas de boutons PDF redondants */}
          {status === 'done' && (
            <div style={{ display:'grid', gap:12 }}>
              <Alert tone="ok">
                Plongée archivée · 2 fichiers déposés dans <code>dp-fede</code>.
              </Alert>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {driveLinks.fiche     && (
                  <a href={driveLinks.fiche}     target="_blank" rel="noopener noreferrer" className="btn">
                    ↗ Fiche de sécurité
                  </a>
                )}
                {driveLinks.checklist && (
                  <a href={driveLinks.checklist} target="_blank" rel="noopener noreferrer" className="btn">
                    ↗ Check-list
                  </a>
                )}
              </div>
              <div><button className="btn primary" onClick={onStartNew}>↩ Nouvelle plongée</button></div>
            </div>
          )}

          {/* Plongée déjà archivée au chargement — lien Drive récupéré, pas de régénération */}
          {alreadyArchived && status === 'idle' && (
            <div style={{ display:'grid', gap:12 }}>
              <Alert tone="ok">Plongée déjà archivée.</Alert>
              {savedDriveLink
                ? (
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <a href={savedDriveLink} target="_blank" rel="noopener noreferrer" className="btn">
                      ↗ Ouvrir dans Google Drive
                    </a>
                  </div>
                )
                : <p style={{ margin:0, fontSize:13, color:'var(--ink-3)' }}>Lien Drive non disponible pour cette archive.</p>
              }
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
          divers={divers} user={user} pressions={pressions} realises={realises}
          heuresDebut={heuresDebut} heuresFin={heuresFin} />
      </div>
      <div style={{ position:'fixed', left:'-9999px', top:0, width:794, overflow:'visible', zIndex:-1, pointerEvents:'none' }}>
        <ChecklistStatique checklistRef={checklistRef} answers={answers}
          checked={checked || {}} comments={comments || {}} user={user} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// finalizePendingDrive — pour les plongées enregistrées hors ligne dont le
// PDF + Drive doivent être produits a posteriori. Appelé depuis ScreenHome
// (banner « Finaliser sur Drive ») ou ScreenArchives.
//
// archive : entrée offlineStore.archives (synced=true, drive_synced=false)
//   doit contenir : answers, palanquees, divers (enrichis), client_uuid,
//   server_id, et _render = { pressions, realises, heuresDebut, heuresFin,
//   checked, comments }
// divers  : annuaire courant (pour résoudre les noms si non enrichis)
// user    : utilisateur courant
//
// Rend les deux templates offscreen, appelle /api/pdf/fiche pour chacun,
// upload Drive, PATCH server. Une erreur propage (caller affiche).
// ---------------------------------------------------------------------------
async function finalizePendingDrive(archive, divers, user, onProgress) {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services indisponible — recharger la page.');
  }
  if (!archive.server_id) {
    throw new Error('Archive non encore synchronisée côté serveur — relancer plus tard.');
  }
  // Compatibilité : render_state (nouveau) ou _render (ancien nom)
  const r = archive.render_state || archive._render || {};
  const answers    = typeof archive.answers    === 'string' ? JSON.parse(archive.answers)    : (archive.answers    || {});
  const palanquees = typeof archive.palanquees === 'string' ? JSON.parse(archive.palanquees) : (archive.palanquees || []);

  // Rendu offscreen des deux templates dans un conteneur DOM temporaire.
  // On utilise ReactDOM.createRoot pour rendre, puis on lit outerHTML.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;pointer-events:none;z-index:-1';
  document.body.appendChild(host);

  const ficheEl     = document.createElement('div');
  const checklistEl = document.createElement('div');
  host.appendChild(ficheEl);
  host.appendChild(checklistEl);

  const root = ReactDOM.createRoot(host);
  await new Promise(resolve => {
    root.render(
      React.createElement(React.Fragment, null,
        React.createElement(FicheStatique, {
          ficheRef: { current: ficheEl },
          answers, palanquees, divers, user,
          pressions:    r.pressions    || {},
          realises:     r.realises     || {},
          heuresDebut:  r.heuresDebut  || {},
          heuresFin:    r.heuresFin    || {},
        }),
        React.createElement(ChecklistStatique, {
          checklistRef: { current: checklistEl },
          answers,
          checked:  r.checked  || {},
          comments: r.comments || {},
          user,
        }),
      )
    );
    // Laisse React le temps de mounter le DOM avant de lire outerHTML.
    setTimeout(resolve, 50);
  });

  try {
    const styles = Array.from(document.querySelectorAll('link[rel=stylesheet]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`).join('\n');
    const buildHtml = (title, el) => `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><title>${title}</title>${styles}
<style>body{background:white;padding:0;margin:0}.fiche{box-shadow:none;max-width:100%}.no-print,.fiche-actions{display:none!important}</style>
</head><body>${el.firstChild?.outerHTML || el.outerHTML}</body></html>`;

    const buildFilename = (kind) => {
      const dt   = answers.date || '';
      const date = dt.slice(0, 10);
      const time = dt.length >= 16 ? dt.slice(11, 16).replace(':', 'h') : '';
      const site = (archive.site_nom || 'site').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
      return `${date}${time ? '-' + time : ''}-${kind}-${site}.pdf`;
    };

    const csrf = (document.cookie.match(/(?:^|; )dp_csrf=([^;]+)/) || [])[1] || '';
    async function genPdf(kind, html, filename) {
      const res = await fetch('/api/pdf/fiche', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
        body: JSON.stringify({ html, filename }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PDF ${kind} HTTP ${res.status} : ${t.slice(0, 200)}`);
      }
      return await res.blob();
    }

    if (onProgress) onProgress('generating');
    const fichePdf     = await genPdf('fiche',
      buildHtml('Fiche de sécurité', ficheEl),     buildFilename('fiche-securite'));
    const checklistPdf = await genPdf('checklist',
      buildHtml('Check-list',         checklistEl), buildFilename('checklist'));

    if (onProgress) onProgress('requesting');
    // Délégué au helper centralisé : cache-first, timeout 15 s, scope drive.file.
    const token = await window.getDriveToken({ explicit: false, timeoutMs: 15000 });

    if (onProgress) onProgress('uploading');
    async function getFolder() {
      const q = encodeURIComponent("name='dp-fede' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const r1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r1.ok) {
        const d = await r1.json();
        if (d.files?.length) return d.files[0].id;
      }
      const r2 = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'dp-fede', mimeType: 'application/vnd.google-apps.folder' }),
      });
      const f = await r2.json();
      if (!f.id) throw new Error('Création dossier dp-fede impossible');
      return f.id;
    }
    async function up(blob, filename, folderId) {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' }));
      form.append('file', blob, filename);
      const r1 = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const d = await r1.json();
      if (!d.id) throw new Error('Upload Drive échoué : ' + JSON.stringify(d).slice(0, 200));
      return d;
    }
    const folderId  = await getFolder();
    const ficheFile = await up(fichePdf,     buildFilename('fiche-securite'), folderId);
    await up(checklistPdf, buildFilename('checklist'), folderId);

    if (onProgress) onProgress('saving');
    await window.api.dives.markDriveDone(archive.client_uuid, ficheFile.webViewLink || '');
    return ficheFile.webViewLink || '';
  } finally {
    root.unmount();
    host.remove();
  }
}

Object.assign(window, {
  ScreenArchive, FicheStatique, ChecklistStatique,
  finalizePendingDrive,
});
