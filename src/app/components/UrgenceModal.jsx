// Modale « Déclenchement des secours » (numéros, conduite à tenir, plan de secours).

import React from 'react';
import { getEmergencyInfo } from '../../domain/index.js';

function formatCoords(coords) {
  return (coords?.lat != null)
    ? `${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}`
    : '—';
}

function UrgenceBody({ answers, urgenceNum }) {
  const emi = getEmergencyInfo(answers.site_pays_code, answers.milieu);
  return (<>
    <div style={{ fontSize:22, fontWeight:800 }}>
      {urgenceNum}
    </div>
    <div className="muted" style={{ fontSize:12 }}>
      {emi.secondaryNums}
    </div>
    <ol style={{ margin:0, paddingLeft:18, lineHeight:1.6 }}>
      <li>Sortir la victime de l'eau, l'allonger.</li>
      <li>Oxygène normobare 15 L/min (BAVU si inconscient).</li>
      <li>Alerter les secours — donner position et bilan.</li>
      <li>Surveiller / réanimer ; noter heures et paramètres.</li>
    </ol>
    <div style={{ borderTop:'1px solid var(--line, #ddd)', paddingTop:10, display:'grid', gap:4 }}>
      <div>• Lieu / RDV secours : <b>{answers.site_acces_secours || answers.site_nom || '—'}</b></div>
      <div>• Coordonnées GPS : <b>{formatCoords(answers.site_coords)}</b></div>
      <div>• Caisson / hôpital : <b>{answers.site_caisson || '—'}</b></div>
      {emi.vhf && <div>• VHF : <b>{emi.vhf}</b> (canal de détresse)</div>}
    </div>
  </>);
}

export function UrgenceModal({ answers, user, onClose }) {
  const urgenceNum = answers.urgence_num || user?.urgence_defaut || '18';
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:460 }}>
        <div className="modal-head" style={{ background:'#c0392b', color:'white' }}>
          <h3 style={{ color:'white' }}>☎ Déclenchement des secours</h3>
          <button className="x" style={{ color:'white' }} onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display:'grid', gap:12, fontSize:14 }}>
          <UrgenceBody answers={answers} urgenceNum={urgenceNum} />
        </div>
        <div className="modal-foot">
          <a className="btn primary" href={`tel:${urgenceNum}`}
            style={{ textDecoration:'none' }}>Appeler</a>
          <button className="btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
