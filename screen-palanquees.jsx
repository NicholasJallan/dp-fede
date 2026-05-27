// DP Assistant — Plongeurs & Palanquées (v2 — aptitudes)

const PAL_COLORS = {
  exploration: 'pal-explo',
  guidee:      'pal-guidee',
  formation:   'pal-form',
  bapteme:     'pal-bapteme',
};

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

function validatePal(pal, diversById, answers) {
  const issues = [];
  const membres = pal.membres
    .map(m => ({ ...m, diver: diversById[m.diverId] }))
    .filter(m => m.diver);

  if (membres.length === 0) {
    issues.push({ tone:'warn', text:'Palanquée vide.' });
    return issues;
  }

  const isExplo = !answers.activite || answers.activite === 'Exploration';
  const milieu  = window.getMilieuType(answers.milieu);
  const apts    = membres.map(m => m.aptitude || '');
  const type    = window.getPalType(pal.membres);

  // Vérifier que tous les membres ont une aptitude
  const sans = membres.filter(m => !m.aptitude);
  if (sans.length > 0) {
    issues.push({ tone:'warn', text:`${sans.length} plongeur(s) sans aptitude sélectionnée.` });
  }

  // Aptitudes E1-E4 en exploration interdites
  if (isExplo && apts.some(a => ['E1','E2','E3','E4'].includes(a))) {
    issues.push({ tone:'err', text:'Aptitudes E1-E4 non autorisées en Exploration.' });
  }

  // Règles N4
  const n4Members = membres.filter(m => m.aptitude === 'N4');
  const peMembers = membres.filter(m => m.aptitude && m.aptitude.startsWith('PE'));
  if (n4Members.length > 0) {
    const peApts = [...new Set(peMembers.map(m => m.aptitude))];
    if (peApts.length > 1) issues.push({ tone:'err', text:'Palanquée N4 : PE20 et PE40 ne peuvent pas être mixés.' });
    if (peMembers.length > 4) issues.push({ tone:'err', text:`N4 : max 4 encadrés (${peMembers.length} actuellement).` });
    if (n4Members.length > 1 && membres.length > 5)
      issues.push({ tone:'warn', text:'Serre-file N4 comptabilisé — max 6 personnes en tout.' });
    if (membres.length > 6) issues.push({ tone:'err', text:'Max 6 personnes pour une palanquée N4.' });
  }

  // Règles E1 — baptême piscine ≤ 6m
  if (apts.includes('E1')) {
    if (milieu !== 'piscine') issues.push({ tone:'err', text:'E1 : baptême uniquement en piscine ≤ 6 m.' });
    if (pal.profMax > 6) issues.push({ tone:'err', text:'E1 : profondeur limitée à 6 m.' });
    if (membres.filter(m => m.aptitude === 'Baptême').length > 2) issues.push({ tone:'err', text:'E1 : max 2 baptisés par encadrant.' });
  }

  // Règles E2 — fosse ≤ 20m
  if (apts.includes('E2')) {
    if (!['fosse','piscine'].includes(milieu)) issues.push({ tone:'err', text:'E2 : formation limitée à la fosse ou piscine.' });
    if (pal.profMax > 20) issues.push({ tone:'err', text:'E2 : profondeur limitée à 20 m.' });
  }

  // Règles E3
  if (apts.includes('E3')) {
    if (pal.profMax > 40) issues.push({ tone:'err', text:'E3 : profondeur max enseignement 40 m.' });
    if (apts.includes('PE60')) issues.push({ tone:'err', text:'E3 : PE60 non autorisé en formation.' });
    if (apts.some(a => a.startsWith('PA'))) issues.push({ tone:'err', text:'E3 : aptitudes PAxx non autorisées dans une palanquée encadrée E3.' });
  }

  // Règles E4
  if (apts.includes('E4')) {
    if (apts.some(a => a.startsWith('PA'))) issues.push({ tone:'err', text:'E4 : aptitudes PAxx non autorisées dans une palanquée encadrée E4.' });
    if (pal.profMax > 60) issues.push({ tone:'err', text:'E4 : profondeur max 60 m en formation.' });
  }

  // Règles PAxx — autonomes
  const paOnly = apts.filter(a => a.startsWith('PA') || a.startsWith('PTH'));
  if (paOnly.length > 0 && !apts.some(a => ['N4','E1','E2','E3','E4'].includes(a))) {
    if (membres.length > 3) issues.push({ tone:'err', text:`Palanquée PA : max 3 plongeurs (${membres.length} actuellement).` });
    const paTypes = [...new Set(paOnly)];
    if (paTypes.length > 1) {
      const mixedPA = paTypes.filter(a => a.startsWith('PA'));
      if (mixedPA.length > 1) issues.push({ tone:'err', text:'Palanquée PA : toutes les aptitudes PA doivent être identiques.' });
    }
  }

  // Baptême sans niveau → encadrant obligatoire E3/E4 en milieu naturel
  if (apts.includes('Baptême')) {
    const enc = apts.filter(a => ['E1','E2','E3','E4'].includes(a));
    if (enc.length === 0) issues.push({ tone:'err', text:'Baptême : un encadrant E1→E4 est obligatoire.' });
    if (['mer','lac'].includes(milieu) && !enc.some(a => ['E3','E4'].includes(a))) {
      issues.push({ tone:'err', text:'Baptême en milieu naturel : encadrant E3 ou E4 obligatoire.' });
    }
  }

  // Certificats médicaux
  const eventDate = new Date(answers.date || Date.now());
  membres.forEach(m => {
    if (m.diver.medical && new Date(m.diver.medical) < eventDate) {
      issues.push({ tone:'err', text:`Certificat médical de ${diverFullName(m.diver)} expiré (${m.diver.medical}).` });
    }
  });

  if (issues.filter(i => i.tone === 'err').length === 0) {
    issues.push({ tone:'ok', text:`Composition conforme — type : ${type}.` });
  }
  return issues;
}

