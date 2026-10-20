// DP Assistant — Connexion Google.

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { useOnline } from '../offline/use-online.jsx';
import { Notice } from '../components/ui.jsx';
import { BrandMark } from '../components/icons.jsx';
import { readPendingInvitation } from '../club/invitation.js';
import { RetainedFacts } from './club/retained-facts.jsx';
import { DeviceDataPurgeButton } from '../components/device-data-purge.jsx';
import { hasLocalData } from '../auth/local-data.js';

// Message de fin de session (ex. compte supprimé) : texte du serveur et
// fiches de sécurité conservées (art. A322-72), s'il y en a.
function SessionNotice({ notice }) {
  return (
    <Notice tone="ok" title={notice.title} live>
      <p>{notice.message}</p>
      {notice.retained && <RetainedFacts retained={notice.retained} />}
    </Notice>
  );
}

// Données restées sur l'appareil (déconnexion « garder mes saisies », session
// expirée) : proposer de les effacer avant de laisser l'appareil.
function useLeftoverData() {
  const [left, setLeft] = useState(false);
  useEffect(() => {
    let cancelled = false;
    hasLocalData().then(v => { if (!cancelled) setLeft(v); });
    return () => { cancelled = true; };
  }, []);
  return left;
}

function ScreenLogin() {
  const { handleGoogleCredential, loginNotice } = useAuth();
  const invitation = readPendingInvitation();
  const btnRef = useRef(null);
  const online = useOnline();
  const leftover = useLeftoverData();

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
        {loginNotice && <SessionNotice notice={loginNotice} />}
        <h1>Connexion</h1>
        <p className="login-sub">Aide au directeur de plongée : palanquées, check-list et fiche de sécurité selon le Code du sport.</p>
        {invitation && (
          <Notice tone="info" title="Invitation à rejoindre un club">
            Connectez-vous avec le compte Google de l'adresse invitée : l'invitation s'affichera ensuite.
          </Notice>
        )}
        <div className="login-btn-wrap" ref={btnRef}></div>
        {!online && (
          <Notice tone="warn" title="Hors ligne">
            La première connexion demande internet. Si vous vous êtes connecté récemment sur cet appareil,
            rechargez la page une fois en ligne.
          </Notice>
        )}
        {leftover && (
          <Notice tone="info" title="Données présentes sur cet appareil"
            actions={<DeviceDataPurgeButton />}>
            Des saisies d'une session précédente sont conservées ici (elles repartiront après connexion avec le même compte).
            Sur un appareil partagé, supprimez-les.
          </Notice>
        )}
        <p className="login-legal">Données hébergées en Europe, jamais transmises à des tiers.</p>
      </div>
    </main>
  );
}

export { ScreenLogin };
