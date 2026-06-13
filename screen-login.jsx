// DP Assistant — Écran de connexion Google

import React, { useEffect, useRef } from 'react';
import { useAuth } from './auth-context.jsx';

function ScreenLogin() {
  const { handleGoogleCredential } = useAuth();
  const btnRef = useRef(null);
  const online = window.useOnline ? window.useOnline() : true;

  useEffect(() => {
    if (!window.google?.accounts) return;
    const clientId = window.GOOGLE_CLIENT_ID;
    if (!clientId || clientId === 'GOOGLE_CLIENT_ID_PLACEHOLDER') return;

    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
    });

    google.accounts.id.renderButton(btnRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      locale: 'fr',
      width: 280,
    });
  }, [handleGoogleCredential]);

  return (
    <div className="login-shell">
      <div className="login-card">
        <img src="logo-ffessm.png" alt="FFESSM" className="login-ffessm-logo" />

        <div className="login-logo">
          <span className="dot"></span>
          <span>DP/ASSISTANT</span>
        </div>

        <h1 className="login-title">Connexion</h1>
        <p className="login-sub">
          Outil d'aide au Directeur de Plongée — FFESSM / Code du Sport
        </p>

        <div className="login-btn-wrap" ref={btnRef}></div>

        {!online && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(224,120,86,0.08)',
            border: '1px solid rgba(224,120,86,0.35)',
            borderRadius: 8, fontSize: 13, color: 'var(--ink-2)',
            textAlign: 'left', lineHeight: 1.5,
          }}>
            <b style={{ color: 'var(--coral, #e07856)' }}>● Hors ligne</b><br />
            La première connexion exige une connexion internet. Si vous vous
            êtes déjà connecté récemment, rechargez la page une fois en ligne.
          </div>
        )}

        <p className="login-legal">
          Vos données sont hébergées sur nos serveurs, en Europe.
          Aucune donnée n'est transmise à des tiers.
        </p>
      </div>
    </div>
  );
}

export { ScreenLogin };
