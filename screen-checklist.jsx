// DP Assistant — Écran "Check-list opérationnelle"

function ScreenChecklist({ answers, checked, setChecked, comments, setComment }) {
  const phases = useMemo(() => {
    // Filter rules by conditions
    return window.CHECKLIST_RULES.map(phase => {
      const items = phase.items.filter(it => {
        // Custom keys
        if (it.when && it.when._custom === "pa60_derog") {
          const pa60 = (answers.prof_max === "60 m") && answers.activite === "Exploration" && (!answers.dp_nom);
          return pa60;
        }
        return window.matchCondition(it.when, answers);
      });
      return { ...phase, items };
    });
  }, [answers]);

  const total = phases.reduce((n, p) => n + p.items.length, 0);
  const done = phases.reduce((n, p) => n + p.items.filter(i => checked[i.id]).length, 0);

  const [openComment, setOpenComment] = useState({});

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 3 / 5 · Check-list pré-plongée</div>
        <h1>Avant d'autoriser la mise à l'eau</h1>
        <p>{total} contrôles organisés en 2 phases (préparation + sur site), dont {phases.reduce((n,p) => n + p.items.filter(i => i.when).length, 0)} déclenchés par votre profilage. À la fin : décision finale du DP pour autoriser le départ.</p>
      </div>

      <div className="row" style={{ marginBottom: 18, gap: 8 }}>
        <Pill tone="marine" className="lg">{done} / {total} actions cochées</Pill>
        {answers.nitrox && <Pill tone="kelp" className="lg">NITROX</Pill>}
        {answers.trimix && <Pill tone="sun" className="lg">TRIMIX</Pill>}
        {answers.recycleur && <Pill tone="coral" className="lg">RECYCLEUR</Pill>}
        {answers.depart_bateau && <Pill className="lg">BATEAU</Pill>}
        {answers.mineurs && <Pill className="lg">MINEURS</Pill>}
        {(answers.activite === "Enseignement" || answers.activite === "Mixte") && <Pill className="lg">ENSEIGNEMENT</Pill>}
        <span className="spacer"></span>
        <button className="btn" onClick={() => window.print()}>🖨 Imprimer</button>
        <button className="btn">🔗 Partager</button>
      </div>

      {phases.map(p => {
        const phaseDone = p.items.filter(i => checked[i.id]).length;
        return (
          <div className="cl-phase" key={p.phase}>
            <div className="cl-phase-head">
              <span className="ix">PHASE {p.phase}</span>
              <h3>{p.phaseTitle}</h3>
              <span className="count">{phaseDone} / {p.items.length}</span>
            </div>

            {p.items.length === 0 && (
              <div className="empty">Aucun item conditionnel pour cette phase.</div>
            )}

            {p.items.map(it => {
              const isDone = !!checked[it.id];
              return (
                <div className={`cl-item ${isDone ? "done" : ""}`} key={it.id}>
                  <button
                    className="cl-check"
                    onClick={() => setChecked(it.id, !isDone)}
                    aria-label={isDone ? "Décocher" : "Cocher"}
                  />
                  <div className="cl-body">
                    <div className="title">{it.text}</div>
                    <div className="meta">
                      {it.ref && <CdsLink refText={it.ref} compact />}
                      {(it.tags || []).map(t => <Pill key={t}>{t}</Pill>)}
                      <span className="spacer"></span>
                      <button
                        className="btn ghost"
                        style={{ padding: "2px 8px", minHeight: 28, fontSize: 12 }}
                        onClick={() => setOpenComment(c => ({ ...c, [it.id]: !c[it.id] }))}
                      >
                        {comments[it.id] ? "Modifier" : "+ Commentaire"}
                      </button>
                    </div>
                    {(openComment[it.id] || comments[it.id]) && (
                      <textarea
                        className="textarea"
                        placeholder="Note / valeur / signataire…"
                        value={comments[it.id] || ""}
                        onChange={(e) => setComment(it.id, e.target.value)}
                        style={{ minHeight: 50, fontSize: 13 }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="disclaimer">
        Cette check-list est générée à partir de vos réponses et des références Code du Sport / MFT FFESSM rappelées. Elle ne dispense pas le DP de la lecture des textes en vigueur.
      </div>
    </div>
  );
}

Object.assign(window, { ScreenChecklist });
