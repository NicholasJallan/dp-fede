// DP Assistant — Tiroir des actions en attente de synchronisation (outbox).

import React, { useState, useEffect } from 'react';

// =========================================================================
// SyncDrawer — overlay listant les actions en attente d'envoi au serveur
// =========================================================================
const KIND_LABELS = {
  'dive.create':  'Plongée — créer',
  'dive.update':  'Plongée — sauvegarder',
  'dive.delete':  'Plongée — supprimer',
  'dive.drive':   'Plongée — déposer sur Drive',
  'diver.create':   'Plongeur — créer',
  'diver.update':   'Plongeur — modifier',
  'diver.delete':   'Plongeur — supprimer',
  'site.create':    'Site — créer',
  'site.update':    'Site — modifier',
  'site.delete':    'Site — supprimer',
};

function formatAge(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60)     return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)     return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h`;
}

function describePayload(item) {
  const p = item.payload || {};
  switch (item.kind) {
    case 'dive.create':
    case 'dive.update':
    case 'dive.delete':
    case 'dive.drive':     return p.site_nom || (p.payload?.site_nom) || 'Plongée';
    case 'diver.create':
    case 'diver.update':   return `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Plongeur';
    case 'diver.delete':   return 'Plongeur supprimé';
    case 'site.create':
    case 'site.update':    return p.nom || 'Site';
    case 'site.delete':    return 'Site supprimé';
    default:               return item.kind;
  }
}

function SyncDrawer({ items, online, onClose, onForceSync }) {
  // Tick toutes les secondes pour ré-afficher les âges et les compte-à-rebours.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Échap pour fermer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const now = Date.now();

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 1100, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface)', width: 'min(440px, 100%)', height: '100%',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase',
                          letterSpacing: '0.06em', marginBottom: 3 }}>
              Synchronisation
            </div>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {items.length === 0
                ? (online ? 'Tout est à jour' : 'Aucune action en attente')
                : `${items.length} action${items.length > 1 ? 's' : ''} en attente`}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{
            background: 'transparent', border: 0, fontSize: 22, cursor: 'pointer',
            color: 'var(--ink-3)', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--line)',
                      background: online ? 'rgba(45,134,83,0.06)' : 'rgba(224,120,86,0.08)',
                      fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {online ? (
            items.length === 0
              ? <>Votre connexion est active. Toutes vos modifications ont été
                  envoyées au serveur.</>
              : <>Connexion active. Les actions ci-dessous sont envoyées au
                  serveur en arrière-plan.</>
          ) : (
            <>● <b>Hors ligne</b>. Vos actions sont conservées localement et
              seront envoyées <b>automatiquement</b> dès que la connexion revient.
              La fiche PDF et le dépôt Google Drive de chaque plongée seront
              produits à ce moment.</>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {items.length === 0 && (
            <div style={{ padding: '24px 22px', color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
              Aucune action en attente.
            </div>
          )}
          {items.map((it) => {
            const eta = (it.nextRetryAt || 0) - now;
            const failed = it.attempts > 0;
            return (
              <div key={it.id} style={{
                padding: '12px 22px', borderBottom: '1px solid var(--line)',
                display: 'grid', gap: 4,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {KIND_LABELS[it.kind] || it.kind}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--t-mono)' }}>
                    il y a {formatAge(now - it.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {describePayload(it)}
                </div>
                {failed && (
                  <div style={{ fontSize: 11, color: 'var(--coral, #e07856)', lineHeight: 1.4 }}>
                    Échec {it.attempts}× — {it.lastError || 'erreur inconnue'}
                    {eta > 0 && (online
                      ? <> · prochain essai dans {formatAge(eta)}</>
                      : <> · sera retenté à la reconnexion</>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)',
                      display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn primary"
            onClick={onForceSync}
            disabled={!online || items.length === 0}
            title={!online ? 'Hors ligne — impossible de forcer maintenant' :
                   items.length === 0 ? 'Rien à synchroniser' : undefined}>
            ↻ Forcer la synchronisation
          </button>
        </div>
      </div>
    </div>
  );
}

export { KIND_LABELS, formatAge, describePayload, SyncDrawer };
