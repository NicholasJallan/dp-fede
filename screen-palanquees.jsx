// DP Assistant — Plongeurs & Palanquées (v3 — règles FFESSM / CdS complètes)

const PAL_COLORS = {
  exploration: 'pal-explo',
  guidee:      'pal-guidee',
  formation:   'pal-form',
  bapteme:     'pal-bapteme',
};

const MELANGES_LIST = ['Air','Nx ≤ 40%','Nx > 40%','Tx'];

// ── AptitudeSelect ────────────────────────────────────────────────────────
function AptitudeSelect({ diver, value, isExploration, onChange }) {
  const available = window.getDiverAptitudes(diver, isExploration);
  if (available.length === 0) return <span className="muted">—</span>;
  if (available.length === 1 && !value) {
    setTimeout(() => onChange(available[0]), 0);
  }
  return (
    <select className="role-sel" value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— aptitude —</option>
      {available.map(a => <option key={a} value={a}>{a}</option>)}
    </select>
  );
}

// ── Helpers — niveau effectif & limites profondeur ────────────────────────
// PE valeur numérique (20, 40, 60) ou null
function peLevel(apt) {
  const m = /^PE(\d+)$/.exec(apt || '');
  return m ? parseInt(m[1], 10) : null;
}
function paLevel(apt) {
  const m = /^PA(\d+)$/.exec(apt || '');
  return m ? parseInt(m[1], 10) : null;
}

