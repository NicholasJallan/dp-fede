// DP Assistant — Notifications (remplacent alert()).
//
// Usage :
//   const { showToast } = useToasts();
//   showToast({ tone:'err', title:'Erreur PDF', body: err.message });
//
// tone : err / warn / ok / info (forme + couleur). Fermeture automatique
// après `ttl` ms (6 s par défaut, 0 = reste affiché).
// La zone live est montée en permanence : les lecteurs d'écran annoncent
// chaque nouvelle notification (polie ; assertive pour les erreurs).

import React, { useState, useRef, useCallback, useMemo, createContext, useContext } from 'react';
import { StatusIcon } from './icons.jsx';

const ToastContext = createContext(null);

function ToastItem({ t, onDismiss }) {
  return (
    <div className={`toast ${t.tone}`} role={t.tone === 'err' ? 'alert' : undefined}>
      <StatusIcon tone={t.tone} />
      <div>
        {t.title && <div className="toast-title">{t.title}</div>}
        {t.body && <div className="toast-body">{t.body}</div>}
      </div>
      <button type="button" className="x toast-close" aria-label="Fermer la notification" onClick={() => onDismiss(t.id)}>×</button>
    </div>
  );
}

function ToastProvider({ children }) {
  const [stack, setStack] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setStack(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(({ tone = 'info', title, body, ttl = 6000 }) => {
    const id = ++idRef.current;
    setStack(prev => [...prev, { id, tone, title, body }]);
    if (ttl > 0) window.setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
        {stack.map(t => <ToastItem key={t.id} t={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

// Hors fournisseur (ne devrait pas arriver) : journalisation, jamais d'alert() natif.
const NO_PROVIDER = {
  showToast: ({ title, body }) => console.warn('[DP] notification hors ToastProvider :', title, body),
  dismiss: () => {},
};

function useToasts() {
  return useContext(ToastContext) || NO_PROVIDER;
}

export { ToastProvider, useToasts, ToastContext };
