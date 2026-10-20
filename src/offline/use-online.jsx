// DP Assistant — Hook useOnline : état de connectivité synthétisé par ./net.js
//
// net.js publie l'état via netStatus() et l'événement 'dp:netchange'.

import { useState, useEffect } from 'react';
import { netStatus } from './net.js';

function readOnline() {
  return netStatus().online;
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
