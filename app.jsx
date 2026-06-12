// DP Assistant — Shell principal & state management

const STEPS = [
  { id:"profil",     num:"01", label:"Profil de plongée",        sub:"Questionnaire" },
  { id:"palanquees", num:"02", label:"Plongeurs & palanquées",    sub:"Composition" },
  { id:"checklist",  num:"03", label:"Check-list opérationnelle", sub:"Phases 1→5" },
  { id:"fiche",      num:"04", label:"Fiche de sécurité",         sub:"Art. A322-72" },
  { id:"archive",    num:"05", label:"Archiver la plongée",       sub:"Google Drive" },
];

const ADMIN_SCREENS = ["admin-divers", "admin-sites", "admin-users", "account", "archives"];

const SUPER_ADMIN_EMAIL = "nicholas.jallan@gmail.com";
const isSuperAdmin = (u) => !!u && u.email === SUPER_ADMIN_EMAIL;

function AppInner() {
  const { user, loading: authLoading, logout, authMode } = useAuth();
  const { showToast } = useToasts();
  const online = window.useOnline ? window.useOnline() : true;
  const [authExpired, setAuthExpired] = useState(false);
  useEffect(() => {
    const onExpire = () => setAuthExpired(true);
    window.addEventListener('dp:authExpired', onExpire);
    return () => window.removeEventListener('dp:authExpired', onExpire);
  }, []);

  // ── Outbox / sync ────────────────────────────────────────────────────────
  const [outboxItems, setOutboxItems] = useState([]);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const refreshOutbox = useCallback(async () => {
    if (!window.outbox) return;
    const items = await window.outbox.pending();
    setOutboxItems(items.sort((a, b) => a.createdAt - b.createdAt));
  }, []);
  useEffect(() => {
    if (!user) return;
    refreshOutbox();
    const onChange = () => refreshOutbox();
    window.addEventListener('dp:outboxChanged', onChange);
    window.addEventListener('dp:syncDone',      onChange);
    return () => {
      window.removeEventListener('dp:outboxChanged', onChange);
      window.removeEventListener('dp:syncDone',      onChange);
    };
  }, [user, refreshOutbox]);

  // ── Navigation & mode ────────────────────────────────────────────────────
  const [screen,       setScreen]       = useState("home");
  // 'prepare' : étapes 1-3 (profil→palanquées→check-list phase 1)
  // 'execute' : étapes 3-5 (check-list phase 2→fiche→archive)
  const [diveMode,     setDiveMode]     = useState('prepare');
  // Modal « Urgence » accessible en un geste pendant le suivi temps réel.
  const [urgenceOpen,  setUrgenceOpen]  = useState(false);

  // ── Session en cours ─────────────────────────────────────────────────────
  const [currentDiveId, setCurrentDiveId] = useState(null); // client_uuid de la plongée ouverte
  const [answers,       setAnswers]       = useState({});
  const [palanquees,    setPalanquees]    = useState([]);
  const [checked,       setChecked]       = useState({});
  const [comments,      setComments]      = useState({});
  const [pressions,     setPressions]     = useState({});
  const [realises,      setRealises]      = useState({});
  const [heuresDebut,   setHeuresDebut]   = useState({});
  const [heuresFin,     setHeuresFin]     = useState({});
  const [plongeeFigee,  setPlongeeFigee]  = useState(false);
  const [confirmModal,  setConfirmModal]  = useState(false);
  const [archiveDone,   setArchiveDone]   = useState(false);
  const [showSplash,    setShowSplash]    = useState(false);

  // Modal de confirmation ±4 h avant de démarrer une plongée
  const [confirmStart, setConfirmStart] = useState(null);

  // ── Chargeurs annuaire ───────────────────────────────────────────────────
  const [divers,       setDivers]       = useState([]);
  const [diversLoaded, setDiversLoaded] = useState(false);
  const [sites,        setSites]        = useState([]);
  const [sitesLoaded,  setSitesLoaded]  = useState(false);

  // Migration one-time : supprimer l'ancien brouillon localStorage v1 (désormais obsolète)
  useEffect(() => {
    try { localStorage.removeItem('dp-assistant-v1'); } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    setShowSplash(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user || diversLoaded) return;
    api.divers.list()
      .then(list => { setDivers(list); setDiversLoaded(true); })
      .catch(() => {
        try {
          const raw = localStorage.getItem('dp-cache-divers');
          if (raw) { const { list } = JSON.parse(raw); if (Array.isArray(list)) setDivers(list); }
        } catch {}
        setDiversLoaded(true);
      });
  }, [user, diversLoaded]);

  useEffect(() => {
    if (!user || sitesLoaded) return;
    api.sites.list()
      .then(list => { setSites(list); setSitesLoaded(true); })
      .catch(() => {
        try {
          const raw = localStorage.getItem('dp-cache-sites');
          if (raw) { const { list } = JSON.parse(raw); if (Array.isArray(list)) setSites(list); }
        } catch {}
        setSitesLoaded(true);
      });
  }, [user, sitesLoaded]);

  const refreshDiversAndSites = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.divers.list(), api.sites.list()]);
      setDivers(d);
      setSites(s);
    } catch {}
  }, []);

  // ── Snapshot ref (auto-save sans dépendances dans loadDive) ──────────────
  // Mise à jour inline (pas dans useEffect) pour que flushSave lise toujours
  // l'état courant même si l'utilisateur quitte la fiche juste après un setState.
  const stateRef = useRef({});
  stateRef.current = { answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin };

  // ── Auto-save debounced vers le serveur ──────────────────────────────────
  const autoSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!user || !currentDiveId || plongeeFigee) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const summary = {};
      if (answers.site_nom) summary.site_nom    = answers.site_nom;
      if (answers.dp_nom)   summary.dp_nom      = answers.dp_nom;
      if (answers.dp_qual)  summary.dp_qual     = answers.dp_qual;
      if (answers.date)   { summary.date_plongee = answers.date; summary.planned_at = answers.date; }
      api.dives.update(currentDiveId, {
        answers,
        palanquees,
        render_state: { checked, comments, pressions, realises, heuresDebut, heuresFin },
        ...summary,
      }).catch(err => console.warn('[DP] auto-save:', err?.message));
    }, 500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin, currentDiveId, user, plongeeFigee]);

  // ── Détection transition prepared → in_progress (1er heuresDebut) ───────
  const prevHeuresDbutCountRef = useRef(0);
  useEffect(() => {
    const count = Object.keys(heuresDebut).length;
    if (prevHeuresDbutCountRef.current === 0 && count > 0 && currentDiveId) {
      api.dives.update(currentDiveId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      }).catch(() => {});
    }
    prevHeuresDbutCountRef.current = count;
  }, [heuresDebut, currentDiveId]);

  // ── Callbacks ────────────────────────────────────────────────────────────

  const setAnswer     = useCallback((id, v) => setAnswers(prev => ({ ...prev, [id]: v })), []);
  const updateChecked = useCallback((id, v) => setChecked(prev => ({ ...prev, [id]: v })), []);
  const updateComment = useCallback((id, v) => setComments(prev => ({ ...prev, [id]: v })), []);

  // Vide l'état mémoire (ne modifie pas currentDiveId)
  const resetDiveState = useCallback(() => {
    setAnswers({});
    setPalanquees([]);
    setChecked({});
    setComments({});
    setPressions({});
    setRealises({});
    setHeuresDebut({});
    setHeuresFin({});
    setPlongeeFigee(false);
    setConfirmModal(false);
    setArchiveDone(false);
    prevHeuresDbutCountRef.current = 0;
  }, []);

  // Flush immédiat de l'auto-save vers la plongée courante
  const flushSave = useCallback((diveId) => {
    if (!diveId) return;
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    const s = stateRef.current;
    const summary = {};
    if (s.answers.site_nom) summary.site_nom    = s.answers.site_nom;
    if (s.answers.dp_nom)   summary.dp_nom      = s.answers.dp_nom;
    if (s.answers.dp_qual)  summary.dp_qual     = s.answers.dp_qual;
    if (s.answers.date)   { summary.date_plongee = s.answers.date; summary.planned_at = s.answers.date; }
    api.dives.update(diveId, {
      answers:      s.answers,
      palanquees:   s.palanquees,
      render_state: { checked: s.checked, comments: s.comments, pressions: s.pressions, realises: s.realises, heuresDebut: s.heuresDebut, heuresFin: s.heuresFin },
      ...summary,
    }).catch(() => {});
  }, []);

  // Charge une plongée depuis le store local (auto-save de la courante si différente)
  const loadDive = useCallback(async (clientUuid, targetScreen, mode = 'prepare') => {
    if (currentDiveId && currentDiveId !== clientUuid) {
      flushSave(currentDiveId);
    }

    let dive;
    try {
      dive = await api.dives.get(clientUuid);
    } catch {
      dive = await window.offlineStore.get('dives', clientUuid);
    }
    if (!dive) { showToast({ tone: 'err', title: 'Plongée introuvable', body: clientUuid }); return; }

    const a  = typeof dive.answers      === 'string' ? JSON.parse(dive.answers)      : (dive.answers      || {});
    const p  = typeof dive.palanquees   === 'string' ? JSON.parse(dive.palanquees)   : (dive.palanquees   || []);
    const rs = typeof dive.render_state === 'string' ? JSON.parse(dive.render_state) : (dive.render_state || {});

    setAnswers(a);
    setPalanquees(p);
    setChecked(rs.checked   || {});
    setComments(rs.comments  || {});
    setPressions(rs.pressions || {});
    setRealises(rs.realises  || {});
    setHeuresDebut(rs.heuresDebut || {});
    setHeuresFin(rs.heuresFin   || {});
    setPlongeeFigee(dive.status === 'archived');
    prevHeuresDbutCountRef.current = Object.keys(rs.heuresDebut || {}).length;
    setCurrentDiveId(clientUuid);
    setDiveMode(mode);
    setArchiveDone(false);
    setConfirmModal(false);

    refreshDiversAndSites();
    setScreen(targetScreen || (mode === 'execute' ? 'checklist' : 'profil'));
    window.scrollTo({ top: 0 });
  }, [currentDiveId, flushSave, refreshDiversAndSites, showToast]);

  // Crée une nouvelle plongée préparée
  const startPreparation = useCallback(async (prefill = null, overrideDate = null) => {
    if (currentDiveId) flushSave(currentDiveId);

    const client_uuid = window.randomUUID();
    const lastRappel  = localStorage.getItem('dp-rappel-moyen') || '';
    const pad  = n => String(n).padStart(2, '0');
    let newDate;
    if (overrideDate) {
      newDate = overrideDate;
    } else {
      const t = new Date(); t.setMinutes(0, 0, 0); t.setHours(t.getHours() + 1);
      newDate = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:00`;
    }

    const initialAnswers = prefill
      ? { ...prefill.answers, date: newDate, meteo: '', maree_horaire: '', fiche_observations: '', maree_heure: '', maree_coef: '' }
      : (lastRappel ? { moyen_rappel: lastRappel, date: newDate } : { date: newDate });
    const initialPals = prefill ? prefill.palanquees : [];

    await api.dives.create({
      client_uuid,
      status:       'prepared',
      site_nom:     initialAnswers.site_nom || '',
      date_plongee: newDate,
      planned_at:   newDate,
      dp_nom:       initialAnswers.dp_nom  || '',
      dp_qual:      initialAnswers.dp_qual || '',
      activite:     '',
      answers:      initialAnswers,
      palanquees:   initialPals,
      render_state: {},
    });

    resetDiveState();
    setAnswers(initialAnswers);
    setPalanquees(initialPals);
    setCurrentDiveId(client_uuid);
    setDiveMode('prepare');
    refreshDiversAndSites();
    setScreen('profil');
    window.scrollTo({ top: 0 });
  }, [currentDiveId, flushSave, resetDiveState, refreshDiversAndSites]);

  // Démarre l'exécution d'une plongée préparée (vérifie ±4 h)
  const startExecution = useCallback((dive) => {
    const planned = new Date(dive.planned_at || dive.date_plongee);
    const now     = new Date();
    const diffH   = Math.abs(now - planned) / 3_600_000;
    if (diffH > 4 && !isNaN(planned.getTime())) {
      setConfirmStart({ dive, diffH, planned });
      return;
    }
    loadDive(dive.client_uuid || dive.id, 'checklist', 'execute');
  }, [loadDive]);

  const confirmStartExecution = useCallback(() => {
    if (!confirmStart) return;
    const dive = confirmStart.dive;
    setConfirmStart(null);
    loadDive(dive.client_uuid || dive.id, 'checklist', 'execute');
  }, [confirmStart, loadDive]);

  // Supprime une plongée préparée
  const deleteDive = useCallback(async (clientUuid) => {
    await api.dives.delete(clientUuid);
    if (currentDiveId === clientUuid) {
      resetDiveState();
      setCurrentDiveId(null);
      setScreen('home');
    }
    showToast({ tone: 'ok', title: 'Plongée supprimée' });
  }, [currentDiveId, resetDiveState, showToast]);

  // Clone une plongée archivée en nouvelle plongée préparée
  const cloneDive = useCallback(async (archiveId) => {
    try {
      const data = await api.dives.get(archiveId);
      const oldAnswers = typeof data.answers   === 'string' ? JSON.parse(data.answers)   : (data.answers   || {});
      const oldPals    = typeof data.palanquees === 'string' ? JSON.parse(data.palanquees) : (data.palanquees || []);
      // Nettoyer les données d'exécution des palanquées clonées
      const cleanPals = oldPals.map(p => {
        const { dtr, profMax, duree, ...rest } = p;
        return rest;
      });
      const pad = n => String(n).padStart(2, '0');
      const t = new Date(Date.now() + 3 * 3_600_000);
      const h3Str = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
      await startPreparation({ answers: oldAnswers, palanquees: cleanPals }, h3Str);
    } catch (err) {
      showToast({ tone: 'err', title: 'Clonage impossible', body: err.message });
    }
  }, [startPreparation, showToast]);

  // Clone une plongée préparée en nouvelle plongée H+3
  const clonePreparedH3 = useCallback(async (clientUuid) => {
    try {
      const data = await api.dives.get(clientUuid);
      const oldAnswers = typeof data.answers   === 'string' ? JSON.parse(data.answers)   : (data.answers   || {});
      const oldPals    = typeof data.palanquees === 'string' ? JSON.parse(data.palanquees) : (data.palanquees || []);
      const pad = n => String(n).padStart(2, '0');
      const orig = new Date(oldAnswers.date || data.planned_at || data.date_plongee);
      const h3   = new Date(orig.getTime() + 3 * 3_600_000);
      const h3Str = `${h3.getFullYear()}-${pad(h3.getMonth()+1)}-${pad(h3.getDate())}T${pad(h3.getHours())}:${pad(h3.getMinutes())}`;
      await startPreparation({ answers: oldAnswers, palanquees: oldPals }, h3Str);
    } catch (err) {
      showToast({ tone: 'err', title: 'Clonage impossible', body: err.message });
    }
  }, [startPreparation, showToast]);

  // Fin du mode préparation → sauvegarde + retour accueil
  const finishPreparation = useCallback(() => {
    if (currentDiveId) flushSave(currentDiveId);
    setScreen('home');
    window.scrollTo({ top: 0 });
    showToast({ tone: 'ok', title: 'Plongée préparée', body: 'Retrouvez-la dans la liste des plongées préparées.' });
  }, [currentDiveId, flushSave, showToast]);

  // ── Logique checklist + fiche ─────────────────────────────────────────────
  const derived = useMemo(() => {
    const notes = [];
    const profNum = parseFloat(answers.prof_max);
    if (answers.activite === "Enseignement" && profNum > 40 && answers.dp_qual !== "E4") {
      notes.push({ tone:"warn", text:"Enseignement > 40 m : un E4 est requis comme DP (Annexe III-16a)." });
    }
    if (answers.recycleur && profNum > 6) {
      notes.push({ tone:"info", text:"Recycleur > 6 m : un secours circuit-ouvert est obligatoire (Art. A322-94)." });
    }
    if (answers.depart_bateau && !answers.vhf) {
      notes.push({ tone:"warn", text:"Sortie en bateau sans VHF déclarée — moyen de communication à confirmer." });
    }
    if (window.getMilieuType(answers.milieu) === 'piscine') {
      notes.push({ tone:"info", text:"En piscine ≤ 6 m : la fiche de sécurité n'est pas obligatoire (Art. A322-98)." });
    }
    return { notes };
  }, [answers]);

  const currentStepIdx  = STEPS.findIndex(s => s.id === screen);
  const isStepScreen    = currentStepIdx >= 0;
  const isAdminScreen   = ADMIN_SCREENS.includes(screen);
  const divePlongeesEnCours = Object.keys(heuresDebut).length > 0;
  const FICHE_IDX    = STEPS.findIndex(s => s.id === "fiche");
  const ARCHIVE_IDX  = STEPS.findIndex(s => s.id === "archive");
  const allPalanqueesFinished = palanquees.length > 0
    && palanquees.every(p => heuresDebut[p.id] && heuresFin[p.id]);

  const goPrev = () => {
    if (plongeeFigee) return;
    if (divePlongeesEnCours && currentStepIdx <= FICHE_IDX) return;
    if (diveMode === 'execute' && currentStepIdx <= STEPS.findIndex(s => s.id === 'checklist')) return;
    if (currentStepIdx <= 0) { setScreen("home"); return; }
    setScreen(STEPS[currentStepIdx - 1].id);
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const blockingPalSummary = useMemo(() => {
    if (typeof window.validatePal !== 'function') return [];
    const diversById = {};
    divers.forEach(d => { diversById[d.id] = d; });
    const dp = divers.find(d => d.id === answers.dp_id) || null;
    return palanquees
      .map((p, idx) => {
        const issues = window.validatePal(p, diversById, answers, dp);
        const errs = issues.filter(i => i.tone === 'err').map(i => i.text);
        return { id: p.id, nom: p.nom || `Palanquée ${idx + 1}`, errs };
      })
      .filter(s => s.errs.length > 0);
  }, [palanquees, divers, answers]);

  const goNext = () => {
    if (screen === "home") { startPreparation(); return; }
    // Fin de préparation : bouton "Suivant" sur la check-list phase 1
    if (screen === "checklist" && diveMode === 'prepare') {
      finishPreparation();
      return;
    }
    if (screen === "palanquees" && blockingPalSummary.length > 0) {
      setConfirmModal("pal_blocking");
      return;
    }
    if (screen === "fiche") {
      if (!allPalanqueesFinished) return;
      setConfirmModal("confirm");
      return;
    }
    if (currentStepIdx < STEPS.length - 1) setScreen(STEPS[currentStepIdx + 1].id);
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const overridePalBlocking = () => {
    setConfirmModal(false);
    if (currentStepIdx < STEPS.length - 1) setScreen(STEPS[currentStepIdx + 1].id);
    window.scrollTo({ top:0, behavior:"smooth" });
  };
  const confirmArchive = () => {
    setPlongeeFigee(true);
    setConfirmModal(false);
    setScreen("archive");
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const total     = window.CHECKLIST_RULES.reduce((n, p) =>
    n + p.items.filter(it => window.matchCondition(it.when, answers)).length, 0);
  const doneCount = Object.values(checked).filter(Boolean).length;

  if (authLoading) {
    return (
      <div className="app" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div className="muted">Chargement…</div>
      </div>
    );
  }

  if (!user) return <ScreenLogin />;

  const selectedSite = sites.find(s => s.id === answers.site_id);
  const siteName = selectedSite?.nom || answers.site_nom || answers.site || '—';
  const departParts = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean);
  const depart = departParts.join(' / ') || '—';
  const displayName = user.prenom || user.nom || user.email?.split('@')[0] || 'Moi';

  const sideSummary = (
    <div className="side">
      <div className="card">
        <div className="card-head"><h2>Synthèse</h2></div>
        <div className="card-body">
          <div className="summary-line"><span className="k">Site</span><span className="v">{siteName}</span></div>
          <div className="summary-line"><span className="k">Date</span><span className="v">{answers.date ? formatDateTime(answers.date) : "—"}</span></div>
          <div className="summary-line"><span className="k">DP</span><span className="v">{answers.dp_nom || "—"} <small className="muted">({answers.dp_qual || "—"})</small></span></div>
          <div className="summary-line"><span className="k">Activité</span><span className="v">{answers.activite || "—"}</span></div>
          <div className="summary-line"><span className="k">Milieu</span><span className="v">{answers.milieu || "—"}</span></div>
          <div className="summary-line"><span className="k">Départ</span><span className="v">{depart}</span></div>
          <div className="summary-line"><span className="k">Prof. max</span><span className="v">{answers.prof_max || "—"}</span></div>
          <div className="summary-line"><span className="k">Palanquées</span><span className="v">{palanquees.length}</span></div>
          <div className="summary-line"><span className="k">Plongeurs</span><span className="v">{palanquees.reduce((n, p) => n + p.membres.length, 0)}</span></div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Contextes actifs</h2></div>
        <div className="card-body">
          <div className="row tight" style={{ gap:6 }}>
            {answers.air           && <Pill tone="marine">AIR</Pill>}
            {answers.nitrox        && <Pill tone="kelp">NITROX</Pill>}
            {answers.trimix        && <Pill tone="sun">TRIMIX</Pill>}
            {answers.recycleur     && <Pill tone="coral">RECYCLEUR</Pill>}
            {answers.depart_bateau && <Pill>BATEAU</Pill>}
            {answers.depart_bord   && <Pill>BORD</Pill>}
            {answers.mineurs       && <Pill>MINEURS</Pill>}
            {answers.handisub      && <Pill>HANDISUB</Pill>}
            {answers.etrangers     && <Pill>BREVETS ÉTR.</Pill>}
            {!answers.air && !answers.nitrox && !answers.trimix && !answers.recycleur
             && !answers.depart_bateau && !answers.depart_bord
             && <span className="muted">À renseigner →</span>}
          </div>
        </div>
      </div>
    </div>
  );

  const useSide = isStepScreen && screen !== "fiche";

  // Masquer les étapes exécution en mode prepare, et vice-versa
  const prepareOnlySteps = ['profil', 'palanquees'];
  const executeOnlySteps = ['fiche', 'archive'];
  // En mode execute, on montre checklist+fiche+archive ; en prepare, profil+palanquees+checklist

  return (
    <div className="app">
      {authExpired && (
        <div style={{
          background: '#c0392b', color: 'white', padding: '10px 16px',
          fontSize: 13, textAlign: 'center', fontWeight: 500,
        }}>
          ⚠ Votre session a expiré côté serveur. Reconnectez-vous pour synchroniser les actions en attente.
          <button onClick={logout} style={{
            marginLeft: 12, background: 'white', color: '#c0392b',
            border: 0, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            fontWeight: 600, fontSize: 12,
          }}>Reconnexion</button>
        </div>
      )}
      <div className="topbar">
        <button
          className="wordmark"
          onClick={() => { if (currentDiveId) flushSave(currentDiveId); setScreen("home"); }}
          title="Retour à l'accueil"
          style={{ background:'transparent', border:0, color:'inherit', cursor:'pointer', padding:0 }}>
          <span className="dot"></span>
          DP/ASSISTANT
        </button>
        {(isStepScreen || isAdminScreen) && (
          <button className="session-link"
            onClick={() => { if (currentDiveId) flushSave(currentDiveId); setScreen("home"); }}
            style={{ marginLeft: 4 }}>
            ← Accueil
          </button>
        )}
        <span className="muted topbar-sep" style={{ color:"var(--ink-4)" }}>·</span>
        <span className="topbar-user-label" style={{ fontSize:13 }}>{user.club_nom || user.email}</span>
        <span className="meta">
          <button onClick={() => setDrawerOpen(true)} className="session-link"
            title={online
              ? (outboxItems.length === 0 ? 'Connecté — tout est synchronisé' : `${outboxItems.length} action(s) en cours`)
              : `Hors ligne — ${outboxItems.length} action(s) en attente`}
            style={{ display:'inline-flex', alignItems:'center', gap:6,
              background:'transparent', border:0, padding:0, cursor:'pointer', color:'inherit', font:'inherit' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: online ? 'var(--kelp, #2d8653)' : 'var(--coral, #e07856)',
              boxShadow: online ? 'none' : '0 0 0 3px rgba(224,120,86,0.18)',
              flexShrink: 0,
            }} />
            <b>{online ? 'EN LIGNE' : 'HORS LIGNE'}</b>
            {outboxItems.length > 0 && (
              <span style={{
                background: online ? 'var(--marine, #0a4a6e)' : 'var(--coral, #e07856)',
                color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700,
                padding: '1px 7px', minWidth: 18, textAlign: 'center',
              }}>{outboxItems.length}</span>
            )}
          </button>
          <span className="topbar-autosave">AUTO-SAVE · <b>ON</b></span>
          <button className="session-link" onClick={() => setScreen("account")} title="Mon compte">
            {displayName}
          </button>
          <button className="session-link" onClick={() => setScreen("archives")}>Historique</button>
          {user.role === 'admin' && (
            <button className="session-link topbar-admin-btn" onClick={() => setScreen("admin-divers")} title="Administration">
              Admin
            </button>
          )}
          <button className="session-link topbar-logout-btn" onClick={logout}>Déconnexion</button>
        </span>
      </div>

      {isStepScreen && (
        <div className="stepper">
          {STEPS.map((s, i) => {
            // En mode prepare : masquer fiche + archive ; en mode execute : masquer profil + palanquees
            const hiddenInPrepare = diveMode === 'prepare' && executeOnlySteps.includes(s.id);
            const hiddenInExecute = diveMode === 'execute' && prepareOnlySteps.includes(s.id);
            if (hiddenInPrepare || hiddenInExecute) return null;

            const isDone    = i < currentStepIdx;
            const isActive  = i === currentStepIdx;
            const isLocked  = plongeeFigee
              ? i < ARCHIVE_IDX
              : (divePlongeesEnCours && i < FICHE_IDX)
                || (diveMode === 'execute' && prepareOnlySteps.includes(s.id));
            const lockTitle = plongeeFigee
              ? "Plongée figée — consultation uniquement"
              : "Verrouillé";
            return (
              <div key={s.id}
                className={`step ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`}
                title={isLocked ? lockTitle : undefined}
                aria-current={isActive ? "step" : undefined}>
                <span className="num">{isLocked ? "🔒" : isDone ? "✓" : (i + 1)}</span>
                <span className="grp">
                  <span className="label-sub">{s.sub}</span>
                  <span>{s.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isAdminScreen && (
        <div className="stepper" style={{ paddingTop:8, paddingBottom:8 }}>
          {[
            { id:"archives",     label:"Historique" },
            { id:"admin-divers", label:"Annuaire plongeurs" },
            { id:"admin-sites",  label:"Sites de plongée" },
            ...(isSuperAdmin(user) ? [{ id:"admin-users", label:"Utilisateurs" }] : []),
            { id:"account",      label:"Mon compte" },
          ].map(item => (
            <button key={item.id}
              className={`step ${screen === item.id ? "active" : ""}`}
              onClick={() => setScreen(item.id)}>
              <span className="grp"><span>{item.label}</span></span>
            </button>
          ))}
        </div>
      )}

      <div className={`main ${useSide ? "with-side" : ""}`}>
        <div>
          {screen === "home" && (
            <ScreenHome
              onNew={startPreparation}
              onLoadDive={loadDive}
              onStartExecution={startExecution}
              onDeleteDive={deleteDive}
              onClone={cloneDive}
              onCloneH3={clonePreparedH3}
            />
          )}
          {screen === "profil" && (
            <ScreenProfil
              answers={answers} setAnswer={setAnswer} derived={derived}
              divers={divers} setDivers={setDivers}
              sites={sites} setSites={setSites}
            />
          )}
          {screen === "palanquees" && (
            <ScreenPalanquees
              divers={divers} setDivers={setDivers}
              palanquees={palanquees} setPalanquees={setPalanquees}
              answers={answers} setAnswer={setAnswer}
            />
          )}
          {screen === "checklist" && (
            <ScreenChecklist
              answers={answers} setAnswer={setAnswer}
              checked={checked} setChecked={updateChecked}
              comments={comments} setComment={updateComment}
              mode={diveMode}
            />
          )}
          {screen === "fiche" && (
            <ScreenFiche answers={answers} palanquees={palanquees} divers={divers} setAnswer={setAnswer}
              pressions={pressions} setPressions={setPressions}
              realises={realises} setRealises={setRealises}
              heuresDebut={heuresDebut} setHeuresDebut={setHeuresDebut}
              heuresFin={heuresFin} setHeuresFin={setHeuresFin} />
          )}
          {screen === "archive" && (
            <ScreenArchive answers={answers} palanquees={palanquees} divers={divers} user={user}
              pressions={pressions} realises={realises}
              heuresDebut={heuresDebut} heuresFin={heuresFin}
              checked={checked} comments={comments}
              plongeeFigee={plongeeFigee} onStartNew={startPreparation}
              onArchiveDone={() => setArchiveDone(true)}
              diveId={currentDiveId} />
          )}
          {screen === "archives"     && <ScreenArchives />}
          {screen === "admin-divers" && (
            <ScreenAdminDivers divers={divers} setDivers={setDivers} diversLoaded={diversLoaded} />
          )}
          {screen === "admin-sites"  && (
            <ScreenAdminSites sites={sites} setSites={setSites} sitesLoaded={sitesLoaded} />
          )}
          {screen === "admin-users"  && isSuperAdmin(user) && <ScreenAdminUsers />}
          {screen === "account"      && <ScreenAccount />}
        </div>

        {useSide && sideSummary}
      </div>

      {isStepScreen && (
        <div className="footnav">
          <button className="btn" onClick={goPrev}
            disabled={
              plongeeFigee
              || (divePlongeesEnCours && currentStepIdx <= FICHE_IDX)
              || (diveMode === 'execute' && screen === 'checklist')
            }>
            ← Précédent
          </button>
          <div className="progress">
            <div className="lbl">
              <span>Étape {currentStepIdx + 1} / {STEPS.length} — {STEPS[currentStepIdx]?.label}</span>
              <span>{doneCount} / {total} actions</span>
            </div>
            <div className="bar">
              <div style={{ width:`${total > 0 ? (doneCount / total * 100) : 0}%` }}></div>
            </div>
          </div>
          {(() => {
            const isLast       = currentStepIdx === STEPS.length - 1;
            const ficheBlocked = screen === "fiche" && !allPalanqueesFinished;
            const isPrepareEnd = screen === "checklist" && diveMode === 'prepare';
            const disabled     = (isLast && !archiveDone) || ficheBlocked;
            const title        = ficheBlocked
              ? "Terminez toutes les plongées (bouton ■ Fin sur la fiche) avant de continuer."
              : undefined;
            const label        = isPrepareEnd
              ? "Sauvegarder →"
              : isLast ? "Terminé" : "Suivant →";
            return (
              <button className="btn primary"
                onClick={isLast && archiveDone ? startPreparation : goNext}
                disabled={disabled}
                title={title}>
                {label}
              </button>
            );
          })()}
        </div>
      )}

      {diveMode === 'execute' && (!online || outboxItems.length > 0) && (
        <button
          onClick={() => setDrawerOpen(true)}
          title={online ? `${outboxItems.length} action(s) en cours de synchronisation` : `Hors ligne — ${outboxItems.length} action(s) en attente`}
          style={{
            position:'fixed', left:'50%', transform:'translateX(-50%)', bottom:84, zIndex:850,
            background: online ? 'var(--marine, #0a4a6e)' : 'var(--coral, #e07856)',
            color:'white', border:0, borderRadius:20, padding:'7px 14px',
            fontSize:12, fontWeight:700, cursor:'pointer',
            boxShadow:'0 4px 16px rgba(0,0,0,0.25)', display:'inline-flex', alignItems:'center', gap:6,
          }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'white', opacity:0.9 }} />
          {online ? `SYNCHRONISATION · ${outboxItems.length}` : `HORS LIGNE · ${outboxItems.length} en attente`}
        </button>
      )}

      {diveMode === 'execute' && (
        <button
          className="urgence-fab"
          onClick={() => setUrgenceOpen(true)}
          title="Conduite à tenir / déclenchement des secours"
          style={{
            position:'fixed', right:18, bottom:84, zIndex:900,
            background:'#c0392b', color:'white', border:0, borderRadius:28,
            padding:'12px 18px', fontWeight:700, fontSize:14, cursor:'pointer',
            boxShadow:'0 6px 24px rgba(192,57,43,0.45)',
          }}>
          ☎ URGENCE
        </button>
      )}

      {urgenceOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUrgenceOpen(false)}>
          <div className="modal" style={{ maxWidth:460 }}>
            <div className="modal-head" style={{ background:'#c0392b', color:'white' }}>
              <h3 style={{ color:'white' }}>☎ Déclenchement des secours</h3>
              <button className="x" style={{ color:'white' }} onClick={() => setUrgenceOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gap:12, fontSize:14 }}>
              <div style={{ fontSize:22, fontWeight:800 }}>
                {answers.urgence_num || user?.urgence_defaut || '18'}
              </div>
              <div className="muted" style={{ fontSize:12 }}>
                112 (Europe) · 196 (secours en mer · CROSS) · 15 (SAMU FR) · 144 (CH)
              </div>
              <ol style={{ margin:0, paddingLeft:18, lineHeight:1.6 }}>
                <li>Sortir la victime de l'eau, l'allonger.</li>
                <li>Oxygène normobare 15 L/min (BAVU si inconscient).</li>
                <li>Alerter les secours — donner position et bilan.</li>
                <li>Surveiller / réanimer ; noter heures et paramètres.</li>
              </ol>
              <div style={{ borderTop:'1px solid var(--line, #ddd)', paddingTop:10, display:'grid', gap:4 }}>
                <div>• Lieu / RDV secours : <b>{answers.site_acces_secours || answers.site_nom || '—'}</b></div>
                <div>• Coordonnées GPS : <b>{(answers.site_coords?.lat != null)
                  ? `${Number(answers.site_coords.lat).toFixed(5)}, ${Number(answers.site_coords.lng).toFixed(5)}`
                  : '—'}</b></div>
                <div>• Caisson / hôpital : <b>{answers.site_caisson || '—'}</b></div>
              </div>
            </div>
            <div className="modal-foot">
              <a className="btn primary" href={`tel:${answers.urgence_num || user?.urgence_defaut || '18'}`}
                style={{ textDecoration:'none' }}>Appeler</a>
              <button className="btn" onClick={() => setUrgenceOpen(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && (
        <SyncDrawer
          items={outboxItems}
          online={online}
          onClose={() => setDrawerOpen(false)}
          onForceSync={() => window.sync?.trigger('user-force')}
        />
      )}

      {showSplash && (
        <SplashScreen user={user} onClose={() => setShowSplash(false)} />
      )}

      {/* Modale ±4 h avant démarrage */}
      {confirmStart && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:28, maxWidth:420, width:'100%',
                        boxShadow:'0 8px 40px rgba(0,0,0,0.3)', display:'grid', gap:18 }}>
            <h2 style={{ margin:0, fontSize:18, color:'var(--sun, #e2a23a)' }}>
              ⚠ Écart horaire — confirmer ?
            </h2>
            <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
              Cette plongée était planifiée pour le <b>{formatDateTime(
                confirmStart.dive.planned_at || confirmStart.dive.date_plongee
              )}</b>.
              Il y a actuellement <b>{confirmStart.diffH.toFixed(1)} h</b> d'écart avec maintenant.
            </p>
            <p style={{ margin:0, color:'var(--ink-3)', fontSize:13 }}>
              Confirmez-vous que c'est bien <em>cette</em> plongée que vous souhaitez démarrer ?
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn" onClick={() => setConfirmStart(null)}>Annuler</button>
              <button className="btn primary" onClick={confirmStartExecution}>Démarrer quand même</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de confirmation / blocage avant archivage */}
      {confirmModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:28, maxWidth:440, width:'100%',
                        boxShadow:'0 8px 40px rgba(0,0,0,0.3)', display:'grid', gap:18 }}>
            {confirmModal === "pal_blocking" ? (
              <>
                <h2 style={{ margin:0, fontSize:18, color:'var(--coral)' }}>
                  ⚠ Infractions au Code du Sport
                </h2>
                <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
                  {blockingPalSummary.length === 1
                    ? 'Une palanquée présente '
                    : `${blockingPalSummary.length} palanquées présentent `}
                  des erreurs bloquantes. Passer outre engage votre responsabilité personnelle.
                </p>
                <div style={{
                  maxHeight:200, overflowY:'auto',
                  background:'var(--paper-2)', border:'1px solid var(--line)',
                  borderRadius:6, padding:'10px 12px', fontSize:13, lineHeight:1.45,
                }}>
                  {blockingPalSummary.map(s => (
                    <div key={s.id} style={{ marginBottom:8 }}>
                      <b style={{ color:'var(--ink)' }}>{s.nom}</b>
                      <ul style={{ margin:'4px 0 0 18px', padding:0, color:'var(--ink-2)' }}>
                        {s.errs.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap' }}>
                  <button className="btn" onClick={overridePalBlocking} style={{ color:'var(--coral)' }}>
                    Continuer sous ma responsabilité
                  </button>
                  <button className="btn primary" autoFocus onClick={() => setConfirmModal(false)}>
                    Rester et éditer
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ margin:0, fontSize:18 }}>Confirmer et figer la plongée</h2>
                <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
                  Vous êtes sur le point de <b>figer définitivement</b> toutes les informations de cette plongée.
                </p>
                <p style={{ margin:0, color:'var(--ink-3)', fontSize:13, lineHeight:1.5 }}>
                  Confirmez-vous que toutes les informations (palanquées, heures, pressions, observations) sont complètes et correctes ?
                </p>
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button className="btn" onClick={() => setConfirmModal(false)}>Annuler</button>
                  <button className="btn primary" onClick={confirmArchive}>Confirmer et archiver →</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