// ── Validation complète d'une palanquée ───────────────────────────────────
// Règles compilées depuis MFT FFESSM + Code du Sport (Art. A322-72→97).
function validatePal(pal, diversById, answers) {
  const issues = [];
  const membres = pal.membres
    .map(m => ({ ...m, diver: m._bapteme ? m : diversById[m.diverId] }))
    .filter(m => m.diver || m._bapteme);

  // ─── Règle universelle : taille ─────────────────────────────────────
  if (membres.length === 0) {
    issues.push({ tone:'warn', text:'Palanquée vide.' });
    return issues;
  }
  if (membres.length === 1) {
    issues.push({ tone:'err', text:'Palanquée de 1 personne interdite (toujours par binôme minimum).' });
  }
  if (membres.length > 6) {
    issues.push({ tone:'err', text:'Max 6 personnes par palanquée.' });
  }

  const apts    = membres.map(m => m.aptitude || '');
  const milieu  = window.getMilieuType(answers.milieu);
  const profMax = pal.profMax || 0;

  // ─── Aptitudes manquantes ────────────────────────────────────────────
  const sans = membres.filter(m => !m.aptitude);
  if (sans.length > 0) {
    issues.push({ tone:'warn', text:`${sans.length} membre(s) sans aptitude.` });
  }

  // ─── Catégorisation ──────────────────────────────────────────────────
  const gpMembers   = membres.filter(m => m.aptitude === 'GP');
  const ensMembers  = membres.filter(m => ['E1','E2','E3','E4'].includes(m.aptitude));
  const peMembers   = membres.filter(m => peLevel(m.aptitude) !== null);
  const paMembers   = membres.filter(m => paLevel(m.aptitude) !== null);
  const baptMembers = membres.filter(m => m.aptitude === 'Baptême');

  // ─── Profondeur max par aptitude ─────────────────────────────────────
  membres.forEach(m => {
    if (!m.aptitude) return;
    const limit = window.aptitudeMaxDepth(m.aptitude);
    if (profMax > limit) {
      issues.push({ tone:'err',
        text:`${m.aptitude} de ${m._bapteme ? m.prenom : (m.diver && diverFullName(m.diver))} limité à ${limit}m (palanquée à ${profMax}m).` });
    }
  });

  // ─── Règles GP (guide de palanquée) ──────────────────────────────────
  if (gpMembers.length > 0) {
    // Tous les non-GP doivent être PE20/PE40 (jamais PE60, jamais PA, jamais Enseignant)
    const otherApts = apts.filter(a => a !== 'GP');
    const invalid = otherApts.filter(a => {
      const pe = peLevel(a);
      return pe === null || pe > 40;
    });
    if (invalid.length > 0) {
      issues.push({ tone:'err',
        text:'GP : seuls PE20/PE40 sont autorisés pour les encadrés. Pas de PE60, pas de PA, pas d\'enseignant.' });
    }
    // Pas de panachage PE20/PE40
    const peLevels = [...new Set(peMembers.map(m => peLevel(m.aptitude)))];
    if (peLevels.length > 1) {
      issues.push({ tone:'err', text:'GP : tous les encadrés doivent avoir la même prérogative (PE20 ou PE40, pas un mélange).' });
    }
    // Profondeur max selon PE le plus élevé
    const maxPE = Math.max(...peMembers.map(m => peLevel(m.aptitude) || 0), 0);
    if (maxPE && profMax > maxPE) {
      issues.push({ tone:'err', text:`GP avec PE${maxPE} : profondeur max ${maxPE}m.` });
    }
    // 6e personne = serre-file (doit être GP, ou E3/E4)
    if (membres.length === 6) {
      const lastApt = membres[membres.length - 1].aptitude;
      if (!['GP','E3','E4'].includes(lastApt)) {
        issues.push({ tone:'err', text:'Serre-file (6e) doit être GP, E3 ou E4.' });
      }
      if (gpMembers.length + ensMembers.filter(m => ['E3','E4'].includes(m.aptitude)).length < 2) {
        issues.push({ tone:'err', text:'Palanquée à 6 : 2 encadrants minimum (GP + serre-file).' });
      }
    }
    // Pas plus de 4 encadrés par GP
    if (peMembers.length > 4) {
      issues.push({ tone:'err', text:`GP : max 4 encadrés (${peMembers.length} actuellement).` });
    }
  }

  // ─── Règles encadrants E1/E2/E3/E4 (formation) ───────────────────────
  if (ensMembers.length > 0) {
    if (ensMembers.length > 1) {
      // Plusieurs encadrants = formation d'encadrants — tolérée si tous E3 ou E4
      const nonE3E4 = ensMembers.filter(m => !['E3','E4'].includes(m.aptitude));
      if (nonE3E4.length > 0 && peMembers.length === 0) {
        // c'est ok si formation de moniteurs
      }
    }

    // Pas de PA dans une palanquée formation
    if (paMembers.length > 0) {
      issues.push({ tone:'err', text:'Palanquée formation : aptitudes PA non autorisées (utiliser PE).' });
    }

    // Pas de panachage de prérogatives PE
    const peLevels = [...new Set(peMembers.map(m => peLevel(m.aptitude)))];
    if (peLevels.length > 1) {
      issues.push({ tone:'err', text:'Formation : pas de panachage PE20/PE40/PE60 dans une même palanquée.' });
    }

    // E1 : baptême uniquement, piscine ≤ 6m
    if (apts.includes('E1')) {
      if (milieu !== 'piscine') issues.push({ tone:'err', text:'E1 : formation/baptême uniquement en piscine.' });
      if (profMax > 6)          issues.push({ tone:'err', text:'E1 : profondeur max 6 m.' });
      if (baptMembers.length > 2) issues.push({ tone:'err', text:'E1 : max 2 baptisés à la fois.' });
    }

    // E2 : piscine/fosse ≤ 20m
    if (apts.includes('E2')) {
      if (!['fosse','piscine'].includes(milieu)) issues.push({ tone:'err', text:'E2 : enseignement limité piscine ou fosse.' });
      if (profMax > 20) issues.push({ tone:'err', text:'E2 : profondeur max 20 m.' });
    }

    // E3 : tous environnements, formation max 40m
    if (apts.includes('E3') && !apts.some(a => a === 'E4')) {
      if (profMax > 40) issues.push({ tone:'err', text:'E3 (formation) : profondeur max 40 m. Pour PE60, un E4 est requis.' });
      if (apts.includes('PE60')) issues.push({ tone:'err', text:'E3 : ne peut pas encadrer un PE60. Seul un E4 le peut.' });
    }

    // E4 : tous environnements, formation max 60m
    if (apts.includes('E4')) {
      if (profMax > 60) issues.push({ tone:'err', text:'E4 (formation) : profondeur max 60 m (sauf PTH).' });
    }
  }

  // ─── Règles PA — autonomes ────────────────────────────────────────────
  if (paMembers.length > 0 && gpMembers.length === 0 && ensMembers.length === 0) {
    // Palanquée 100 % autonome
    if (paMembers.length > 3) {
      issues.push({ tone:'err', text:`Palanquée PA : max 3 plongeurs autonomes (${paMembers.length} actuellement).` });
    }
    // Pas de panachage PA12/PA20/PA40
    const paLevels = [...new Set(paMembers.map(m => paLevel(m.aptitude)))];
    if (paLevels.length > 1) {
      issues.push({ tone:'err', text:'Palanquée PA : pas de panachage des prérogatives PA12/PA20/PA40.' });
    }
    // Si baptême au sein → erreur
    if (baptMembers.length > 0) {
      issues.push({ tone:'err', text:'Baptême : un encadrant E1→E4 est obligatoire.' });
    }
  }

  // ─── Règles Baptême ──────────────────────────────────────────────────
  if (baptMembers.length > 0) {
    const enc = membres.filter(m => ['E1','E2','E3','E4'].includes(m.aptitude));
    if (enc.length === 0) {
      issues.push({ tone:'err', text:'Baptême : un encadrant E1→E4 est obligatoire.' });
    } else {
      // E1/E2 ne peuvent faire un baptême qu'en piscine
      const hasE1E2 = enc.some(m => ['E1','E2'].includes(m.aptitude));
      const hasE3E4 = enc.some(m => ['E3','E4'].includes(m.aptitude));
      if (hasE1E2 && !hasE3E4 && ['mer','lac'].includes(milieu)) {
        issues.push({ tone:'err', text:'Baptême en milieu naturel (mer/lac) : encadrant E3 ou E4 requis.' });
      }
    }
    if (profMax > 6) issues.push({ tone:'err', text:'Baptême : profondeur max 6 m.' });
  }

  // ─── Certificats médicaux ────────────────────────────────────────────
  const eventDate = answers.date ? new Date(answers.date) : new Date();
  membres.forEach(m => {
    if (m._bapteme) return;
    if (m.diver?.medical && new Date(m.diver.medical) < eventDate) {
      issues.push({ tone:'err',
        text:`Certificat médical de ${diverFullName(m.diver)} expiré (${m.diver.medical}).` });
    }
  });

  // ─── Mélanges respiratoires ──────────────────────────────────────────
  const mlx = pal.melanges || [];
  if (mlx.length === 0) {
    issues.push({ tone:'warn', text:'Aucun mélange respiratoire sélectionné pour cette palanquée.' });
  }

  if (issues.filter(i => i.tone === 'err').length === 0) {
    const t = window.getPalType(pal.membres);
    issues.push({ tone:'ok', text:`Composition conforme — type : ${t}.` });
  }
  return issues;
}

