// Déclenchement des secours : numéro, conduite à tenir, plan de secours du site.

import React from 'react';
import { Dialog } from '../../components/dialog.jsx';
import { Icon } from '../../components/icons.jsx';
import { getEmergencyInfo } from '../../domain/index.js';

function formatCoords(coords) {
  return coords?.lat != null ? `${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}` : '—';
}

export function UrgenceModal({ answers, user, onClose }) {
  const urgenceNum = answers.urgence_num || user?.urgence_defaut || '18';
  const emi = getEmergencyInfo(answers.site_pays_code, answers.milieu);
  return (
    <Dialog
      title="Déclenchement des secours"
      tone="urgence"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
          <a className="btn urgence lg" href={`tel:${urgenceNum}`} data-autofocus="">
            <Icon.Phone />
            Appeler le {urgenceNum}
          </a>
        </>
      }
    >
      <div className="urgence-number">
        <span className="num">{urgenceNum}</span>
        <span className="muted">{emi.secondaryNums}</span>
      </div>
      <ol className="urgence-steps">
        <li>Sortir la victime de l'eau, l'allonger.</li>
        <li>Oxygène normobare 15 L/min (BAVU si inconsciente).</li>
        <li>Alerter les secours : position et bilan.</li>
        <li>Surveiller, réanimer si besoin ; noter heures et paramètres.</li>
      </ol>
      <dl className="kv-list">
        <div>
          <dt>Lieu, RDV secours</dt>
          <dd>{answers.site_acces_secours || answers.site_nom || '—'}</dd>
        </div>
        <div>
          <dt>Coordonnées GPS</dt>
          <dd className="num">{formatCoords(answers.site_coords)}</dd>
        </div>
        <div>
          <dt>Caisson, hôpital</dt>
          <dd>{answers.site_caisson || '—'}</dd>
        </div>
        {emi.vhf && (
          <div>
            <dt>VHF détresse</dt>
            <dd>{emi.vhf}</dd>
          </div>
        )}
      </dl>
    </Dialog>
  );
}
