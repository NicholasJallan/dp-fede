// DP Assistant — Annuaire plongeurs + sites de l'utilisateur.
// Chargement initial avec repli sur le pré-cache localStorage (hors-ligne),
// puis rafraîchissement explicite à l'ouverture d'une plongée.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/api.js';
import { STORAGE_KEYS } from '../../api/storage-keys.js';

function readCachedList(key, label) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const { list } = JSON.parse(raw); if (Array.isArray(list)) return list; }
  } catch (err) { console.warn(`[DP] cache ${label} illisible :`, err.message); }
  return null;
}

// Charge une liste une seule fois par utilisateur ; en cas d'échec réseau,
// utilise le pré-cache localStorage s'il existe.
function useCachedList(user, fetchList, cacheKey, label) {
  const [list,   setList]   = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!user || loaded) return;
    fetchList()
      .then(l => { setList(l); setLoaded(true); })
      .catch(() => {
        const cached = readCachedList(cacheKey, label);
        if (cached) setList(cached);
        setLoaded(true);
      });
  }, [user, loaded, fetchList, cacheKey, label]);
  return [list, setList, loaded];
}

const listDivers = () => api.divers.list();
const listSites  = () => api.sites.list();

export function useDirectory(user) {
  const [divers, setDivers, diversLoaded] = useCachedList(
    user, listDivers, STORAGE_KEYS?.CACHE_DIVERS || 'dp-cache-divers', 'annuaire');
  const [sites, setSites, sitesLoaded] = useCachedList(
    user, listSites, STORAGE_KEYS?.CACHE_SITES || 'dp-cache-sites', 'sites');

  const refreshDiversAndSites = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.divers.list(), api.sites.list()]);
      setDivers(d);
      setSites(s);
    } catch (err) {
      // Rafraîchissement d'arrière-plan : l'annuaire déjà affiché reste valable.
      console.warn('[DP] rafraîchissement annuaire/sites :', err.message);
    }
  }, [setDivers, setSites]);

  return { divers, setDivers, diversLoaded, sites, setSites, sitesLoaded, refreshDiversAndSites };
}
