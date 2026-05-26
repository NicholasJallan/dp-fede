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
  { id: "profil", num: "01", label: "Profil de plongée", sub: "Questionnaire" },
  { id: "palanquees", num: "02", label: "Plongeurs & palanquées", sub: "Composition" },
  { id: "checklist", num: "03", label: "Check-list opérationnelle", sub: "Phases 1→5" },
  { id: "fiche", num: "04", label: "Fiche de sécurité", sub: "Art. A322-72" }
];

function App() {
  const [screen, setScreen] = useState("home"); // home | profil | palanquees | checklist | fiche
  const [answers, setAnswers] = useState({});
  const [divers, setDivers] = useState(window.SEED_DIVERS);
  const [palanquees, setPalanquees] = useState([]);
  const [checked, setCheckedState] = useState({});
  const [comments, setCommentsState] = useState({});
  const [hasDraft, setHasDraft] = useState(false);

  // Load persisted state once
  useEffect(() => {
    const s = loadState();
    if (s) {
      setHasDraft(true);
      if (s.answers) setAnswers(s.answers);
      if (s.palanquees) setPalanquees(s.palanquees);
      if (s.checked) setCheckedState(s.checked);
      if (s.comments) setCommentsState(s.comments);
      if (s.divers) setDivers(s.divers);
    }
  }, []);

  // Auto-save
  useEffect(() => {
    if (screen === "home") return;
    saveState({ answers, palanquees, checked, comments, divers });
  }, [answers, palanquees, checked, comments, divers, screen]);

  const setAnswer = useCallback((id, v) => {
    setAnswers(prev => ({ ...prev, [id]: v }));
  }, []);
  const setChecked = useCallback((id, v) => {
    setCheckedState(prev => ({ ...prev, [id]: v }));
  }, []);
  const setComment = useCallback((id, v) => {
    setCommentsState(prev => ({ ...prev, [id]: v }));
  }, []);

  // Derived flags / quick alerts surfaced on profile screen
  const derived = useMemo(() => {
    const notes = [];
    const profNum = parseFloat(answers.prof_max);
    if (answers.activite === "Enseignement" && profNum > 40 && answers.dp_qual !== "E4") {
      notes.push({ tone: "warn", text: "Enseignement > 40 m : un E4 est requis comme DP (Annexe III-16a)." });
    }
    if (answers.recycleur && profNum > 6) {
      notes.push({ tone: "info", text: "Recycleur > 6 m : un secours circuit-ouvert est obligatoire pour chaque plongeur (Art. A322-94)." });
    }
    if (answers.depart === "En bateau" && !answers.vhf) {
      notes.push({ tone: "warn", text: "Sortie en bateau sans VHF déclarée — moyen de communication avec les secours à confirmer." });
    }
    if (answers.milieu === "Piscine ≤ 6 m") {
      notes.push({ tone: "info", text: "En piscine ≤ 6 m : la fiche de sécurité n'est pas obligatoire (Art. A322-98), elle reste recommandée." });
    }
    return { notes };
  }, [answers]);

  // Stepper navigation
  const currentStepIdx = STEPS.findIndex(s => s.id === screen);
  const goPrev = () => {
    if (screen === "home") return;
    if (currentStepIdx <= 0) setScreen("home");
    else setScreen(STEPS[currentStepIdx - 1].id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goNext = () => {
    if (screen === "home") setScreen("profil");
    else if (currentStepIdx < STEPS.length - 1) setScreen(STEPS[currentStepIdx + 1].id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startNew = () => {
    // Prefill demo
    setAnswers(window.SEED_PROFILE);
    setPalanquees(window.SEED_PALANQUEES);
    setCheckedState({
      p1_meteo: true, p1_blocs: true, p1_gonflage: true, p1_o2_secours: true,
      p2_appel: true, p2_briefing: true, p2_pavillon: true,
    });
    setCommentsState({
      p1_o2_secours: "Bouteille O₂ — 180 bar — vérif. 24/05",
      p2_appel: "12 plongeurs présents, 3 palanquées",
    });
    setScreen("profil");
    window.scrollTo({ top: 0 });
  };

  const resumeDraft = () => {
    setScreen("profil");
    window.scrollTo({ top: 0 });
  };

  const total = window.CHECKLIST_RULES.reduce((n, p) =>
    n + p.items.filter(it => window.matchCondition(it.when, answers)).length, 0);
  const doneCount = Object.values(checked).filter(Boolean).length;

  // Side summary card
  const sideSummary = (
    <div className="side">
      <div className="card">
        <div className="card-head"><h2>Synthèse</h2></div>
        <div className="card-body">
          <div className="summary-line"><span className="k">Site</span><span className="v">{answers.site || "—"}</span></div>
          <div className="summary-line"><span className="k">Date</span><span className="v">{answers.date ? formatDateTime(answers.date) : "—"}</span></div>
          <div className="summary-line"><span className="k">DP</span><span className="v">{answers.dp_nom || "—"} <small className="muted">({answers.dp_qual || "—"})</small></span></div>
          <div className="summary-line"><span className="k">Activité</span><span className="v">{answers.activite || "—"}</span></div>
          <div className="summary-line"><span className="k">Milieu</span><span className="v">{answers.milieu || "—"}</span></div>
          <div className="summary-line"><span className="k">Départ</span><span className="v">{answers.depart || "—"}</span></div>
          <div className="summary-line"><span className="k">Prof. max</span><span className="v">{answers.prof_max || "—"}</span></div>
          <div className="summary-line"><span className="k">Palanquées</span><span className="v">{palanquees.length}</span></div>
          <div className="summary-line"><span className="k">Plongeurs</span><span className="v">{palanquees.reduce((n, p) => n + p.membres.length, 0)}</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Mélanges & contextes actifs</h2></div>
        <div className="card-body">
          <div className="row tight" style={{ gap: 6 }}>
            {answers.air && <Pill tone="marine">AIR</Pill>}
            {answers.nitrox && <Pill tone="kelp">NITROX</Pill>}
            {answers.trimix && <Pill tone="sun">TRIMIX</Pill>}
            {answers.oxygene_pur && <Pill tone="coral">O₂ PUR</Pill>}
            {answers.recycleur && <Pill tone="coral">RECYCLEUR</Pill>}
            {answers.depart === "En bateau" && <Pill>BATEAU</Pill>}
            {answers.depart === "Du bord" && <Pill>BORD</Pill>}
            {answers.mineurs && <Pill>MINEURS</Pill>}
            {answers.handisub && <Pill>HANDISUB</Pill>}
            {answers.etrangers && <Pill>BREVETS ÉTR.</Pill>}
            {(!answers.air && !answers.nitrox && !answers.trimix && !answers.recycleur && !answers.depart) &&
              <span className="muted">À renseigner →</span>}
          </div>
        </div>
      </div>
    </div>
  );

  // Determine layout
  const useSide = screen !== "home" && screen !== "fiche";

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="wordmark">
          <span className="dot"></span>
          DP/ASSISTANT
        </div>
        <span className="muted" style={{ color: "var(--ink-4)" }}>·</span>
        <span style={{ fontSize: 13 }}>{answers.structure || "—"}</span>
        <span className="meta">
          <span>HORS-LIGNE · <b>OK</b></span>
          <span>AUTO-SAVE · <b>ON</b></span>
          {screen !== "home" && <button className="session-link" onClick={() => setScreen("home")}>← Accueil</button>}
        </span>
      </div>

      {/* Stepper */}
      {screen !== "home" && (
        <div className="stepper">
          {STEPS.map((s, i) => {
            const isDone = i < currentStepIdx;
            const isActive = i === currentStepIdx;
            return (
              <button
                key={s.id}
                className={`step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
                onClick={() => setScreen(s.id)}
              >
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

      <div className={`main ${useSide ? "with-side" : ""}`}>
        <div>
          {screen === "home" && (
            <ScreenHome
              recent={window.SEED_RECENT}
              hasDraft={hasDraft}
              onNew={startNew}
              onResume={resumeDraft}
            />
          )}
          {screen === "profil" && (
            <ScreenProfil
              answers={answers}
              setAnswer={setAnswer}
              derived={derived}
            />
          )}
          {screen === "palanquees" && (
            <ScreenPalanquees
              divers={divers}
              palanquees={palanquees}
              setPalanquees={setPalanquees}
              answers={answers}
            />
          )}
          {screen === "checklist" && (
            <ScreenChecklist
              answers={answers}
              checked={checked}
              setChecked={setChecked}
              comments={comments}
              setComment={setComment}
            />
          )}
          {screen === "fiche" && (
            <ScreenFiche
              answers={answers}
              palanquees={palanquees}
              divers={divers}
            />
          )}
        </div>

        {useSide && sideSummary}
      </div>

      {/* Fixed footer nav */}
      {screen !== "home" && (
        <div className="footnav">
          <button className="btn" onClick={goPrev}>← Précédent</button>
          <div className="progress">
            <div className="lbl">
              <span>Étape {currentStepIdx + 1} / {STEPS.length} — {STEPS[currentStepIdx]?.label}</span>
              <span>{doneCount} / {total} actions</span>
            </div>
            <div className="bar">
              <div style={{ width: `${total > 0 ? (doneCount / total * 100) : 0}%` }}></div>
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
