// DP Assistant — Écran "Profil de plongée" (questionnaire dynamique)

function ScreenProfil({ answers, setAnswer, derived }) {
  const sections = window.QUESTIONS;
  const [activeId, setActiveId] = useState(sections[0].id);

  // Filter visible sections by `when` (function on answers)
  const visibleSections = sections.filter(s => !s.when || s.when(answers));

  // Scroll-spy: highlight section in subnav
  useEffect(() => {
    const onScroll = () => {
      let current = visibleSections[0]?.id;
      for (const s of visibleSections) {
        const el = document.getElementById("sect-" + s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < 140) current = s.id;
      }
      setActiveId(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visibleSections.length]);

  const scrollTo = (id) => {
    const el = document.getElementById("sect-" + id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 110;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 1 / 4 · Profilage de la plongée</div>
        <h1>Caractériser la plongée à venir</h1>
        <p>Les réponses pilotent l'apparition de questions complémentaires, la check-list générée et la composition des palanquées. Vous pouvez sauvegarder ces réponses comme <em>profil-type</em> pour un usage récurrent.</p>
      </div>

      <div className="subnav">
        {visibleSections.map(s => (
          <a key={s.id} href={`#sect-${s.id}`}
            className={activeId === s.id ? "active" : ""}
            onClick={(e) => { e.preventDefault(); scrollTo(s.id); }}>
            {s.id} · {s.title}
          </a>
        ))}
        <span className="spacer"></span>
        <a href="#" onClick={(e) => e.preventDefault()}>
          ⤓ Profil-type
        </a>
      </div>

      {visibleSections.map(s => (
        <div className="card" key={s.id} id={`sect-${s.id}`}>
          <div className="card-head">
            <span className="ix">SECTION {s.id}</span>
            <h2>{s.title}</h2>
          </div>
          <div className="card-body dense">
            {s.questions.map(q => {
              if (!window.matchCondition(q.when, answers)) return null;
              return (
                <Question
                  key={q.id}
                  q={q}
                  value={answers[q.id]}
                  onChange={(id, v) => setAnswer(id, v)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Live derived rules surfaced as info */}
      {derived.notes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {derived.notes.map((n, i) => <Alert key={i} tone={n.tone}>{n.text}</Alert>)}
        </div>
      )}

      <div className="disclaimer">
        Outil d'aide à la décision. Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée.
      </div>
    </div>
  );
}

Object.assign(window, { ScreenProfil });
