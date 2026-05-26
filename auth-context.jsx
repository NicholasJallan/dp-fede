// DP Assistant — contexte d'authentification Google OAuth

const AuthContext = React.createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = chargement, null = non connecté
  const [loading, setLoading] = useState(true);

  // Récupère l'utilisateur courant au démarrage
  useEffect(() => {
    api.auth.me()
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
    // Forcer rechargement pour réinitialiser l'état de l'app
    window.location.reload();
  }, []);

  // Callback Google Identity Services
  const handleGoogleCredential = useCallback(async (response) => {
    try {
      const u = await api.auth.google(response.credential);
      setUser(u);
    } catch (err) {
      console.error('Google auth error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, handleGoogleCredential, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return React.useContext(AuthContext);
}

Object.assign(window, { AuthProvider, useAuth, AuthContext });
