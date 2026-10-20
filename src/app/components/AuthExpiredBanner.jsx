// Bandeau « session expirée » : propose une reconnexion sans effacer l'outbox.

import React from 'react';

export function AuthExpiredBanner({ onReconnect }) {
  return (
    <div style={{
      background: '#c0392b', color: 'white', padding: '10px 16px',
      fontSize: 13, textAlign: 'center', fontWeight: 500,
    }}>
      ⚠ Votre session a expiré côté serveur. Reconnectez-vous pour synchroniser les actions en attente.
      <button onClick={onReconnect} style={{
        marginLeft: 12, background: 'white', color: '#c0392b',
        border: 0, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
        fontWeight: 600, fontSize: 12,
      }}>Reconnexion</button>
    </div>
  );
}
