// DP Assistant — Écran de connexion Google

function ScreenLogin() {
  const { handleGoogleCredential } = useAuth();
  const btnRef = React.useRef(null);

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

        <p className="login-legal">
          Vos données sont hébergées sur votre serveur dédié, en Europe.
          Aucune donnée n'est transmise à des tiers.
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenLogin });
