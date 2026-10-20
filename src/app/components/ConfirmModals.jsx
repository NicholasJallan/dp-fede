// Confirmations du shell : déconnexion avec actions en attente, démarrage
// hors fenêtre ±4 h, infractions bloquantes, figer avant archivage.

import React from 'react';
import { ConfirmDialog, Dialog } from '../../components/dialog.jsx';
import { formatDateTime } from '../../components/format.js';
import { StatusIcon } from '../../components/icons.jsx';

export function ConfirmLogoutModal({ count, onCancel, onConfirm }) {
  return (
    <ConfirmDialog title="Actions non envoyées" icon="warn" tone="warn" danger
      confirmLabel="Effacer et se déconnecter" cancelLabel="Rester connecté"
      onCancel={onCancel} onConfirm={onConfirm}>
      <p>
        <b className="num">{count}</b> action{count > 1 ? 's' : ''} n'{count > 1 ? 'ont' : 'a'} pas encore été
        envoyée{count > 1 ? 's' : ''} au serveur. Se déconnecter maintenant les efface de cet appareil.
      </p>
    </ConfirmDialog>
  );
}

export function ConfirmStartModal({ confirmStart, onCancel, onConfirm }) {
  const planned = confirmStart.dive.planned_at || confirmStart.dive.date_plongee;
  return (
    <ConfirmDialog title="Écart horaire important" icon="warn" tone="warn"
      confirmLabel="Démarrer cette plongée" onCancel={onCancel} onConfirm={onConfirm}>
      <p>
        Cette plongée est prévue le <b>{formatDateTime(planned)}</b>, soit{' '}
        <b className="num">{confirmStart.diffH.toFixed(1)} h</b> d'écart avec l'heure actuelle.
      </p>
      <p>Vérifiez qu'il s'agit bien de la plongée à démarrer.</p>
    </ConfirmDialog>
  );
}

// Infractions bloquantes au moment de quitter l'écran palanquées.
function PalBlockingDialog({ blockingPalSummary, onOverride, onClose }) {
  const n = blockingPalSummary.length;
  return (
    <Dialog title="Palanquées non conformes" icon="err" tone="err" onClose={onClose}
      footer={<>
        <button type="button" className="btn danger" onClick={onOverride}>Continuer sous ma responsabilité</button>
        <button type="button" className="btn primary" onClick={onClose} data-autofocus="">Corriger les palanquées</button>
      </>}>
      <p>
        {n === 1 ? 'Une palanquée enfreint' : `${n} palanquées enfreignent`} le Code du sport.
        Passer outre engage la responsabilité personnelle du directeur de plongée.
      </p>
      {blockingPalSummary.map(s => (
        <section key={s.id}>
          <h3 className="mb-3">{s.nom}</h3>
          <ul className="issue-list">
            {s.errs.map((e, i) => (
              <li key={i} className="issue err">
                <StatusIcon tone="err" />
                <span className="issue-text">{e.text}</span>
                {e.ref && <span className="issue-ref">Code du sport : {e.ref}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  );
}

// kind : "pal_blocking" (infractions bloquantes) ou "confirm" (figer avant archivage).
export function StepConfirmModal({ kind, blockingPalSummary, onOverride, onClose, onConfirm }) {
  if (kind === 'pal_blocking') {
    return <PalBlockingDialog blockingPalSummary={blockingPalSummary} onOverride={onOverride} onClose={onClose} />;
  }
  return (
    <ConfirmDialog title="Figer et archiver la plongée" confirmLabel="Figer et archiver"
      onCancel={onClose} onConfirm={onConfirm}>
      <p>Une fois figée, la plongée n'est plus modifiable : palanquées, heures, pressions et observations.</p>
      <p>Vérifiez que tout est complet et exact avant de continuer.</p>
    </ConfirmDialog>
  );
}
