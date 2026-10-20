// DP Assistant — Tiroir de synchronisation : actions en attente d'envoi (outbox).
//
// États d'un item : en attente (réseau, backoff), en cours, « à revoir »
// (refus métier du serveur, status 'review') — ce dernier affiche l'erreur
// et un bouton Réessayer (outbox.retryNow()).

import React, { useState, useEffect } from 'react';
import { Dialog } from './dialog.jsx';
import { StatusIcon, Icon } from './icons.jsx';

const KIND_LABELS = {
  'dive.create':  'Plongée créée',
  'dive.update':  'Plongée modifiée',
  'dive.delete':  'Plongée supprimée',
  'dive.drive':   'Dépôt Google Drive (ancien format)',
  'diver.create': 'Plongeur créé',
  'diver.update': 'Plongeur modifié',
  'diver.delete': 'Plongeur supprimé',
  'site.create':  'Site créé',
  'site.update':  'Site modifié',
  'site.delete':  'Site supprimé',
};

function formatAge(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h`;
}

function describePayload(item) {
  const p = item.payload || {};
  switch (item.kind) {
    case 'dive.create':
    case 'dive.update':
    case 'dive.delete':
    case 'dive.drive':     return p.site_nom || p.patch?.site_nom || p.payload?.site_nom || 'Plongée';
    case 'diver.create':
    case 'diver.update':   return `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Plongeur';
    case 'diver.delete':   return 'Plongeur';
    case 'site.create':
    case 'site.update':    return p.nom || 'Site';
    case 'site.delete':    return 'Site';
    default:               return item.kind;
  }
}

function summaryOf(items, online) {
  const review = items.filter(it => it.status === 'review').length;
  if (review > 0) return { tone: 'warn', title: `${review} action${review > 1 ? 's' : ''} à revoir`,
    text: 'Le serveur a refusé ces modifications. Lisez le motif, corrigez si besoin, puis réessayez.' };
  if (!online) return { tone: 'warn', title: 'Hors ligne',
    text: 'Vos actions sont conservées sur cet appareil et partiront automatiquement au retour du réseau. La fiche PDF et le dépôt Google Drive seront produits à ce moment.' };
  if (items.length > 0) return { tone: 'info', title: 'Envoi en cours',
    text: 'Les actions ci-dessous partent vers le serveur en arrière-plan.' };
  return { tone: 'ok', title: 'Tout est synchronisé', text: 'Toutes vos modifications sont enregistrées sur le serveur.' };
}

function SyncItem({ it, now, online }) {
  const isReview = it.status === 'review';
  const eta = (it.nextRetryAt || 0) - now;
  return (
    <li className={`sync-item ${isReview ? 'is-review' : ''}`}>
      <div className="sync-item-head">
        <b>
          <StatusIcon tone={isReview ? 'err' : it.attempts > 0 ? 'warn' : 'info'} />
          {KIND_LABELS[it.kind] || it.kind}
        </b>
        <span className="num">il y a {formatAge(now - it.createdAt)}</span>
      </div>
      <div>{describePayload(it)}</div>
      {isReview && (
        <div className="sync-item-error"><b>Refusé par le serveur :</b> {it.lastError || 'motif non précisé'}</div>
      )}
      {!isReview && it.attempts > 0 && (
        <div className="sync-item-error">
          Échec {it.attempts} fois : {it.lastError || 'erreur inconnue'}.{' '}
          {eta > 0 && (online ? `Nouvel essai dans ${formatAge(eta)}.` : 'Nouvel essai au retour du réseau.')}
        </div>
      )}
    </li>
  );
}

function SyncDrawer({ items, online, onClose, onForceSync, onRetryReview }) {
  // Rafraîchit les âges et comptes à rebours chaque seconde.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const summary = summaryOf(items, online);
  const hasReview = items.some(it => it.status === 'review');

  return (
    <Dialog title="Synchronisation" onClose={onClose} variant="drawer"
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
        {hasReview
          ? <button type="button" className="btn primary" onClick={onRetryReview} disabled={!online}>
              <Icon.Refresh /> Réessayer
            </button>
          : <button type="button" className="btn primary" onClick={onForceSync}
              disabled={!online || items.length === 0}>
              <Icon.Refresh /> Synchroniser maintenant
            </button>}
      </>}>
      <div className="sync-state" role="status">
        <StatusIcon tone={summary.tone} />
        <div>
          <b>{summary.title}</b>
          <p>{summary.text}</p>
        </div>
      </div>
      {!online && items.length > 0 && <p className="muted small">Les boutons d'envoi s'activent au retour du réseau.</p>}
      {items.length > 0 && (
        <ul className="sync-list" aria-label="Actions en attente">
          {items.map(it => <SyncItem key={it.id} it={it} now={now} online={online} />)}
        </ul>
      )}
    </Dialog>
  );
}

export { KIND_LABELS, formatAge, describePayload, SyncDrawer };
