// DP Assistant — Écran d'accueil

function ScreenHome({ onNew, onResume, hasDraft }) {
  return (
    <div>
      <div className="home-hero">
        <span className="corner">v1.0</span>
        <div className="eyebrow">Outil d'aide à la décision · Code du Sport · FFESSM</div>
        <h1>Préparer la plongée du jour.</h1>
        <p>Profilage, check-list conditionnelle, palanquées validées et fiche de sécurité conforme Art. A322-72 — sur un même outil.</p>
        <div className="actions">
          <button className="btn primary lg" onClick={onNew}>+ Nouvelle plongée</button>
          {hasDraft && <button className="btn lg" onClick={onResume}>Reprendre le brouillon</button>}
        </div>
      </div>

      <div className="disclaimer" style={{ marginTop: 28 }}>
        Outil d'aide à la décision. Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée, ni à la lecture du Code du Sport (Art. A322-71 à A322-101) et des textes fédéraux FFESSM en vigueur.
      </div>
    </div>
  );
}

Object.assign(window, { ScreenHome });
