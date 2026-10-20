// DP Assistant — Accueil après connexion : rappel des trois familles d'aptitudes.

import React from 'react';
import { Dialog } from '../components/dialog.jsx';

const CARDS = [
  {
    badge: 'PA',
    title: 'Plongeur autonome',
    text: 'Aptitudes PA : plongée en exploration, sans guide ni encadrant. Le plongeur évolue en autonomie au sein de la palanquée.',
  },
  {
    badge: 'PE',
    title: 'Plongeur encadré',
    text: "Aptitudes PE : plongée en formation ou plongée guidée, où un guide de palanquée prend en charge l'encadrement.",
  },
  {
    badge: 'GP',
    title: 'Guide de palanquée',
    text: "Un encadrant qui guide une palanquée en exploration est renseigné avec l'aptitude GP, et non avec ses aptitudes d'enseignement.",
  },
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
          <section key={c.badge} className="splash-card" aria-labelledby={`splash-${c.badge}`}>
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
    </Dialog>
  );
}

export { SplashScreen };
