// Boutons flottants du mode exécution : pastille de synchronisation et ☎ URGENCE.

import React from 'react';

export function SyncFloatingPill({ online, count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      title={online ? `${count} action(s) en cours de synchronisation` : `Hors ligne — ${count} action(s) en attente`}
      style={{
        position:'fixed', left:'50%', transform:'translateX(-50%)', bottom:84, zIndex:850,
        background: online ? 'var(--marine, #0a4a6e)' : 'var(--coral, #e07856)',
        color:'white', border:0, borderRadius:20, padding:'7px 14px',
        fontSize:12, fontWeight:700, cursor:'pointer',
        boxShadow:'0 4px 16px rgba(0,0,0,0.25)', display:'inline-flex', alignItems:'center', gap:6,
      }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:'white', opacity:0.9 }} />
      {online ? `SYNCHRONISATION · ${count}` : `HORS LIGNE · ${count} en attente`}
    </button>
  );
}

export function UrgenceButton({ onOpen }) {
  return (
    <button
      className="urgence-fab"
      onClick={onOpen}
      title="Conduite à tenir / déclenchement des secours"
      style={{
        position:'fixed', right:18, bottom:84, zIndex:900,
        background:'#c0392b', color:'white', border:0, borderRadius:28,
        padding:'12px 18px', fontWeight:700, fontSize:14, cursor:'pointer',
        boxShadow:'0 6px 24px rgba(192,57,43,0.45)',
      }}>
      ☎ URGENCE
    </button>
  );
}
