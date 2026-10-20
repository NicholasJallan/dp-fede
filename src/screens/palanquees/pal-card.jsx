// DP Assistant — Carte d'une palanquée : en-tête, alarme de blocage, mode,
// paramètres prévus, mélanges, membres, règles appliquées.
//
// Une palanquée bloquée (issue tone 'err') est encadrée en rouge détresse,
// avec un résumé en tête et ses plongeurs concernés surlignés. Chaque règle
// affiche son texte et sa référence au Code du sport, sans survol.

import React, { useEffect, useId } from 'react';
import { CdsLink, Pill, diverFullName } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { derivePalMode, getDiverAptitudes, parseCdsRefs } from '../../domain/index.js';

const ENS_ROLES = ['E1', 'E2', 'E3', 'E4'];
const TYPE_LABELS = { exploration: 'Exploration', guidee: 'Guidée', formation: 'Formation', bapteme: 'Baptême' };

function memberName(m, diversById) {
  if (m._bapteme) return `${m.prenom || ''} ${(m.nom || '').toUpperCase()}`.trim();
  const d = diversById[m.diverId];
  return d ? diverFullName(d) : '?';
}

// Référence lisible : article du Code du sport (lien Légifrance) ou annexe.
export function IssueRef({ refText }) {
  if (!refText) return null;
  const arts = parseCdsRefs(refText);
  return (
    <span className="issue-ref">
      Code du sport : {arts.length > 0 ? <CdsLink refText={refText} compact /> : <span>annexe {refText}</span>}
    </span>
  );
}

const ISSUE_TAG = { err: 'Bloquant', warn: 'Alerte', ok: 'Conforme' };

function IssueList({ issues }) {
  return (
    <ul className="issue-list" aria-label="Règles appliquées">
      {issues.map((v, i) => (
        <li key={`${v.code}-${i}`} className={`issue ${v.tone}`} data-code={v.code}>
          <StatusIcon tone={v.tone} />
          <span className="issue-text"><b>{ISSUE_TAG[v.tone]} :</b>{v.text}</span>
          <IssueRef refText={v.ref} />
        </li>
      ))}
    </ul>
  );
}

function PalAlarm({ blocking, flaggedNames }) {
  const n = blocking.length;
  return (
    <div className="pal-alarm" role="alert">
      <div className="pal-alarm-title">
        <StatusIcon tone="err" />Palanquée bloquée : {n} règle{n > 1 ? 's' : ''} non respectée{n > 1 ? 's' : ''}
      </div>
      {flaggedNames.length > 0 && <p>Plongeurs concernés : {flaggedNames.join(', ')}.</p>}
      <p>Détail et références ci-dessous.</p>
    </div>
  );
}

// Mode enseignement / exploration (A322-75) : choisi dès qu'un enseignant
// est présent ; un baptême est toujours de l'enseignement.
function PalModeToggle({ pal, onChange }) {
  const labelId = useId();
  const apts = pal.membres.map(m => m.aptitude);
  if (!apts.some(a => ENS_ROLES.includes(a)) || apts.includes('Baptême')) return null;
  const mode = derivePalMode(pal);
  return (
    <div className="pal-mode">
      <span className="pal-mode-label" id={labelId}>Type de plongée</span>
      <div className="seg" role="radiogroup" aria-labelledby={labelId}>
        {[['enseignement', 'Enseignement'], ['exploration', 'Exploration']].map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => onChange(v)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumParam({ label, unit, value, onChange, placeholder, missing, hint, min, max }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="pal-param">
      <label htmlFor={id}>{label}</label>
      <div className={`unit-input ${missing ? 'is-missing' : ''}`}>
        <input id={id} type="number" inputMode="numeric" min={min} max={max}
          value={value ?? ''} placeholder={placeholder} aria-describedby={hint || missing ? hintId : undefined}
          onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))} />
        <span className="unit" aria-hidden="true">{unit}</span>
      </div>
      {missing
        ? <span className="hint warn" id={hintId}><StatusIcon tone="warn" />À saisir</span>
        : hint && <span className="hint" id={hintId}>{hint}</span>}
    </div>
  );
}

function PalParams({ pal, hardLimit, hasNitrox, onProf, onField }) {
  return (
    <div className="pal-params">
      <NumParam label="Profondeur max" unit="m" value={pal.profMax} min={1}
        hint={Number.isFinite(hardLimit) ? `Plafond ${hardLimit} m` : undefined}
        onChange={v => onProf(v || 0)} />
      <NumParam label="Durée prévue" unit="min" value={pal.duree} min={1}
        onChange={v => onField('duree', v || 0)} />
      <NumParam label="DTR prévue" unit="min" value={pal.dtr} min={0} placeholder="à saisir"
        missing={pal.dtr == null} onChange={v => onField('dtr', v)} />
      {hasNitrox && (
        <NumParam label="O₂ du nitrox" unit="%" value={pal.o2} min={22} max={100} placeholder="à saisir"
          missing={pal.o2 == null} onChange={v => onField('o2', v)} />
      )}
    </div>
  );
}

function ChipToggle({ on, locked, reason, onToggle, children }) {
  return (
    <label className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}>
      <input type="checkbox" checked={on} disabled={locked} onChange={() => !locked && onToggle()} />
      {children}
      {locked && reason && <span className="why">({reason})</span>}
    </label>
  );
}

