// DP Assistant — Toast notifications (remplace alert())
//
// Usage :
//   const { showToast } = useToasts();
//   showToast({ tone:'err', title:'Erreur PDF', body: err.message });
//
// Le tone gère la couleur de bordure (err / warn / ok / info).
// Les toasts s'auto-ferment après `ttl` ms (défaut 6000). Cliquer × ferme.

const ToastContext = React.createContext(null);

function ToastProvider({ children }) {
  const [stack, setStack] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setStack(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(({ tone = 'info', title, body, ttl = 6000 }) => {
    const id = ++idRef.current;
    setStack(prev => [...prev, { id, tone, title, body }]);
    if (ttl > 0) {
      window.setTimeout(() => dismiss(id), ttl);
    }
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      {stack.length > 0 && (
        <div className="toast-stack" role="region" aria-live="polite" aria-label="Notifications">
          {stack.map(t => (
            <div key={t.id} className={`toast ${t.tone}`} role={t.tone === 'err' ? 'alert' : 'status'}>
              <button className="toast-close" aria-label="Fermer" onClick={() => dismiss(t.id)}>×</button>
              {t.title && <div className="toast-title">{t.title}</div>}
              {t.body  && <div className="toast-body">{t.body}</div>}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function useToasts() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Mode dégradé : si on est hors provider (test, splash), on tombe sur alert()
    // pour ne jamais perdre une erreur.
    return {
      showToast: ({ title, body }) => window.alert(`${title || ''}\n${body || ''}`.trim()),
      dismiss:   () => {},
    };
  }
  return ctx;
}

Object.assign(window, { ToastProvider, useToasts, ToastContext });
