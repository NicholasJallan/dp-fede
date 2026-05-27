// DP Assistant — Shell principal & state management

const STORAGE_KEY = "dp-assistant-v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

const STEPS = [
  { id:"profil",     num:"01", label:"Profil de plongée",        sub:"Questionnaire" },
  { id:"palanquees", num:"02", label:"Plongeurs & palanquées",    sub:"Composition" },
  { id:"checklist",  num:"03", label:"Check-list opérationnelle", sub:"Phases 1→5" },
  { id:"fiche",      num:"04", label:"Fiche de sécurité",         sub:"Art. A322-72" },
  { id:"archive",    num:"05", label:"Archiver la plongée",       sub:"Google Drive" },
];

const ADMIN_SCREENS = ["admin-divers", "admin-sites", "admin-users", "account"];

function AppInner() {
  const { user, loading: authLoading, logout } = useAuth();

  const [screen,       setScreen]       = useState("home");
  const [answers,      setAnswers]      = useState({});
  const [divers,       setDivers]       = useState([]);
  const [diversLoaded, setDiversLoaded] = useState(false);
  const [sites,        setSites]        = useState([]);
  const [sitesLoaded,  setSitesLoaded]  = useState(false);
  const [palanquees,   setPalanquees]   = useState([]);
  const [checked,      setCheckedState] = useState({});
  const [comments,     setCommentsState]= useState({});
  const [hasDraft,     setHasDraft]     = useState(false);

  // Load divers once authenticated
  useEffect(() => {
    if (!user || diversLoaded) return;
    api.divers.list()
      .then(list => { setDivers(list); setDiversLoaded(true); })
      .catch(() => setDiversLoaded(true));
  }, [user, diversLoaded]);

  // Load sites once authenticated
  useEffect(() => {
    if (!user || sitesLoaded) return;
    api.sites.list()
      .then(list => { setSites(list); setSitesLoaded(true); })
      .catch(() => setSitesLoaded(true));
  }, [user, sitesLoaded]);

  // Restore persisted session state
  useEffect(() => {
    if (!user) return;
    const s = loadState();
    if (s) {
      setHasDraft(true);
      if (s.answers)    setAnswers(s.answers);
      if (s.palanquees) setPalanquees(s.palanquees);
      if (s.checked)    setCheckedState(s.checked);
      if (s.comments)   setCommentsState(s.comments);
    }
  }, [user]);

  // Auto-save
  useEffect(() => {
    if (!user || screen === "home") return;
    saveState({ answers, palanquees, checked, comments });
  }, [answers, palanquees, checked, comments, screen, user]);

  const setAnswer  = useCallback((id, v) => setAnswers(prev => ({ ...prev, [id]: v })), []);
  const setChecked = useCallback((id, v) => setCheckedState(prev => ({ ...prev, [id]: v })), []);
  const setComment = useCallback((id, v) => setCommentsState(prev => ({ ...prev, [id]: v })), []);

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
    if (answers.milieu === "Piscine ≤ 6 m") {
      notes.push({ tone:"info", text:"En piscine ≤ 6 m : la fiche de sécurité n'est pas obligatoire (Art. A322-98)." });
    }
    return { notes };
  }, [answers]);

  const currentStepIdx = STEPS.findIndex(s => s.id === screen);
  const isStepScreen   = currentStepIdx >= 0;
  const isAdminScreen  = ADMIN_SCREENS.includes(screen);

  const goPrev = () => {
    if (currentStepIdx <= 0) setScreen("home");
    else setScreen(STEPS[currentStepIdx - 1].id);
    window.scrollTo({ top:0, behavior:"smooth" });
  };
  const goNext = () => {
    if (screen === "home") setScreen("profil");
    else if (currentStepIdx < STEPS.length - 1) setScreen(STEPS[currentStepIdx + 1].id);
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const startNew = () => {
    setAnswers({});
    setPalanquees([]);
    setCheckedState({});
    setCommentsState({});
    localStorage.removeItem(STORAGE_KEY);
    setHasDraft(false);
    setScreen("profil");
    window.scrollTo({ top:0 });
  };
  const resumeDraft = () => { setScreen("profil"); window.scrollTo({ top:0 }); };

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
            {answers.oxygene_pur   && <Pill tone="coral">O₂ PUR</Pill>}
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
  const displayName = user.prenom || user.nom || user.email?.split('@')[0] || 'Moi';

  return (
    <div className="app">
      <div className="topbar">
        <div className="wordmark">
          <span className="dot"></span>
          DP/ASSISTANT
        </div>
        <span className="muted" style={{ color:"var(--ink-4)" }}>·</span>
        <span style={{ fontSize:13 }}>{user.club_nom || user.email}</span>
        <span className="meta">
          <span>AUTO-SAVE · <b>ON</b></span>
          {(isStepScreen || isAdminScreen) &&
            <button className="session-link" onClick={() => setScreen("home")}>← Accueil</button>}
          <button className="session-link" onClick={() => setScreen("account")} title="Mon compte">
            {displayName}
          </button>
          {user.role === 'admin' && (
            <button className="session-link" onClick={() => setScreen("admin-divers")} title="Administration">
              Admin
            </button>
          )}
          <button className="session-link" onClick={logout}>Déconnexion</button>
        </span>
      </div>

      {isStepScreen && (
        <div className="stepper">
          {STEPS.map((s, i) => {
            const isDone   = i < currentStepIdx;
            const isActive = i === currentStepIdx;
            return (
              <button key={s.id}
                className={`step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
                onClick={() => setScreen(s.id)}>
                <span className="num">{isDone ? "✓" : (i + 1)}</span>
                <span className="grp">
                  <span className="label-sub">{s.sub}</span>
                  <span>{s.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isAdminScreen && (
        <div className="stepper" style={{ paddingTop:8, paddingBottom:8 }}>
          {[
            { id:"admin-divers", label:"Annuaire plongeurs" },
            { id:"admin-sites",  label:"Sites de plongée" },
            ...(user.role === 'admin' ? [{ id:"admin-users", label:"Utilisateurs" }] : []),
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
            <ScreenHome hasDraft={hasDraft} onNew={startNew} onResume={resumeDraft} />
          )}
          {screen === "profil" && (
            <ScreenProfil
              answers={answers} setAnswer={setAnswer} derived={derived}
              divers={divers} sites={sites} setSites={setSites}
            />
          )}
          {screen === "palanquees" && (
            <ScreenPalanquees
              divers={divers} setDivers={setDivers}
              palanquees={palanquees} setPalanquees={setPalanquees}
              answers={answers}
            />
          )}
          {screen === "checklist" && (
            <ScreenChecklist
              answers={answers} checked={checked} setChecked={setChecked}
              comments={comments} setComment={setComment}
            />
          )}
          {screen === "fiche" && (
            <ScreenFiche answers={answers} palanquees={palanquees} divers={divers} />
          )}
          {screen === "archive" && (
            <ScreenArchive answers={answers} palanquees={palanquees} divers={divers} />
          )}
          {screen === "admin-divers" && <ScreenAdminDivers />}
          {screen === "admin-sites"  && <ScreenAdminSites />}
          {screen === "admin-users"  && user.role === 'admin' && <ScreenAdminUsers />}
          {screen === "account"      && <ScreenAccount />}
        </div>

        {useSide && sideSummary}
      </div>

      {isStepScreen && (
        <div className="footnav">
          <button className="btn" onClick={goPrev}>← Précédent</button>
          <div className="progress">
            <div className="lbl">
              <span>Étape {currentStepIdx + 1} / {STEPS.length} — {STEPS[currentStepIdx]?.label}</span>
              <span>{doneCount} / {total} actions</span>
            </div>
            <div className="bar">
              <div style={{ width:`${total > 0 ? (doneCount / total * 100) : 0}%` }}></div>
            </div>
          </div>
          <button className="btn primary" onClick={goNext}
            disabled={currentStepIdx === STEPS.length - 1}>
            {currentStepIdx === STEPS.length - 1 ? "Terminé" : "Suivant →"}
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
