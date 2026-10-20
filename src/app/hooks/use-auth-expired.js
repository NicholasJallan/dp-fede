// DP Assistant — Session expirée côté serveur (événement dp:authExpired).

import { useState, useEffect } from 'react';

export function useAuthExpired() {
  const [authExpired, setAuthExpired] = useState(false);
  useEffect(() => {
    const onExpire = () => setAuthExpired(true);
    window.addEventListener('dp:authExpired', onExpire);
    return () => window.removeEventListener('dp:authExpired', onExpire);
  }, []);
  return authExpired;
}
