// DP Assistant — Écran d'accueil

function ScreenHome({ onNew, onResume, recent, hasDraft }) {
  return (
    <div>
      <div className="home-hero">
        <span className="corner">v0.9 — démo</span>
        <div className="eyebrow">Outil d'aide à la décision · Code du Sport · FFESSM</div>
        <h1>Préparer la plongée du jour.</h1>
        <p>Profilage, check-list conditionnelle, palanquées validées et fiche de sécurité conforme Art. A322-72 — sur un même outil. Hors-ligne, sur le bateau ou la plage.</p>
        <div className="actions">
          <button className="btn primary lg" onClick={onNew}>+ Nouvelle plongée</button>
          {hasDraft && <button className="btn lg" onClick={onResume}>Reprendre le brouillon</button>}
          <button className="btn lg">Importer un profil-type</button>
        </div>
      </div>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Plongées récentes — archive locale</div>
        <a href="#" className="muted" style={{ fontSize: 12 }}>Voir tout l'historique →</a>
      </div>

      <div className="recent-grid">
        {recent.map(r => (
          <div className="recent-card" key={r.id}>
            <div className="when">{r.date}</div>
            <h4>{r.titre}</h4>
            <div className="muted" style={{ fontSize: 13 }}>
              {r.pal} palanquée{r.pal > 1 ? "s" : ""} · prof. max {r.prof}
            </div>
            <div className="meta-row">
              {r.tags.map(t => <Pill key={t}>{t}</Pill>)}
            </div>
          </div>
        ))}
      </div>

      <div className="disclaimer" style={{ marginTop: 28 }}>
        Outil d'aide à la décision. Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée, ni à la lecture du Code du Sport (Art. A322-71 à A322-101) et des textes fédéraux FFESSM en vigueur.
      </div>
    </div>
  );
}

Object.assign(window, { ScreenHome });
