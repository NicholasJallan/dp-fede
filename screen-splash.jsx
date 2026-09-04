// DP Assistant — Splash de bienvenue (affiché une fois par session)

import React from 'react';

function SplashScreen({ user, onClose }) {
  const displayName = user?.prenom || user?.nom || user?.email?.split('@')[0] || '';

  return (
    <div className="modal-overlay splash-overlay" onClick={onClose}>
      <div className="modal splash-modal" onClick={e => e.stopPropagation()}>

        <div className="splash-head">
          <img src="logo-ffessm.png" alt="FFESSM" className="splash-ffessm-logo" />
          <div className="splash-title">
            <div className="splash-eyebrow">DP / ASSISTANT</div>
            <h2 className="splash-welcome">
              Bonjour{displayName ? `, ${displayName}` : ''} !
            </h2>
            <p className="splash-intro">
              Voici un rappel rapide des trois types d'aptitudes qui guident la
              composition de vos palanquées.
            </p>
          </div>
        </div>

        <div className="splash-cards">

          <div className="splash-card splash-card--kelp">
            <div className="splash-card-badge">PA</div>
            <div className="splash-card-body">
              <div className="splash-card-title">Plongeur Autonome</div>
              <p className="splash-card-text">
                Les aptitudes <strong>PA</strong> s'appliquent aux plongées
                en <strong>exploration</strong> — sans guide ni encadrant.
                Le plongeur évolue de façon autonome dans le groupe.
              </p>
            </div>
          </div>

          <div className="splash-card splash-card--sun">
            <div className="splash-card-badge">PE</div>
            <div className="splash-card-body">
              <div className="splash-card-title">Plongeur Encadré</div>
              <p className="splash-card-text">
                Les aptitudes <strong>PE</strong> couvrent les plongées
                en <strong>formation</strong> ou les <strong>plongées guidées</strong> où
                un guide de palanquée prend en charge l'encadrement.
              </p>
            </div>
          </div>

          <div className="splash-card splash-card--marine">
            <div className="splash-card-badge">GP</div>
            <div className="splash-card-body">
              <div className="splash-card-title">Guide de Palanquée</div>
              <p className="splash-card-text">
                Un encadrant E3 qui guide une palanquée en
                <strong> exploration</strong> doit être renseigné avec son
                aptitude <strong>GP</strong>, et non avec ses aptitudes
                d'encadrement en formation.
              </p>
            </div>
          </div>

        </div>

        <div className="modal-foot splash-foot">
          <button className="btn primary" onClick={onClose}>
            Commencer
          </button>
        </div>

      </div>
    </div>
  );
}

export { SplashScreen };