function ScreenPalanquees({ divers, setDivers, palanquees, setPalanquees, answers }) {
  const [filter, setFilter] = useState('');
  const [showQuickDiver, setShowQuickDiver] = useState(false);

  const isExploration = !answers.activite || answers.activite === 'Exploration';
  const dpQual = answers.dp_qual || '';

  const diversById = useMemo(() => {
    const m = {}; divers.forEach(d => m[d.id] = d); return m;
  }, [divers]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    palanquees.forEach(p => p.membres.forEach(m => s.add(m.diverId)));
    return s;
  }, [palanquees]);

  const filteredPool = useMemo(() => {
    const f = filter.toLowerCase();
    return divers.filter(d =>
      !f || d.nom.toLowerCase().includes(f) || (d.prenom||'').toLowerCase().includes(f) ||
      (d.niveau_encadrant||d.niveau_plongeur||'').toLowerCase().includes(f)
    );
  }, [divers, filter]);

  const addToPal = (palId, diverId) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId || p.membres.find(m => m.diverId === diverId)) return p;
      const d = diversById[diverId];
      const apts = d ? window.getDiverAptitudes(d, isExploration) : [];
      const aptitude = apts.length === 1 ? apts[0] : '';
      return { ...p, membres: [...p.membres, { diverId, aptitude }] };
    }));
  };

  const removeFromPal = (palId, diverId) =>
    setPalanquees(prev => prev.map(p =>
      p.id === palId ? { ...p, membres: p.membres.filter(m => m.diverId !== diverId) } : p));

  const setAptitude = (palId, diverId, aptitude) =>
    setPalanquees(prev => prev.map(p =>
      p.id === palId
        ? { ...p, membres: p.membres.map(m => m.diverId === diverId ? { ...m, aptitude } : m) }
        : p));

  const setPalField = (palId, field, value) =>
    setPalanquees(prev => prev.map(p => p.id === palId ? { ...p, [field]: value } : p));

  // DTR auto-calc sans déco
  const autoUpdateDTR = (palId, profMax) => {
    if (!answers.paliers) { // paliers non autorisés → sans déco → DTR auto
      setPalanquees(prev => prev.map(p =>
        p.id === palId ? { ...p, profMax, dtr: window.calcDTR(profMax) } : p));
    } else {
      setPalanquees(prev => prev.map(p => p.id === palId ? { ...p, profMax } : p));
    }
  };

  const addPal = () => {
    const id = 'p' + (Math.max(0, ...palanquees.map(p => parseInt(p.id.slice(1)) || 0)) + 1);
    setPalanquees(prev => [...prev, {
      id, nom: `Palanquée ${prev.length + 1}`,
      membres: [], profMax: 20, duree: 35, dtr: 2, melange: 'Air'
    }]);
  };

  const removePal = (palId) =>
    setPalanquees(prev => prev.filter(p => p.id !== palId));

  // Validation globale DP
  const dpQualOK = useMemo(() => {
    if (!dpQual) return { tone:'warn', text:'Aucun Directeur de Plongée sélectionné (section A).' };
    const lvl = window.LEVELS[dpQual];
    if (!lvl?.canBeDP) return { tone:'err', text:`${dpQual} ne peut pas être DP — minimum E3 requis (Art. A322-72).` };
    return { tone:'ok', text:`DP ${dpQual} valide pour ce contexte.` };
  }, [dpQual]);

  const diverLabel = (d) => {
    const ne = d.niveau_encadrant, np = d.niveau_plongeur;
    return ne ? ne : (np || '?');
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 2 / 5 · Plongeurs & palanquées</div>
        <h1>Constituer les palanquées</h1>
        <p>Ajoutez les plongeurs depuis l'annuaire. Sélectionnez l'aptitude de chaque plongeur pour cette plongée. Les règles du Code du Sport sont vérifiées en temps réel.</p>
      </div>

      <Alert tone={dpQualOK.tone}>{dpQualOK.text}</Alert>
      {isExploration && <Alert tone="info">Mode Exploration — aptitudes E1→E4 indisponibles.</Alert>}

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
                    {!ne && !np ? <span className="muted">Baptême</span> : null}
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
            + Nouveau plongeur
          </button>
        </div>

        {/* Palanquées */}
        <div className="pal-list">
          {palanquees.map((p, idx) => {
            const issues  = validatePal(p, diversById, answers);
            const palType = window.getPalType(p.membres);
            const colorClass = PAL_COLORS[palType] || '';
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
                      onChange={e => autoUpdateDTR(p.id, parseFloat(e.target.value)||0)} /> m</b>
                  </div>
                  <div className="p">
                    <span>Durée prévue</span>
                    <b><input className="input small num" type="number" value={p.duree}
                      onChange={e => setPalField(p.id, 'duree', parseFloat(e.target.value)||0)} /> min</b>
                  </div>
                  <div className="p">
                    <span>DTR</span>
                    <b><input className="input small num" type="number" value={p.dtr}
                      onChange={e => setPalField(p.id, 'dtr', parseFloat(e.target.value)||0)} /> min</b>
                  </div>
                  <div className="p">
                    <span>Mélange</span>
                    <b><select className="input small tight" value={p.melange}
                      onChange={e => setPalField(p.id, 'melange', e.target.value)}>
                      <option>Air</option>
                      <option>EAN32</option>
                      <option>EAN36</option>
                      <option>Trimix</option>
                      <option>Héliox</option>
                    </select></b>
                  </div>
                </div>

                {p.membres.length === 0 && (
                  <div className="empty" style={{ padding:18, fontSize:13 }}>Aucun plongeur.</div>
                )}

                {p.membres.map((m, mi) => {
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
        <QuickDiverModal
          onClose={() => setShowQuickDiver(false)}
          onCreated={d => { setDivers(prev => [...prev, d].sort((a,b) => a.nom.localeCompare(b.nom))); setShowQuickDiver(false); }}
        />
      )}
    </div>
  );
}

function QuickDiverModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ nom:'', prenom:'', niveau_plongeur:'', niveau_encadrant:'', medical:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.nom.trim()) { setErr('Nom requis'); return; }
    if (!form.medical)    { setErr('Date du certificat médical obligatoire'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nitrox:[], trimix:[], recycleurs:[], rifap:false, tiv:false,
        aptitudes_sup:[], diplome_pro:null, notes:'',
        niveau_encadrant: form.niveau_encadrant || null,
        niveau_plongeur: form.niveau_encadrant ? 'N3' : (form.niveau_plongeur || null),
      };
      const d = await api.divers.create(payload);
      onCreated(d);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:400 }}>
        <div className="modal-head">
          <h3>Nouveau plongeur (rapide)</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <Alert tone="warn" style={{ marginBottom:8 }}>{err}</Alert>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="field"><label>Nom *</label>
              <input className="input" value={form.nom} onChange={e => sf('nom', e.target.value)} /></div>
            <div className="field"><label>Prénom</label>
              <input className="input" value={form.prenom} onChange={e => sf('prenom', e.target.value)} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
            <div className="field"><label>Niveau plongeur</label>
              <select className="input" value={form.niveau_plongeur} onChange={e => sf('niveau_plongeur', e.target.value)} disabled={!!form.niveau_encadrant}>
                <option value="">Baptême</option>
                {NIVEAUX_PLONGEUR.map(n => <option key={n} value={n}>{n}</option>)}
              </select></div>
            <div className="field"><label>Niveau encadrant</label>
              <select className="input" value={form.niveau_encadrant} onChange={e => sf('niveau_encadrant', e.target.value)}>
                <option value="">—</option>
                {NIVEAUX_ENCADRANT.map(n => <option key={n} value={n}>{n}</option>)}
              </select></div>
          </div>
          <div className="field" style={{ marginTop:10 }}>
            <label>Certificat médical (expiration) *</label>
            <input className="input" type="date" value={form.medical} onChange={e => sf('medical', e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? '…' : 'Créer'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenPalanquees });
