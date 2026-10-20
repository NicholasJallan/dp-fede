// DP Assistant — Alertes plongeurs : bandeau de l'accueil et liste détaillée
// de l'annuaire. ■ rouge = expiré / manquant (bloquant en palanquée),
// ▲ ambre = échéance proche ou date non renseignée.

import React, { useState } from 'react';
import { Notice } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import {
  alertLabel,
  alertTone,
  alertsSentence,
  describeAlert,
  groupAlertsByDiver,
  summarizeAlerts,
} from '../../club/alerts.js';

/** Bandeau « N alertes » de l'accueil (rien s'il n'y en a pas). */
export function AlertsBanner({ data, onOpen }) {
  const s = summarizeAlerts(data);
  if (!s.total) return null;
  return (
    <Notice
      tone={s.tone}
      className="alerts-banner"
      title={`${s.total} alerte${s.total > 1 ? 's' : ''} sur l'annuaire, ${s.divers} plongeur${s.divers > 1 ? 's' : ''}`}
      actions={
        <button type="button" className="btn" onClick={onOpen}>
          Voir les alertes
          <Icon.ChevronRight />
        </button>
      }
    >
      <p>
        {alertsSentence(s)}
        {data?.days ? `. Échéances à ${data.days} jours.` : '.'}
      </p>
    </Notice>
  );
}

function AlertGroup({ g, onEdit }) {
  return (
    <div className="alert-group">
      <StatusIcon tone={g.tone} label={g.tone === 'err' ? 'Bloquant' : 'Alerte'} />
      <div>
        <b>{[g.prenom, (g.nom || '').toUpperCase()].filter(Boolean).join(' ')}</b>
        <ul>
          {g.items.map((it, i) => (
            <li key={`${it.type}-${i}`} className={alertTone(it) === 'err' ? 'text-err' : 'text-warn'}>
              <StatusIcon tone={alertTone(it)} />
              <b>{alertLabel(it.type)}</b>
              <span className="when">{describeAlert(it)}</span>
            </li>
          ))}
        </ul>
      </div>
      {onEdit && (
        <button
          type="button"
          className="btn"
          onClick={onEdit}
          aria-label={`Mettre à jour la fiche de ${[g.prenom, g.nom].filter(Boolean).join(' ')}`}
        >
          <Icon.Edit />
          Mettre à jour
        </button>
      )}
    </div>
  );
}

const COLLAPSED = 5;

/** Liste détaillée (annuaire), regroupée par plongeur. */
export function AlertsPanel({ data, canEdit, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const s = summarizeAlerts(data);
  if (!data) return null;
  const groups = groupAlertsByDiver(data.items || []);
  const shown = expanded ? groups : groups.slice(0, COLLAPSED);
  return (
    <section className="card mb-3" id="annuaire-alertes" aria-labelledby="alerts-title">
      <div className="card-head">
        <h2 id="alerts-title">{s.total ? <StatusIcon tone={s.tone} /> : <StatusIcon tone="ok" />} Alertes</h2>
        <span className="hint">{s.total ? alertsSentence(s) : `Aucune échéance à ${data.days || 30} jours`}</span>
      </div>
      {groups.length > 0 && (
        <div className="card-body flush">
          {shown.map((g) => (
            <AlertGroup key={g.diver_id} g={g} onEdit={canEdit ? () => onEdit(g.diver_id) : null} />
          ))}
        </div>
      )}
      {groups.length > COLLAPSED && (
        <div className="card-body dense">
          <button
            type="button"
            className="btn ghost mt-3 mb-3"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Réduire la liste' : `Voir les ${groups.length} plongeurs concernés`}
          </button>
        </div>
      )}
    </section>
  );
}
