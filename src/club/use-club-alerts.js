// DP Assistant — Alertes du club (CACI, licences, autorisations parentales),
// pour les rôles autorisés (alerts.read : pas le rôle « lecture »).
// Calculées par le serveur : rien hors ligne, rechargées après une
// synchronisation de l'annuaire ou un changement de club.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/api.js';
import { useClub } from './club-context.jsx';
import { useOnline } from '../offline/use-online.jsx';

export function useClubAlerts() {
  const club = useClub();
  const online = useOnline();
  const allowed = club.can('alerts.read');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api.club.alerts()); setError(null); }
    catch (err) { setError(err); }
  }, []);

  useEffect(() => {
    if (!allowed || !online) return undefined;
    load();
    const onChange = (e) => { if (!e.detail?.store || e.detail.store === 'divers') load(); };
    window.addEventListener('dp:clubChanged', load);
    window.addEventListener('dp:dataChanged', onChange);
    return () => {
      window.removeEventListener('dp:clubChanged', load);
      window.removeEventListener('dp:dataChanged', onChange);
    };
  }, [allowed, online, club.club?.id, load]);

  return { allowed, data: allowed ? data : null, error, reload: load };
}
