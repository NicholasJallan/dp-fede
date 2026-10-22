// DP Assistant — Accueil après connexion : rappel des trois familles d'aptitudes.

import React from 'react';
import { Dialog } from '../components/dialog.jsx';

const CARDS = [
  {
    badge: 'PA',
    kind: 'pa',
    title: 'Plongeur autonome',
    text: 'Aptitudes PA : plongée en exploration, sans guide ni encadrant. Le plongeur évolue en autonomie au sein de la palanquée.',
  },
  {
    badge: 'PE',
    kind: 'pe',
    title: 'Plongeur encadré',
    text: "Aptitudes PE : plongée en formation ou plongée guidée, où un guide de palanquée prend en charge l'encadrement.",
  },
  {
    badge: 'GP',
    // Le GP encadre une palanquée PE guidée : même teinte.
    kind: 'pe',
    title: 'Guide de palanquée',
    text: "Un encadrant qui guide une palanquée en exploration est renseigné avec l'aptitude GP, et non avec ses aptitudes d'enseignement.",
  },
];

// Couleur de fond des palanquées à l'écran Palanquées (mêmes jetons).
const LEGEND = [
  { kind: 'pa', label: 'PA · Autonomie' },
  { kind: 'pe', label: 'PE · Guidée' },
  { kind: 'form', label: 'Formation, baptême' },
];

function SplashScreen({ user, onClose }) {
  const displayName = user?.prenom || user?.nom || user?.email?.split('@')[0] || '';
  return (
    <Dialog
      title={`Bonjour${displayName ? ` ${displayName}` : ''}`}
      size="lg"
      onClose={onClose}
      className="splash-modal"
      footer={
        <button type="button" className="btn primary lg" onClick={onClose} data-autofocus="">
          Commencer
        </button>
      }
    >
      <p className="splash-intro">Rappel des trois familles d'aptitudes qui guident la composition des palanquées.</p>
      <div className="splash-cards">
        {CARDS.map((c) => (
          <section key={c.badge} className={`splash-card kind-${c.kind}`} aria-labelledby={`splash-${c.badge}`}>
            <span className="splash-card-badge" aria-hidden="true">
              {c.badge}
            </span>
            <h3 className="splash-card-title" id={`splash-${c.badge}`}>
              {c.title}
            </h3>
            <p className="splash-card-text">{c.text}</p>
          </section>
        ))}
      </div>
      <div className="splash-legend">
        <span className="splash-legend-title">Fond des palanquées</span>
        <ul>
          {LEGEND.map((l) => (
            <li key={l.kind} className={`kind-${l.kind}`}>
              <span className="swatch" aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

export { SplashScreen };
