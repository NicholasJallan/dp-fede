// DP Assistant — Transition prepared → in_progress au 1er heuresDebut posé.

import { useEffect } from 'react';
import { api } from '../../api/api.js';

export function useDiveLifecycle({ heuresDebut, currentDiveId, startedCountRef }) {
  useEffect(() => {
    const count = Object.keys(heuresDebut).length;
    if (startedCountRef.current === 0 && count > 0 && currentDiveId) {
      api.dives.update(currentDiveId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      }).catch(() => {});
    }
    startedCountRef.current = count;
  }, [heuresDebut, currentDiveId, startedCountRef]);
}
