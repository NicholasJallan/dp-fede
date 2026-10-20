// Bandeaux d'état globaux sous la barre haute : session expirée, actions
// refusées par le serveur (« à revoir »), club quitté. Les deux premiers
// laissent des données sur l'appareil : ils proposent de les supprimer.

import React from 'react';
import { StatusIcon } from '../../components/icons.jsx';
import { DeviceDataPurgeButton } from '../../components/device-data-purge.jsx';

export function AuthExpiredBanner({ onReconnect }) {
  return (
    <div className="banner signal" role="alert">
      <StatusIcon tone="warn" />
      <div className="banner-text">
        Session expirée
        <small>Vos saisies restent sur cet appareil. Reconnectez-vous pour envoyer les actions en attente, ou supprimez-les si l'appareil n'est pas le vôtre.</small>
      </div>
      <button type="button" className="btn" onClick={onReconnect}>Se reconnecter</button>
      <DeviceDataPurgeButton />
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

export function ClubLostBanner({ lost, onDismiss }) {
  const club = lost.name ? `du club « ${lost.name} »` : 'd\'un club';
  return (
    <div className="banner signal" role="alert">
      <StatusIcon tone="warn" />
      <div className="banner-text">
        Vous n'êtes plus membre {club}
        <small>
          Ses données ont été retirées de l'affichage
          {lost.removed > 0 ? ` et ${lost.removed} action${lost.removed > 1 ? 's' : ''} non envoyée${lost.removed > 1 ? 's' : ''} supprimée${lost.removed > 1 ? 's' : ''}` : ''}.
          {' '}Sur un appareil partagé, supprimez aussi les autres données locales.
        </small>
      </div>
      <button type="button" className="btn" onClick={onDismiss}>Fermer</button>
      <DeviceDataPurgeButton />
    </div>
  );
}
