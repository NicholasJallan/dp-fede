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

const ADMIN_SCREENS = ["admin-divers", "admin-sites", "admin-users", "account", "archives"];

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
  const [pressions,    setPressions]    = useState({}); // { palId-diverId: '50' }
  const [realises,     setRealises]     = useState({}); // { palId: { profMax, duree, dtr } }
  const [heuresDebut,   setHeuresDebut]   = useState({}); // { palId: 'HH:MM' }
  const [heuresFin,     setHeuresFin]     = useState({}); // { palId: 'HH:MM' }
  const [plongeeFigee,  setPlongeeFigee]  = useState(false); // gel définitif après confirmation
  const [confirmModal,  setConfirmModal]  = useState(false); // popup avant archivage
  const [hasDraft,      setHasDraft]      = useState(false);
  const [archiveDone,   setArchiveDone]   = useState(false);
  const [showSplash,    setShowSplash]    = useState(false);

  // Splash de bienvenue — à chaque connexion
  useEffect(() => {
    if (!user) return;
    setShowSplash(true);
  }, [user?.id]);

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
      if (s.pressions)   setPressions(s.pressions);
      if (s.realises)    setRealises(s.realises);
      if (s.heuresDebut)  setHeuresDebut(s.heuresDebut);
      if (s.heuresFin)    setHeuresFin(s.heuresFin);
      if (s.plongeeFigee) setPlongeeFigee(s.plongeeFigee);
    }
  }, [user]);

  // Auto-save
  useEffect(() => {
    if (!user || screen === "home") return;
    saveState({ answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin, plongeeFigee });
  }, [answers, palanquees, checked, comments, pressions, realises, heuresDebut, heuresFin, plongeeFigee, screen, user]);

  const setAnswer  = useCallback((id, v) => setAnswers(prev => ({ ...prev, [id]: v })), []);
  const setChecked = useCallback((id, v) => setCheckedState(prev => ({ ...prev, [id]: v })), []);
  const setComment = useCallback((id, v) => setCommentsState(prev => ({ ...prev, [id]: v })), []);

  // Rafraîchit l'annuaire plongeurs + sites depuis le backend.
  // Indispensable à chaque démarrage de plongée pour que les évolutions de
  // niveaux/aptitudes survenues entre deux sessions soient prises en compte
  // sans redémarrer l'application.
  const refreshDiversAndSites = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.divers.list(), api.sites.list()]);
      setDivers(d);
      setSites(s);
    } catch {
      // On garde le cache local en cas d'échec réseau.
    }
  }, []);

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
  // Toutes les palanquées qui ont démarré ont aussi une heure de fin
  const allPalanqueesFinished = palanquees.length === 0
    || palanquees.every(p => !heuresDebut[p.id] || heuresFin[p.id]);

  const goPrev = () => {
    if (plongeeFigee) return; // gel définitif
    if (divePlongeesEnCours && currentStepIdx <= FICHE_IDX) return;
    if (currentStepIdx <= 0) setScreen("home");
    else setScreen(STEPS[currentStepIdx - 1].id);
    window.scrollTo({ top:0, behavior:"smooth" });
  };
  // Calcul des palanquées avec des erreurs bloquantes (utilisé pour confirmer
  // le passage à la check-list en cas d'infractions résiduelles)
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
    if (screen === "home") { setScreen("profil"); return; }
    // Palanquées → Check-list : alerter si infractions bloquantes résiduelles
    if (screen === "palanquees" && blockingPalSummary.length > 0) {
      setConfirmModal("pal_blocking");
      return;
    }
    // Fiche → Archive : vérifications + gel
    if (screen === "fiche") {
      if (!allPalanqueesFinished) {
        setConfirmModal("blocked"); // affiche alerte "palanquée encore sous l'eau"
        return;
      }
      setConfirmModal("confirm"); // demande confirmation gel
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

  const startNew = () => {
    const lastRappel = localStorage.getItem('dp-rappel-moyen') || '';
    setAnswers(lastRappel ? { moyen_rappel: lastRappel } : {});
    setPalanquees([]);
    setCheckedState({});
    setCommentsState({});
    setPressions({});
    setRealises({});
    setHeuresDebut({});
    setHeuresFin({});
    setPlongeeFigee(false);
    setConfirmModal(false);
    localStorage.removeItem(STORAGE_KEY);
    setHasDraft(false);
    refreshDiversAndSites();
    setScreen("profil");
    window.scrollTo({ top:0 });
  };
  const resumeDraft = () => {
    refreshDiversAndSites();
    setScreen("profil");
    window.scrollTo({ top:0 });
  };

  const cloneDive = async (archiveId) => {
    try {
      const data = await api.archives.get(archiveId);
      const oldAnswers = typeof data.answers === 'string' ? JSON.parse(data.answers) : (data.answers || {});
      const oldPals    = typeof data.palanquees === 'string' ? JSON.parse(data.palanquees) : (data.palanquees || []);

      // Calcul prochaine heure pleine
      const t = new Date();
      t.setMinutes(0, 0, 0);
      t.setHours(t.getHours() + 1);
      const pad = n => String(n).padStart(2, '0');
      const newDate = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:00`;

      setAnswers({ ...oldAnswers, date: newDate, meteo: '', fiche_observations: '', maree_heure: '', maree_coef: '' });
      setPalanquees(oldPals);
      setCheckedState({});
      setCommentsState({});
      setPressions({});
      setRealises({});
      setHeuresDebut({});
      setHeuresFin({});
      setPlongeeFigee(false);
      setConfirmModal(false);
      localStorage.removeItem(STORAGE_KEY);
      setHasDraft(true);
      refreshDiversAndSites();
      setScreen("profil");
      window.scrollTo({ top:0 });
    } catch (err) {
      alert('Impossible de charger l\'archive : ' + err.message);
    }
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
          {(isStepScreen || isAdminScreen) && !divePlongeesEnCours &&
            <button className="session-link" onClick={() => setScreen("home")}>← Accueil</button>}
          <button className="session-link" onClick={() => setScreen("account")} title="Mon compte">
            {displayName}
          </button>
          <button className="session-link" onClick={() => setScreen("archives")}>Historique</button>
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
          {/* Indicateur visuel uniquement — la navigation se fait par les
              boutons Précédent / Suivant en bas de page, qui appliquent les
              contrôles métier (validatePal, confirmation, gel). */}
          {STEPS.map((s, i) => {
            const isDone    = i < currentStepIdx;
            const isActive  = i === currentStepIdx;
            const isLocked  = plongeeFigee
              ? i < ARCHIVE_IDX
              : (divePlongeesEnCours && i < FICHE_IDX);
            const lockTitle = plongeeFigee
              ? "Plongée figée — consultation uniquement"
              : "Verrouillé — plongée en cours";
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
            ...(user.email === 'nicholas.jallan@gmail.com' ? [{ id:"admin-users", label:"Utilisateurs" }] : []),
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
            <ScreenHome hasDraft={hasDraft} onNew={startNew} onResume={resumeDraft}
              plongeeFigee={plongeeFigee} onClone={cloneDive} />
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
              checked={checked} setChecked={setChecked}
              comments={comments} setComment={setComment}
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
              checked={checked} comments={comments}
              plongeeFigee={plongeeFigee} onStartNew={startNew}
              onArchiveDone={() => setArchiveDone(true)} />
          )}
          {screen === "archives" && <ScreenArchives />}
          {screen === "admin-divers" && (
            <ScreenAdminDivers divers={divers} setDivers={setDivers} diversLoaded={diversLoaded} />
          )}
          {screen === "admin-sites"  && (
            <ScreenAdminSites sites={sites} setSites={setSites} sitesLoaded={sitesLoaded} />
          )}
          {screen === "admin-users"  && user.email === 'nicholas.jallan@gmail.com' && <ScreenAdminUsers />}
          {screen === "account"      && <ScreenAccount />}
        </div>

        {useSide && sideSummary}
      </div>

      {isStepScreen && (
        <div className="footnav">
          <button className="btn" onClick={goPrev}
            disabled={plongeeFigee || (divePlongeesEnCours && currentStepIdx <= FICHE_IDX)}
            title={plongeeFigee ? "Plongée figée" : (divePlongeesEnCours && currentStepIdx <= FICHE_IDX) ? "Verrouillé — plongée en cours" : undefined}>
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
          <button className="btn primary"
            onClick={currentStepIdx === STEPS.length - 1 && archiveDone ? startNew : goNext}
            disabled={currentStepIdx === STEPS.length - 1 && !archiveDone}>
            {currentStepIdx === STEPS.length - 1 ? "Terminé" : "Suivant →"}
          </button>
        </div>
      )}

      {/* Modale de confirmation / blocage avant archivage */}
      {showSplash && (
        <SplashScreen user={user} onClose={() => setShowSplash(false)} />
      )}

      {confirmModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:28, maxWidth:440, width:'100%',
                        boxShadow:'0 8px 40px rgba(0,0,0,0.3)', display:'grid', gap:18 }}>
            {confirmModal === "blocked" ? (
              <>
                <h2 style={{ margin:0, fontSize:18 }}>Plongée encore en cours</h2>
                <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
                  Une ou plusieurs palanquées n'ont pas encore de fin de plongée enregistrée.
                  Terminez toutes les plongées (bouton <b>■ Fin</b> sur la fiche) avant de procéder à l'archivage.
                </p>
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <button className="btn primary" onClick={() => setConfirmModal(false)}>Compris</button>
                </div>
              </>
            ) : confirmModal === "pal_blocking" ? (
              <>
                <h2 style={{ margin:0, fontSize:18, color:'var(--coral)' }}>
                  ⚠ Infractions au Code du Sport
                </h2>
                <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
                  {blockingPalSummary.length === 1
                    ? 'Une palanquée présente '
                    : `${blockingPalSummary.length} palanquées présentent `}
                  des erreurs bloquantes. Passer outre signifie que vous engagez votre
                  responsabilité personnelle de Directeur de Plongée et que vous
                  enfreignez probablement le Code du Sport.
                </p>
                <div style={{
                  maxHeight:200, overflowY:'auto',
                  background:'var(--paper-2)',
                  border:'1px solid var(--line)',
                  borderRadius:6,
                  padding:'10px 12px',
                  fontSize:13, lineHeight:1.45,
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
                  <button className="btn" onClick={overridePalBlocking}
                    style={{ color:'var(--coral)' }}>
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
                  Après confirmation, aucune modification ne sera possible sur les étapes précédentes.
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
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
