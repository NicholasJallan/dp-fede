// DP Assistant — Session expirée côté serveur (événement dp:authExpired).
//
// Seul un 401 reçu PENDANT la session de l'utilisateur connecté compte : la
// synchro démarre au boot, avant la connexion, et ses 401 sur l'écran de
// connexion ne doivent pas afficher le bandeau une fois connecté. Le signal
// est rattaché à l'utilisateur : une nouvelle connexion repart de zéro.

import { useState, useEffect } from 'react';

export function useAuthExpired(userId) {
  const [expiredFor, setExpiredFor] = useState(null);
  useEffect(() => {
    if (!userId) return;
    const onExpire = () => setExpiredFor(userId);
    window.addEventListener('dp:authExpired', onExpire);
    return () => window.removeEventListener('dp:authExpired', onExpire);
  }, [userId]);
  return userId != null && expiredFor === userId;
}
