// DP Assistant — Éléments de l'accueil : ligne de plongée, squelette, horloge.

import React, { useState, useEffect } from 'react';
import { StatusIcon } from '../components/icons.jsx';
import { formatDayMonth, formatTime } from '../components/format.js';
import { useDriveExport } from '../api/drive-preference.js';

/** Heure courante rafraîchie toutes les `intervalMs` (horloge, chronomètres). */
export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

function plural(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function SyncTags({ dive, archived }) {
  const [driveEnabled] = useDriveExport();
  const tags = [];
  if (dive._pending) tags.push({ tone: 'warn', text: "En attente d'envoi" });
  // Copie Drive facultative (le serveur archive les PDF) : simple information.
  if (driveEnabled && archived && dive.synced && !dive.drive_synced && !dive.drive_link)
    tags.push({ tone: 'info', text: 'Copie Drive à faire' });
  if (tags.length === 0) return null;
  return (
    <div className="dive-row-tags">
      {tags.map((t) => (
        <span key={t.text} className={`tag text-${t.tone}`}>
          <StatusIcon tone={t.tone} />
          {t.text}
        </span>
      ))}
    </div>
  );
}

export function DiveRow({ dive, actions, live = false, archived = false }) {
  const when = archived ? dive.date_plongee : dive.planned_at || dive.date_plongee;
  const facts = [
    dive.dp_nom ? `DP ${dive.dp_nom}${dive.dp_qual ? ` (${dive.dp_qual})` : ''}` : 'DP non désigné',
    dive.nb_palanquees > 0
      ? `${plural(dive.nb_palanquees, 'palanquée')}, ${plural(dive.nb_plongeurs || 0, 'plongeur')}`
      : null,
    archived && dive.activite ? dive.activite : null,
  ].filter(Boolean);
  return (
    <article className={`dive-row ${live ? 'is-live' : ''}`}>
      <div className="dive-row-when">
        <span className="d">{formatDayMonth(when)}</span>
        <span className="t">{formatTime(when) || '—'}</span>
      </div>
      <div className="dive-row-main">
        <h3>{dive.site_nom || 'Site non renseigné'}</h3>
        <p>{facts.join('. ')}</p>
        <SyncTags dive={dive} archived={archived} />
      </div>
      <div className="dive-row-actions">{actions}</div>
    </article>
  );
}

export function DiveListSkeleton({ rows = 2 }) {
  return (
    <div role="status" aria-label="Chargement des plongées">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton-line w-40" />
          <span className="skeleton skeleton-line w-80" />
        </div>
      ))}
    </div>
  );
}