function PalOptions({ pal, palType, melangesCatalog, siteShotLine, onToggleMelange, onToggleNoDeco, onField }) {
  const melanges = pal.melanges || [];
  const isBapteme = palType === 'bapteme';
  return (
    <div className="pal-options">
      <fieldset>
        <legend>Mélanges</legend>
        <div className="qualif-row">
          {melangesCatalog.map(({ value, allowed, reason }) => (
            <ChipToggle key={value} on={melanges.includes(value)} locked={!allowed} reason={reason}
              onToggle={() => onToggleMelange(value)}>{value}</ChipToggle>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Options</legend>
        <div className="qualif-row">
          <ChipToggle on={!!(pal.no_deco || isBapteme)} locked={isBapteme} onToggle={onToggleNoDeco}>
            Sans palier obligatoire
          </ChipToggle>
          {siteShotLine && (
            <ChipToggle on={!!pal.shot_line} onToggle={() => onField('shot_line', !pal.shot_line)}>Shot-line</ChipToggle>
          )}
        </div>
      </fieldset>
    </div>
  );
}

function AptitudeSelect({ diver, value, palContext, onChange, invalid }) {
  const available = getDiverAptitudes(diver, false, palContext);
  const single = available.length === 1 ? available[0] : null;
  // Une seule aptitude possible : sélection automatique (après rendu).
  useEffect(() => {
    if (single && !value) onChange(single);
  }, [single, value]); // eslint-disable-line react-hooks/exhaustive-deps
  if (available.length === 0) return <span className="muted apt-fixed">Aucune aptitude</span>;
  return (
    <select className={`input role-sel ${invalid ? 'invalid' : ''}`} value={value || ''}
      aria-label={`Aptitude de ${diverFullName(diver)}`} aria-invalid={invalid || undefined}
      onChange={e => onChange(e.target.value)}>
      <option value="">Aptitude…</option>
      {available.map(a => <option key={a} value={a}>{a}</option>)}
      {value && !available.includes(value) && <option value={value}>{value} (non justifiée)</option>}
    </select>
  );
}

function MemberRow({ m, diversById, flagged, palContext, onAptitude, onRemove }) {
  const name = memberName(m, diversById);
  const d = m._bapteme ? null : diversById[m.diverId];
  if (!m._bapteme && !d) return null;
  return (
    <div className={`diver-row ${flagged ? 'flagged' : ''}`}>
      <span className="lvl">{m._bapteme ? 'Bapt.' : (d.niveau_encadrant || d.niveau_plongeur || '?')}</span>
      <div className="name">
        <b>{name}</b>
        <small>{m._bapteme ? 'Baptême, hors annuaire' : [...(d.nitrox || []), ...(d.trimix || [])].join(' ')}</small>
        <span className="flag"><StatusIcon tone="err" />Règle bloquante</span>
      </div>
      {m._bapteme
        ? <span className="apt-fixed"><Pill>Baptême</Pill></span>
        : <AptitudeSelect diver={d} value={m.aptitude} palContext={palContext} invalid={flagged} onChange={onAptitude} />}
      <button type="button" className="x" aria-label={`Retirer ${name} de la palanquée`} onClick={onRemove}>×</button>
    </div>
  );
}

export function PalCard({ pal, index, ctx }) {
  const {
    diversById, issues, palType, palContext, hardLimit, melangesCatalog, siteShotLine, actions,
  } = ctx;
  const blocking = issues.filter(v => v.tone === 'err');
  const flagged = new Set(blocking.flatMap(v => v.ids || []));
  const flaggedNames = pal.membres
    .filter(m => flagged.has(m._bapteme ? m.id : m.diverId))
    .map(m => memberName(m, diversById));
  const melanges = pal.melanges || [];
  const hasNitrox = melanges.includes('Nx ≤ 40%') || melanges.includes('Nx > 40%');
  const titleId = `pal-${pal.id}-title`;

  return (
    <article className={`pal ${blocking.length ? 'is-blocked' : ''}`} aria-labelledby={titleId}>
      <div className="pal-head">
        <span className="pal-num" id={titleId}>P{index + 1}</span>
        <input className="input" value={pal.nom} aria-label={`Nom de la palanquée ${index + 1}`}
          onChange={e => actions.setField('nom', e.target.value)} />
        <span className="pal-type">{TYPE_LABELS[palType] || palType}</span>
        <button type="button" className="btn ghost icon" aria-label={`Supprimer ${pal.nom}`} onClick={actions.remove}>
          <Icon.Trash />
        </button>
      </div>
      {blocking.length > 0 && <PalAlarm blocking={blocking} flaggedNames={flaggedNames} />}
      <div className="pal-body">
        <PalModeToggle pal={pal} onChange={actions.setMode} />
        <PalParams pal={pal} hardLimit={hardLimit} hasNitrox={hasNitrox}
          onProf={actions.setProf} onField={actions.setField} />
        <PalOptions pal={pal} palType={palType} melangesCatalog={melangesCatalog} siteShotLine={siteShotLine}
          onToggleMelange={actions.toggleMelange} onToggleNoDeco={actions.toggleNoDeco} onField={actions.setField} />
        <div className="pal-members">
          {pal.membres.length === 0 && (
            <p className="muted">Aucun plongeur. Ajoutez-en depuis l'annuaire.</p>
          )}
          {pal.membres.map(m => (
            <MemberRow key={m._bapteme ? `b${m.id}` : m.diverId} m={m} diversById={diversById}
              flagged={flagged.has(m._bapteme ? m.id : m.diverId)} palContext={palContext}
              onAptitude={apt => actions.setAptitude(m.diverId, apt)}
              onRemove={() => actions.removeMember(m._bapteme ? m.id : m.diverId)} />
          ))}
        </div>
        <IssueList issues={issues} />
      </div>
    </article>
  );
}
