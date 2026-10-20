// DP Assistant — Connexion Google.

import React, { useEffect, useRef } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { useOnline } from '../offline/use-online.jsx';
import { Notice } from '../components/ui.jsx';
import { BrandMark } from '../components/icons.jsx';

function ScreenLogin() {
  const { handleGoogleCredential } = useAuth();
  const btnRef = useRef(null);
  const online = useOnline();

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    function init() {
      if (cancelled) return;
      // GIS charge en asynchrone : on réessaie toutes les 150 ms.
      if (!window.google?.accounts?.id) {
        timer = setTimeout(init, 150);
        return;
      }
      const clientId = window.GOOGLE_CLIENT_ID;
      if (!clientId || clientId === 'GOOGLE_CLIENT_ID_PLACEHOLDER') return;
      google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential, auto_select: false });
      if (btnRef.current) {
        google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline', size: 'large', text: 'signin_with', locale: 'fr', width: 280,
        });
      }
    }

    init();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [handleGoogleCredential]);

  return (
    <main className="login-shell">
      <div className="login-card">
        <img src="logo-ffessm.png" alt="FFESSM" className="login-logo" width="56" height="56" />
        <div className="login-brand"><BrandMark /><span>DP Assistant</span></div>
        <h1>Connexion</h1>
        <p className="login-sub">Aide au directeur de plongée : palanquées, check-list et fiche de sécurité selon le Code du sport.</p>
        <div className="login-btn-wrap" ref={btnRef}></div>
        {!online && (
          <Notice tone="warn" title="Hors ligne">
            La première connexion demande internet. Si vous vous êtes connecté récemment sur cet appareil,
            rechargez la page une fois en ligne.
          </Notice>
        )}
        <p className="login-legal">Données hébergées en Europe, jamais transmises à des tiers.</p>
      </div>
    </main>
  );
}

export { ScreenLogin };
