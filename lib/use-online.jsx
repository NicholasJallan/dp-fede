// DP Assistant — Hook useOnline : état de connectivité synthétisé par lib/net.js
//
// lib/net.js (script global) publie l'état via window.netStatus() et
// l'événement 'dp:netchange'. Ce hook est bundlé avec React pour ne plus
// dépendre d'un window.React global.

import { useState, useEffect } from 'react';

function readOnline() {
  if (typeof window.netStatus === 'function') return window.netStatus().online;
  return navigator.onLine !== false;
}

export function useOnline() {
  const [online, setOnline] = useState(readOnline);
  useEffect(() => {
    const handler = (e) => setOnline(e.detail.online);
    window.addEventListener('dp:netchange', handler);
    // Resynchronise au montage au cas où l'état a changé avant l'abonnement.
    setOnline(readOnline());
    return () => window.removeEventListener('dp:netchange', handler);
  }, []);
  return online;
}
