// Bandeaux d'état globaux sous la barre haute : session expirée, actions
// refusées par le serveur (« à revoir »).

import React from 'react';
import { StatusIcon } from '../../components/icons.jsx';

export function AuthExpiredBanner({ onReconnect }) {
  return (
    <div className="banner signal" role="alert">
      <StatusIcon tone="warn" />
      <div className="banner-text">
        Session expirée
        <small>Vos saisies restent sur cet appareil. Reconnectez-vous pour envoyer les actions en attente.</small>
      </div>
      <button type="button" className="btn" onClick={onReconnect}>Se reconnecter</button>
    </div>
  );
}

export function ReviewBanner({ count, onOpen }) {
  return (
    <div className="banner signal" role="status">
      <StatusIcon tone="warn" />
      <div className="banner-text">
        {count} modification{count > 1 ? 's' : ''} refusée{count > 1 ? 's' : ''} par le serveur
        <small>Elles ne sont pas enregistrées côté serveur tant qu'elles n'ont pas été revues.</small>
      </div>
      <button type="button" className="btn" onClick={onOpen}>Voir le motif</button>
    </div>
  );
}
