// DP Assistant — Liste des actions en attente de synchronisation (outbox),
// rafraîchie sur dp:outboxChanged et dp:syncDone.

import { useState, useEffect, useCallback } from 'react';
import { outbox } from '../../offline/outbox.js';

export function useOutboxItems(user) {
  const [outboxItems, setOutboxItems] = useState([]);
  const refreshOutbox = useCallback(async () => {
    const items = await outbox.pending();
    setOutboxItems(items.sort((a, b) => a.createdAt - b.createdAt));
  }, []);
  useEffect(() => {
    if (!user) return;
    refreshOutbox();
    const onChange = () => refreshOutbox();
    window.addEventListener('dp:outboxChanged', onChange);
    window.addEventListener('dp:syncDone',      onChange);
    return () => {
      window.removeEventListener('dp:outboxChanged', onChange);
      window.removeEventListener('dp:syncDone',      onChange);
    };
  }, [user, refreshOutbox]);
  return outboxItems;
}
