// Modales de confirmation du shell : déconnexion avec outbox non vide,
// démarrage hors fenêtre ±4 h, infractions bloquantes, archivage.

import React from 'react';
import { formatDateTime } from '../../components/components.jsx';

export function ConfirmLogoutModal({ count, onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" style={{ maxWidth:460 }}>
        <div className="modal-head">
          <h3 id="logout-title">Actions non synchronisées</h3>
          <button className="x" aria-label="Fermer" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p>
            {count} action(s) n'ont pas encore été envoyées au serveur.
            Se déconnecter maintenant les effacera de cet appareil.
          </p>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button className="btn" onClick={onCancel}>Rester connecté</button>
            <button className="btn danger" onClick={onConfirm}>
              Effacer et se déconnecter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fond + carte centrée communs aux modales « plein écran » ci-dessous.
function CenteredDialog({ maxWidth, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', borderRadius:12, padding:28, maxWidth, width:'100%',
                    boxShadow:'0 8px 40px rgba(0,0,0,0.3)', display:'grid', gap:18 }}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmStartModal({ confirmStart, onCancel, onConfirm }) {
  return (
    <CenteredDialog maxWidth={420}>
      <h2 style={{ margin:0, fontSize:18, color:'var(--sun, #e2a23a)' }}>
        ⚠ Écart horaire — confirmer ?
      </h2>
      <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
        Cette plongée était planifiée pour le <b>{formatDateTime(
          confirmStart.dive.planned_at || confirmStart.dive.date_plongee
        )}</b>.
        Il y a actuellement <b>{confirmStart.diffH.toFixed(1)} h</b> d'écart avec maintenant.
      </p>
      <p style={{ margin:0, color:'var(--ink-3)', fontSize:13 }}>
        Confirmez-vous que c'est bien <em>cette</em> plongée que vous souhaitez démarrer ?
      </p>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn primary" onClick={onConfirm}>Démarrer quand même</button>
      </div>
    </CenteredDialog>
  );
}

function PalBlockingContent({ blockingPalSummary, onOverride, onClose }) {
  return (
    <>
      <h2 style={{ margin:0, fontSize:18, color:'var(--coral)' }}>
        ⚠ Infractions au Code du Sport
      </h2>
      <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
        {blockingPalSummary.length === 1
          ? 'Une palanquée présente '
          : `${blockingPalSummary.length} palanquées présentent `}
        des erreurs bloquantes. Passer outre engage votre responsabilité personnelle.
      </p>
      <div style={{
        maxHeight:200, overflowY:'auto',
        background:'var(--paper-2)', border:'1px solid var(--line)',
        borderRadius:6, padding:'10px 12px', fontSize:13, lineHeight:1.45,
      }}>
        {blockingPalSummary.map(s => (
          <div key={s.id} style={{ marginBottom:8 }}>
            <b style={{ color:'var(--ink)' }}>{s.nom}</b>
            <ul style={{ margin:'4px 0 0 18px', padding:0, color:'var(--ink-2)' }}>
              {s.errs.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap' }}>
        <button className="btn" onClick={onOverride} style={{ color:'var(--coral)' }}>
          Continuer sous ma responsabilité
        </button>
        <button className="btn primary" autoFocus onClick={onClose}>
          Rester et éditer
        </button>
      </div>
    </>
  );
}

function ConfirmArchiveContent({ onClose, onConfirm }) {
  return (
    <>
      <h2 style={{ margin:0, fontSize:18 }}>Confirmer et figer la plongée</h2>
      <p style={{ margin:0, color:'var(--ink-2)', lineHeight:1.6 }}>
        Vous êtes sur le point de <b>figer définitivement</b> toutes les informations de cette plongée.
      </p>
      <p style={{ margin:0, color:'var(--ink-3)', fontSize:13, lineHeight:1.5 }}>
        Confirmez-vous que toutes les informations (palanquées, heures, pressions, observations) sont complètes et correctes ?
      </p>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={onConfirm}>Confirmer et archiver →</button>
      </div>
    </>
  );
}

// kind : "pal_blocking" (infractions bloquantes) ou "confirm" (figer avant archivage).
export function StepConfirmModal({ kind, blockingPalSummary, onOverride, onClose, onConfirm }) {
  return (
    <CenteredDialog maxWidth={440}>
      {kind === "pal_blocking"
        ? <PalBlockingContent blockingPalSummary={blockingPalSummary} onOverride={onOverride} onClose={onClose} />
        : <ConfirmArchiveContent onClose={onClose} onConfirm={onConfirm} />}
    </CenteredDialog>
  );
}
