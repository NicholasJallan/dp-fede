// DP Assistant — Profilage de la plongée (v2)

// ── DPPicker ──────────────────────────────────────────────────────────────
function DPPicker({ value, divers, onChange }) {
  const candidates = useMemo(() => divers.filter(d => {
    const ne = d.niveau_encadrant;
    return ne && ['E1','E2','E3','E4','N5'].includes(ne);
  }), [divers]);

  return (
    <div>
      <select className="input" value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— choisir le DP —</option>
        {candidates.map(d => (
          <option key={d.id} value={d.id}>
            {diverFullName(d)} ({d.niveau_encadrant})
            {d.diplome_pro ? ` — ${d.diplome_pro}` : ''}
          </option>
        ))}
      </select>
      {candidates.length === 0 && (
        <div className="field-hint" style={{ color:'var(--coral)' }}>
          Aucun plongeur avec qualification DP dans l'annuaire. Ajoutez un plongeur avec niveau encadrant E1→E4 ou N5.
        </div>
      )}
    </div>
  );
}

// ── SitePicker + quick-add ────────────────────────────────────────────────
function SitePicker({ value, sites, setSites, onChange, answers }) {
  const [showAdd, setShowAdd] = useState(false);
  const [quickForm, setQuickForm] = useState({ nom:'', milieu:'En mer', profondeur_max:'',
    coordonnees:null, notes:'', depart_bord:false, depart_bateau:false });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const sf = (k, v) => setQuickForm(f => ({ ...f, [k]: v }));

  const createSite = async () => {
    if (!quickForm.nom.trim()) { setErr('Nom requis'); return; }
    if (!quickForm.depart_bord && !quickForm.depart_bateau) { setErr('Indiquer au moins un type de départ'); return; }
    setSaving(true); setErr('');
    try {
      const s = await api.sites.create({
        ...quickForm,
        profondeur_max: quickForm.profondeur_max !== '' ? parseFloat(quickForm.profondeur_max) : null,
      });
      setSites(prev => [...prev, s].sort((a,b) => a.nom.localeCompare(b.nom)));
      onChange(s.id);
      setShowAdd(false);
      setQuickForm({ nom:'', milieu:'En mer', profondeur_max:'', coordonnees:null, notes:'', depart_bord:false, depart_bateau:false });
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const selected = sites.find(s => s.id === value);
  const milieuType = window.getMilieuType(answers.milieu);

  return (
    <div>
      <div className="row" style={{ gap:8 }}>
        <select className="input" value={value || ''} onChange={e => onChange(e.target.value)} style={{ flex:1 }}>
          <option value="">— choisir un site —</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.nom} ({s.milieu})</option>)}
        </select>
        <button className="btn ghost" onClick={() => setShowAdd(true)} title="Nouveau site">+</button>
      </div>

      {selected && (
        <div className="site-info-box">
          <div><b>{selected.nom}</b> · {selected.milieu}</div>
          {selected.profondeur_max && <div className="muted">Profondeur max : {selected.profondeur_max} m</div>}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
            {selected.depart_bord   && <Pill>Départ bord</Pill>}
            {selected.depart_bateau && <Pill>Départ bateau</Pill>}
          </div>
          {selected.notes && <div className="muted" style={{ fontSize:12, marginTop:4 }}>{selected.notes}</div>}
          {selected.coordonnees?.lat && (
            <div className="muted" style={{ fontSize:11, fontFamily:'var(--t-mono)', marginTop:4 }}>
              {Number(selected.coordonnees.lat).toFixed(5)}, {Number(selected.coordonnees.lng).toFixed(5)}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ maxWidth:460 }}>
            <div className="modal-head">
              <h3>Nouveau site (création rapide)</h3>
              <button className="x" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              {err && <Alert tone="warn" style={{ marginBottom:8 }}>{err}</Alert>}
              <div className="field">
                <label>Nom du site *</label>
                <input className="input" value={quickForm.nom}
                  onChange={e => sf('nom', e.target.value)} placeholder="Épave du Rhône, Sec de…" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
                <div className="field">
                  <label>Milieu</label>
                  <select className="input" value={quickForm.milieu} onChange={e => sf('milieu', e.target.value)}>
                    {['En mer','Lac','Carrière','Piscine','Autre'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Prof. max (m)</label>
                  <input className="input" type="number" min="0" max="300" step="0.5"
                    value={quickForm.profondeur_max} onChange={e => sf('profondeur_max', e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop:10 }}>
                <label>Type de départ *</label>
                <div className="qualif-row">
                  {[['depart_bord','Du bord'],['depart_bateau','En bateau']].map(([k, label]) => (
                    <label key={k} className={`qualif-toggle ${quickForm[k] ? 'on' : ''}`}>
                      <input type="checkbox" checked={!!quickForm[k]} onChange={() => sf(k, !quickForm[k])} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowAdd(false)}>Annuler</button>
              <button className="btn primary" onClick={createSite} disabled={saving}>
                {saving ? 'Création…' : 'Créer et sélectionner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MeteoField ────────────────────────────────────────────────────────────
function MeteoField({ value, onChange, site, date }) {
  const [fetching, setFetching] = useState(false);

  const fetchMeteo = async () => {
    const coords = site?.coordonnees;
    if (!coords?.lat) return;
    setFetching(true);
    try {
      const dt = date ? new Date(date) : new Date();
      const day = dt.toISOString().slice(0,10);
      const hour = dt.getHours();
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}` +
        `&hourly=temperature_2m,windspeed_10m,windgusts_10m,weathercode,visibility&` +
        `&start_date=${day}&end_date=${day}&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.hourly) throw new Error('Données indisponibles');
      const h = data.hourly;
      const i = Math.min(hour, h.time.length - 1);
      const wc = h.weathercode?.[i];
      const wind = h.windspeed_10m?.[i];
      const gusts = h.windgusts_10m?.[i];
      const temp = h.temperature_2m?.[i];
      const vis  = h.visibility?.[i];
      const desc = meteoCode(wc);
      const text = `${desc} — vent ${wind ? wind.toFixed(0) : '?'} km/h (rafales ${gusts ? gusts.toFixed(0) : '?'} km/h) — temp. ${temp ? temp.toFixed(1) : '?'}°C — visibilité ${vis ? (vis/1000).toFixed(1) : '?'} km`;
      onChange((value ? value + '\n' : '') + `Météo (open-meteo, ${dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}) : ${text}`);
    } catch {
      onChange((value || '') + '\n[Météo non disponible — renseigner manuellement]');
    } finally { setFetching(false); }
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}>
        {site?.coordonnees?.lat && (
          <button className="btn ghost" style={{ fontSize:12, padding:'3px 10px' }}
            onClick={fetchMeteo} disabled={fetching}>
            {fetching ? 'Récupération…' : '⛅ Précompléter depuis météo'}
          </button>
        )}
        {!site?.coordonnees?.lat && (
          <span className="muted" style={{ fontSize:12 }}>Saisir les coordonnées GPS du site pour la précomplétion météo.</span>
        )}
      </div>
      <textarea className="textarea" rows={3}
        placeholder="Vent, état de la mer, courant, visibilité estimée…"
        value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// Codes météo WMO simplifiés
function meteoCode(code) {
  if (code == null) return 'Météo inconnue';
  if (code === 0) return 'Ciel dégagé';
  if (code <= 3)  return 'Partiellement nuageux';
  if (code <= 48) return 'Brumeux / brouillard';
  if (code <= 67) return 'Pluie';
  if (code <= 77) return 'Neige';
  if (code <= 82) return 'Averses';
  if (code <= 99) return 'Orage';
  return 'Variable';
}

// ── ScreenProfil ──────────────────────────────────────────────────────────
function ScreenProfil({ answers, setAnswer, derived, divers, sites, setSites }) {
  const { user } = useAuth();
  const sections = window.QUESTIONS;
  const [activeId, setActiveId] = useState(sections[0].id);

  const visibleSections = sections.filter(s => !s.when || s.when(answers));

  // DP sélectionné
  const selectedDP = useMemo(() => divers.find(d => d.id === answers.dp_id), [divers, answers.dp_id]);
  const dpQual     = selectedDP?.niveau_encadrant || null;
  const dpN5       = dpQual === 'N5';

  // Site sélectionné
  const selectedSite = useMemo(() => sites.find(s => s.id === answers.site_id), [sites, answers.site_id]);

  // Quand DP change → propager dp_qual + verrouiller activité si N5
  useEffect(() => {
    setAnswer('dp_qual', dpQual || '');
    setAnswer('dp_nom', selectedDP ? diverFullName(selectedDP) : '');
    if (dpN5 && answers.activite !== 'Exploration') setAnswer('activite', 'Exploration');
  }, [answers.dp_id]);

  // Quand site change → propager depart_bord/bateau
  useEffect(() => {
    if (selectedSite) {
      setAnswer('depart_bord',   selectedSite.depart_bord);
      setAnswer('depart_bateau', selectedSite.depart_bateau);
      setAnswer('site_nom',      selectedSite.nom);
    }
  }, [answers.site_id]);

  // Air activé par défaut dès la première session
  useEffect(() => {
    if (answers.air === undefined) setAnswer('air', true);
  }, []);

  // Scroll-spy
  useEffect(() => {
    const onScroll = () => {
      let current = visibleSections[0]?.id;
      for (const s of visibleSections) {
        const el = document.getElementById('sect-' + s.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top < 140) current = s.id;
      }
      setActiveId(current);
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [visibleSections.length]);

  const scrollTo = (id) => {
    const el = document.getElementById('sect-' + id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior:'smooth' });
  };

  // Options prof_max dynamiques selon DP
  const profOptions = useMemo(() => window.getProfOptions(dpQual, answers.activite), [dpQual, answers.activite]);

  // Validation D : au moins un gaz
  const noGaz = !answers.air && !answers.nitrox && !answers.trimix && !answers.oxygene_pur;

  // Structure type display
  const structureLabel = user?.structure_type
    ? (window.STRUCTURE_LABELS[user.structure_type] || user.structure_type)
    : null;

  const renderQuestion = (q) => {
    if (!window.matchCondition(q.when, answers)) return null;
    const val = answers[q.id];
    const set = (v) => setAnswer(q.id, v);

    // Types spéciaux
    if (q.id === 'dp_id') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
          <DPPicker value={val} divers={divers} onChange={set} />
          {selectedDP && (
            <div className="site-info-box" style={{ marginTop:6 }}>
              <b>{diverFullName(selectedDP)}</b> ·{' '}
              <Pill tone="ink">{dpQual}</Pill>
              {selectedDP.diplome_pro && <Pill tone="marine" style={{ marginLeft:4 }}>{selectedDP.diplome_pro}</Pill>}
              {dpN5 && <Alert tone="info" style={{ marginTop:6 }}>N5 : activité forcée sur Exploration.</Alert>}
            </div>
          )}
        </Field>
      );
    }

    if (q.id === 'structure') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint}>
          <div className="muted" style={{ padding:'8px 0', fontStyle: structureLabel ? 'normal' : 'italic' }}>
            {structureLabel || 'Non renseigné — à définir dans Paramètres → Mon compte'}
            {user?.club_nom ? <span style={{ marginLeft:8, color:'var(--ink-2)' }}>· {user.club_nom}</span> : null}
          </div>
        </Field>
      );
    }

    if (q.id === 'activite') {
      return (
        <Field key={q.id} label={q.label} hint={dpN5 ? 'Bloqué sur Exploration (DP est N5).' : q.hint} regRef={q.ref} required={q.required}>
          <div className={`opt-group col-4 ${dpN5 ? 'locked-group' : ''}`}>
            {q.options.map(o => (
              <Opt key={o} label={o} checked={val === o}
                onClick={() => !dpN5 && set(o)} />
            ))}
          </div>
        </Field>
      );
    }

    if (q.id === 'site_id') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint} required={q.required}>
          <SitePicker value={val} sites={sites} setSites={setSites}
            onChange={set} answers={answers} />
        </Field>
      );
    }

    if (q.id === 'meteo') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint}>
          <MeteoField value={val} onChange={set} site={selectedSite} date={answers.date} />
        </Field>
      );
    }

    if (q.id === 'prof_max') {
      if (profOptions.length === 0) {
        return (
          <Field key={q.id} label={q.label} regRef={q.ref}>
            <Alert tone="warn">Choisir un DP avec prérogatives d'enseignement ou d'exploration avant de fixer la profondeur.</Alert>
          </Field>
        );
      }
      return (
        <Field key={q.id} label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
          <div className={`opt-group col-4`}>
            {profOptions.map(o => (
              <Opt key={o} label={o} checked={val === o} onClick={() => set(o)} />
            ))}
          </div>
        </Field>
      );
    }

    if (q.id === 'trimix_secu_note') {
      return <Alert key={q.id} tone="info">Trimix : la sécurité surface continue est obligatoire pendant toute la durée de la plongée (Art. A322-91).</Alert>;
    }

    return <Question key={q.id} q={q} value={val} onChange={(_, v) => set(v)} />;
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 1 / 5 · Profilage de la plongée</div>
        <h1>Caractériser la plongée à venir</h1>
        <p>Les réponses pilotent les questions complémentaires, la check-list et la composition des palanquées.</p>
      </div>

      <div className="subnav">
        {visibleSections.map(s => (
          <a key={s.id} href={`#sect-${s.id}`}
            className={activeId === s.id ? 'active' : ''}
            onClick={e => { e.preventDefault(); scrollTo(s.id); }}>
            {s.id} · {s.title}
          </a>
        ))}
      </div>

      {noGaz && (
        <Alert tone="warn">Section D — Au moins un mélange respiratoire doit être sélectionné.</Alert>
      )}

      {visibleSections.map(s => (
        <div className="card" key={s.id} id={`sect-${s.id}`}>
          <div className="card-head">
            <span className="ix">SECTION {s.id}</span>
            <h2>{s.title}</h2>
          </div>
          <div className="card-body dense">
            {s.questions.map(q => renderQuestion(q))}
          </div>
        </div>
      ))}

      {derived.notes.length > 0 && (
        <div style={{ marginTop:16 }}>
          {derived.notes.map((n, i) => <Alert key={i} tone={n.tone}>{n.text}</Alert>)}
        </div>
      )}

      <div className="disclaimer">
        Outil d'aide à la décision. Ne se substitue pas à la responsabilité du Directeur de Plongée.
      </div>
    </div>
  );
}

Object.assign(window, { ScreenProfil });
