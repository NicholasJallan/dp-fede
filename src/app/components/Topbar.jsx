// Barre supérieure : retour accueil, état réseau / outbox, menu utilisateur.

import React from 'react';

function syncTitle(online, count) {
  if (!online) return `Hors ligne — ${count} action(s) en attente`;
  return count === 0 ? 'Connecté — tout est synchronisé' : `${count} action(s) en cours`;
}

function SyncStatusButton({ online, count, onOpen }) {
  return (
    <button onClick={onOpen} className="session-link"
      title={syncTitle(online, count)}
      style={{ display:'inline-flex', alignItems:'center', gap:6,
        background:'transparent', border:0, padding:0, cursor:'pointer', color:'inherit', font:'inherit' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: online ? 'var(--kelp, #2d8653)' : 'var(--coral, #e07856)',
        boxShadow: online ? 'none' : '0 0 0 3px rgba(224,120,86,0.18)',
        flexShrink: 0,
      }} />
      <b>{online ? 'EN LIGNE' : 'HORS LIGNE'}</b>
      {count > 0 && (
        <span style={{
          background: online ? 'var(--marine, #0a4a6e)' : 'var(--coral, #e07856)',
          color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700,
          padding: '1px 7px', minWidth: 18, textAlign: 'center',
        }}>{count}</span>
      )}
    </button>
  );
}

export function Topbar({ user, online, outboxCount, showHomeLink, onHome, onOpenDrawer, onNavigate, onLogout }) {
  const displayName = user.prenom || user.nom || user.email?.split('@')[0] || 'Moi';
  return (
    <div className="topbar">
      <button
        className="wordmark"
        onClick={onHome}
        title="Retour à l'accueil"
        style={{ background:'transparent', border:0, color:'inherit', cursor:'pointer', padding:0 }}>
        <span className="dot"></span>
        DP/ASSISTANT
      </button>
      {showHomeLink && (
        <button className="session-link"
          onClick={onHome}
          style={{ marginLeft: 4 }}>
          ← Accueil
        </button>
      )}
      <span className="muted topbar-sep" style={{ color:"var(--ink-4)" }}>·</span>
      <span className="topbar-user-label" style={{ fontSize:13 }}>{user.club_nom || user.email}</span>
      <span className="meta">
        <SyncStatusButton online={online} count={outboxCount} onOpen={onOpenDrawer} />
        <span className="topbar-autosave">AUTO-SAVE · <b>ON</b></span>
        <button className="session-link" onClick={() => onNavigate("account")} title="Mon compte">
          {displayName}
        </button>
        <button className="session-link" onClick={() => onNavigate("archives")}>Historique</button>
        {user.role === 'admin' && (
          <button className="session-link topbar-admin-btn" onClick={() => onNavigate("admin-divers")} title="Administration">
            Admin
          </button>
        )}
        <button className="session-link topbar-logout-btn" onClick={onLogout}>
          Déconnexion
        </button>
      </span>
    </div>
  );
}