// ── ScreenPalanquees ──────────────────────────────────────────────────────
function ScreenPalanquees({ divers, setDivers, palanquees, setPalanquees, answers, setAnswer }) {
  const [filter, setFilter] = useState('');
  const [showQuickDiver, setShowQuickDiver] = useState(false);

  // N5 → exploration uniquement
  const isExploration = answers.dp_qual === 'N5';
  const dpQual = answers.dp_qual || '';

  // Dériver activité depuis les aptitudes utilisées
  useEffect(() => {
    if (!palanquees.length) { setAnswer('activite', 'Exploration'); return; }
    const hasEns = palanquees.some(p => p.membres.some(m => ['E1','E2','E3','E4'].includes(m.aptitude)));
    const hasExp = palanquees.some(p => p.membres.some(m => !['E1','E2','E3','E4'].includes(m.aptitude)));
    setAnswer('activite', (hasEns && hasExp) ? 'Mixte' : hasEns ? 'Enseignement' : 'Exploration');
  }, [palanquees]);

  // Ranger plongeurs assignés
  const diversById = useMemo(() => {
    const m = {}; divers.forEach(d => m[d.id] = d); return m;
  }, [divers]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    palanquees.forEach(p => p.membres.forEach(m => { if (!m._bapteme) s.add(m.diverId); }));
    return s;
  }, [palanquees]);

  const filteredPool = useMemo(() => {
    const f = filter.toLowerCase();
    return divers.filter(d =>
      !f || d.nom.toLowerCase().includes(f) || (d.prenom||'').toLowerCase().includes(f) ||
      (d.niveau_encadrant||d.niveau_plongeur||'').toLowerCase().includes(f)
    );
  }, [divers, filter]);

  // ── CRUD palanquées ─────────────────────────────────────────────────
  const addToPal = (palId, diverId) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId || p.membres.find(m => m.diverId === diverId)) return p;
      const d = diversById[diverId];
      const apts = d ? window.getDiverAptitudes(d, isExploration) : [];
      const aptitude = apts.length === 1 ? apts[0] : '';
      return { ...p, membres: [...p.membres, { diverId, aptitude }] };
    }));
  };

  const addBaptemeToPal = (palId, bapteme) => {
    setPalanquees(prev => prev.map(p =>
      p.id === palId
        ? { ...p, membres: [...p.membres, { ...bapteme, aptitude: 'Baptême', _bapteme: true }] }
        : p));
  };

  const removeFromPal = (palId, idOrIdx) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      return {
        ...p,
        membres: p.membres.filter((m, i) =>
          m._bapteme ? m.id !== idOrIdx : m.diverId !== idOrIdx),
      };
    }));
  };

  const setAptitude = (palId, key, aptitude, isBapt = false) => {
    setPalanquees(prev => prev.map(p =>
      p.id === palId
        ? { ...p, membres: p.membres.map(m => {
            if (isBapt && m._bapteme && m.id === key) return { ...m, aptitude };
            if (!isBapt && !m._bapteme && m.diverId === key) return { ...m, aptitude };
            return m;
          }) }
        : p));
  };

  const setPalField = (palId, field, value) =>
    setPalanquees(prev => prev.map(p => p.id === palId ? { ...p, [field]: value } : p));

  const toggleMelange = (palId, m) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      const cur = p.melanges || [];
      const next = cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m];
      return { ...p, melanges: next };
    }));
  };

  // DTR auto si "no déco"
  const updateProfMax = (palId, profMax) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      const dtr = p.no_deco ? window.calcDTR(profMax) : p.dtr;
      return { ...p, profMax, dtr };
    }));
  };
  const toggleNoDeco = (palId) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      const next = !p.no_deco;
      return { ...p, no_deco: next, dtr: next ? window.calcDTR(p.profMax) : p.dtr };
    }));
  };

  const addPal = () => {
    const id = 'p' + (Math.max(0, ...palanquees.map(p => parseInt(p.id.slice(1)) || 0)) + 1);
    setPalanquees(prev => [...prev, {
      id, nom: `Palanquée ${prev.length + 1}`,
      membres: [], profMax: 20, duree: 35, dtr: 2,
      melanges: ['Air'],
      no_deco: !answers.paliers,
      shot_line: !!answers.shot_line,
    }]);
  };

  const removePal = (palId) =>
    setPalanquees(prev => prev.filter(p => p.id !== palId));

  // ── DP validation ───────────────────────────────────────────────────
  const dpQualOK = useMemo(() => {
    if (!dpQual) return { tone:'warn', text:'Aucun Directeur de Plongée sélectionné (section A).' };
    const lvl = window.LEVELS[dpQual];
    if (!lvl?.canBeDP) return { tone:'err', text:`${dpQual} ne peut pas être DP — minimum E3 ou N5 requis.` };
    return { tone:'ok', text:`DP ${dpQual} valide pour ce contexte.` };
  }, [dpQual]);

  const siteShotLine = answers.shot_line;

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 2 / 5 · Plongeurs & palanquées</div>
        <h1>Constituer les palanquées</h1>
        <p>Ajoutez les plongeurs depuis l'annuaire, ou créez-en à la volée. Les règles FFESSM / Code du Sport sont vérifiées en temps réel.</p>
      </div>

      <Alert tone={dpQualOK.tone}>{dpQualOK.text}</Alert>
      {isExploration && <Alert tone="info">DP N5 — exploration uniquement, pas d'enseignement.</Alert>}

      <div className="divers-grid">
        {/* Annuaire */}
        <div className="diver-pool">
          <h4>Annuaire — {divers.length} plongeurs</h4>
          <input className="input small" type="text" placeholder="Rechercher…"
            value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom:10 }} />
          {filteredPool.map(d => {
            const assigned = assignedIds.has(d.id);
            const ne = d.niveau_encadrant, np = d.niveau_plongeur;
            return (
              <div className={`diver-card ${assigned ? 'assigned' : ''}`} key={d.id}>
                <div className="info">
                  <b>{diverFullName(d)}</b>
                  <small>
                    {ne ? <span className="pill ink" style={{ fontSize:11, padding:'1px 6px', borderRadius:3, marginRight:4 }}>{ne}</span> : null}
                    {np && !ne ? <span style={{ marginRight:4 }}>{np}</span> : null}
                    {!ne && !np ? <span className="muted">Sans niveau</span> : null}
                    {(d.nitrox||[]).includes('PN-C') && <span className="muted"> · PN-C</span>}
                    {(d.trimix||[]).includes('PTH-120') && <span className="muted"> · PTH-120</span>}
                    {(d.recycleurs||[]).length > 0 && <span className="muted"> · CCR</span>}
                  </small>
                </div>
                {!assigned && palanquees.length > 0 && (
                  <select className="role-sel"
                    onChange={e => { if (e.target.value) addToPal(e.target.value, d.id); e.target.value = ''; }}
                    value="">
                    <option value="">+ Ajouter à…</option>
                    {palanquees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          <button className="btn ghost" style={{ marginTop:8, width:'100%' }}
            onClick={() => setShowQuickDiver(true)}>
            + Nouveau plongeur / baptême
          </button>
        </div>

        {/* Palanquées */}
        <div className="pal-list">
          {palanquees.map((p, idx) => {
            const issues  = validatePal(p, diversById, answers);
            const palType = window.getPalType(p.membres);
            const colorClass = PAL_COLORS[palType] || '';
            const melanges = p.melanges || [];
            return (
              <div className={`pal ${colorClass}`} key={p.id}>
                <div className="pal-head">
                  <span className="num">{idx + 1}</span>
                  <input className="input small" style={{ flex:1, fontWeight:600 }}
                    value={p.nom} onChange={e => setPalField(p.id, 'nom', e.target.value)} />
                  <span className={`pal-type-badge ${colorClass}`}>{palType}</span>
                  <button className="btn ghost" onClick={() => removePal(p.id)}>×</button>
                </div>

                <div className="pal-params">
                  <div className="p">
                    <span>Prof. max</span>
                    <b><input className="input small num" type="number" value={p.profMax}
                      onChange={e => updateProfMax(p.id, parseFloat(e.target.value)||0)} /> m</b>
                  </div>
                  <div className="p">
                    <span>Durée prévue</span>
                    <b><input className="input small num" type="number" value={p.duree}
                      onChange={e => setPalField(p.id, 'duree', parseFloat(e.target.value)||0)} /> min</b>
                  </div>
                  <div className="p">
                    <span>DTR</span>
                    <b><input className="input small num" type="number" value={p.dtr}
                      onChange={e => setPalField(p.id, 'dtr', parseFloat(e.target.value)||0)}
                      disabled={!!p.no_deco} /> min</b>
                  </div>
                </div>

                <div className="pal-options">
                  <div className="qualif-row" style={{ gap: 8 }}>
                    {MELANGES_LIST.map(m => (
                      <label key={m} className={`qualif-toggle ${melanges.includes(m) ? 'on' : ''}`}>
                        <input type="checkbox" checked={melanges.includes(m)}
                          onChange={() => toggleMelange(p.id, m)} />
                        {m}
                      </label>
                    ))}
                  </div>
                  <div className="qualif-row" style={{ gap: 8, marginTop: 6 }}>
                    <label className={`qualif-toggle ${p.no_deco ? 'on' : ''}`}>
                      <input type="checkbox" checked={!!p.no_deco}
                        onChange={() => toggleNoDeco(p.id)} />
                      No déco (DTR auto = ⌈prof/10⌉)
                    </label>
                    {siteShotLine && (
                      <label className={`qualif-toggle ${p.shot_line ? 'on' : ''}`}>
                        <input type="checkbox" checked={!!p.shot_line}
                          onChange={() => setPalField(p.id, 'shot_line', !p.shot_line)} />
                        Shot-line
                      </label>
                    )}
                  </div>
                </div>

                {p.membres.length === 0 && (
                  <div className="empty" style={{ padding:18, fontSize:13 }}>Aucun plongeur.</div>
                )}

                {p.membres.map((m) => {
                  if (m._bapteme) {
                    return (
                      <div className="diver-row" key={'b' + m.id}>
                        <Pill tone="coral">Baptême</Pill>
                        <div className="name">
                          <b>{(m.prenom || '') + ' ' + (m.nom || '').toUpperCase()}</b>
                          <small>Non enregistré dans l'annuaire</small>
                        </div>
                        <Pill>Baptême</Pill>
                        <button className="x" onClick={() => removeFromPal(p.id, m.id)}>×</button>
                      </div>
                    );
                  }
                  const d = diversById[m.diverId];
                  if (!d) return null;
                  const ne = d.niveau_encadrant, np = d.niveau_plongeur;
                  return (
                    <div className="diver-row" key={m.diverId}>
                      <Pill tone="ink">{ne || np || '?'}</Pill>
                      <div className="name">
                        <b>{diverFullName(d)}</b>
                        <small>{(d.nitrox||[]).join(' ')} {(d.trimix||[]).join(' ')}</small>
                      </div>
                      <AptitudeSelect diver={d} value={m.aptitude} isExploration={isExploration}
                        onChange={apt => setAptitude(p.id, m.diverId, apt)} />
                      <button className="x" onClick={() => removeFromPal(p.id, m.diverId)}>×</button>
                    </div>
                  );
                })}

                <div className="val-list" style={{ marginTop:10 }}>
                  {issues.map((v, i) => (
                    <div className={`v ${v.tone}`} key={i}>
                      <span className="tag">
                        {v.tone === 'err' ? 'BLOQUANT' : v.tone === 'warn' ? 'ALERTE' : 'OK'}
                      </span>
                      <span>{v.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <button className="pal-add" onClick={addPal}>+ Ajouter une palanquée</button>
        </div>
      </div>

      {showQuickDiver && (
        <DiverQuickAdd
          allowBapteme={true}
          onClose={() => setShowQuickDiver(false)}
          onCreated={d => {
            setDivers(prev => [...prev, d].sort((a,b) => a.nom.localeCompare(b.nom)));
            setShowQuickDiver(false);
          }}
          baptemeOnSave={bap => {
            // Ajout atomique du baptême dans la dernière palanquée (création si vide)
            setPalanquees(prev => {
              if (prev.length === 0) {
                const id = 'p1';
                return [{
                  id, nom: 'Palanquée 1',
                  membres: [{ ...bap, aptitude: 'Baptême', _bapteme: true }],
                  profMax: 6, duree: 20, dtr: 1,
                  melanges: ['Air'],
                  no_deco: true,
                  shot_line: false,
                }];
              }
              const lastIdx = prev.length - 1;
              return prev.map((p, i) =>
                i === lastIdx
                  ? { ...p, membres: [...p.membres, { ...bap, aptitude:'Baptême', _bapteme:true }] }
                  : p);
            });
          }}
        />
      )}
    </div>
  );
}

Object.assign(window, { ScreenPalanquees });
