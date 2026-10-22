// DP Assistant — Tableau de bord d'exécution : une carte « cadran » par
// palanquée (prévu en gros chiffres, chronomètre, ENTRÉE / SORTIE,
// pressions de sortie).

import React from 'react';
import { diverFullName } from '../../components/format.js';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { formatPaliers, getPalType, PAL_TYPE_LABELS, sortMembresForFiche } from '../../domain/index.js';
import { useNow } from '../home-parts.jsx';
import { elapsedSeconds, formatChrono } from './time.js';

const AIR_OUT = "panne d'air";

export const pressureKey = (pal, m) => `${pal.id}-${m.diverId || m.id}`;

function memberLabel(m, diversById) {
  if (m._bapteme) return { name: `${m.prenom || ''} ${(m.nom || '').toUpperCase()}`.trim(), sub: 'Baptême' };
  const d = diversById[m.diverId] || {};
  return { name: d.nom ? diverFullName(d) : '?', sub: d.licence || '' };
}

function Gauge({ label, value, unit, real, missing }) {
  return (
    <div className="gauge">
      <span className="gauge-label">{label}</span>
      {missing ? (
        <span className="gauge-value is-missing">
          <StatusIcon tone="warn" />à saisir
        </span>
      ) : (
        <span className="gauge-value">
          {value}
          <small>{unit}</small>
        </span>
      )}
      {real != null && (
        <span className="gauge-real">
          réalisé{' '}
          <b>
            {real} {unit}
          </b>
        </span>
      )}
    </div>
  );
}

function Chrono({ debut, fin, duree, real }) {
  const inWater = !!debut && !fin;
  const now = useNow(1000, inWater);
  if (!debut) {
    return (
      <div className="chrono">
        <span className="chrono-label">Chronomètre</span>
        <span className="chrono-value is-idle">00:00:00</span>
        <span className="chrono-times">En surface</span>
      </div>
    );
  }
  const seconds = fin ? (Number(real?.duree) || 0) * 60 : elapsedSeconds(debut, now);
  const planned = (Number(duree) || 0) * 60;
  const ratio = planned > 0 ? Math.min(1, seconds / planned) : 0;
  const over = inWater && planned > 0 && seconds > planned;
  return (
    <div className="chrono" role="timer" aria-label={fin ? 'Durée de plongée' : "Temps écoulé depuis l'entrée"}>
      <span className="chrono-label">{fin ? 'Durée de plongée' : 'Temps écoulé'}</span>
      <span className="chrono-value">{formatChrono(seconds)}</span>
      <span className="chrono-times">
        <span>
          Entrée <b>{debut}</b>
        </span>
        <span>
          Sortie <b>{fin || '—'}</b>
        </span>
      </span>
      <div className="chrono-bar" aria-hidden="true">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      {over && (
        <span className="chrono-alert" role="status">
          <StatusIcon tone="warn" />
          Durée prévue dépassée de {Math.floor((seconds - planned) / 60)} min
        </span>
      )}
    </div>
  );
}

function PressureRow({ pal, m, diversById, value, onChange }) {
  const { name, sub } = memberLabel(m, diversById);
  const airOut = value === AIR_OUT;
  const id = `pr-${pressureKey(pal, m)}`;
  return (
    <div className={`pressure-row ${airOut ? 'is-air-out' : ''}`}>
      <label className="who" htmlFor={id}>
        {name}
        {sub && <small>{sub}</small>}
      </label>
      <div className="unit-input">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={airOut ? '' : value || ''}
          disabled={airOut}
          placeholder="—"
          aria-label={`Pression de sortie de ${name} (bar)`}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        />
        <span className="unit" aria-hidden="true">
          bar
        </span>
      </div>
      <button type="button" className="btn" aria-pressed={airOut} onClick={() => onChange(airOut ? '' : AIR_OUT)}>
        Panne d'air
      </button>
    </div>
  );
}

function stateOf(debut, fin, over) {
  if (fin) return { cls: 'is-out', tone: 'ok', label: 'Sortie' };
  if (debut) return { cls: `is-water${over ? ' is-overtime' : ''}`, tone: 'info', label: "À l'eau" };
  return { cls: 'is-surface', tone: 'muted', label: 'En surface' };
}

export function Cadran({ pal, index, diversById, debut, fin, real, pressions, onStart, onEnd, onPressure }) {
  const membres = sortMembresForFiche(pal.membres || []);
  const now = useNow(15_000, !!debut && !fin);
  const over = !!debut && !fin && Number(pal.duree) > 0 && elapsedSeconds(debut, now) > Number(pal.duree) * 60;
  const st = stateOf(debut, fin, over);
  const titleId = `cadran-${pal.id}`;
  // Teinte du type (PA / PE / formation), comme les cartes de l'écran Palanquées.
  const palType = membres.length > 0 ? getPalType(membres, pal.mode) : null;
  return (
    <article
      className={['cadran', st.cls, palType && `kind-${palType}`].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
    >
      <header className="cadran-head">
        <span className="cadran-id">P{index + 1}</span>
        <h2 id={titleId}>{pal.nom || `Palanquée ${index + 1}`}</h2>
        {palType && <span className="cadran-type">{PAL_TYPE_LABELS[palType]}</span>}
        <span className="cadran-state">
          <StatusIcon tone={st.tone} />
          {st.label}
        </span>
      </header>
      <ul className="cadran-members" aria-label="Membres et aptitudes">
        {membres.map((m, i) => {
          const { name } = memberLabel(m, diversById);
          return (
            <li key={m.diverId || m.id || i}>
              <span className="apt">{m.aptitude || '—'}</span>
              <span className="name">{name}</span>
            </li>
          );
        })}
      </ul>
      <div className="gauges">
        <Gauge label="Profondeur" value={pal.profMax} unit="m" real={real?.profMax} />
        <Gauge label="Durée" value={pal.duree} unit="min" real={real?.duree} />
        <Gauge label="DTR" value={pal.dtr} unit="min" real={real?.dtr} missing={pal.dtr == null} />
      </div>
      <Chrono debut={debut} fin={fin} duree={pal.duree} real={real} />
      {!fin && (
        <div className="cadran-actions">
          {!debut ? (
            <button type="button" className="btn go block" onClick={onStart}>
              <Icon.Play />
              ENTRÉE
            </button>
          ) : (
            <button type="button" className="btn exit block" onClick={onEnd}>
              <Icon.Stop />
              SORTIE
            </button>
          )}
        </div>
      )}
      {fin && (
        <div className="cadran-done">
          <div className="cadran-done-head">
            <StatusIcon tone="ok" />
            Pressions de sortie
          </div>
          {formatPaliers(real) && (
            <p className="cadran-paliers">
              Paliers : <b>{formatPaliers(real)}</b>
            </p>
          )}
          {real?.commentaire && <p className="cadran-comment">{real.commentaire}</p>}
          <div className="pressure-list">
            {membres.map((m, i) => (
              <PressureRow
                key={m.diverId || m.id || i}
                pal={pal}
                m={m}
                diversById={diversById}
                value={pressions[pressureKey(pal, m)]}
                onChange={(v) => onPressure(pressureKey(pal, m), v)}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function ExecSummary({ exit }) {
  return (
    <div className="exec-summary" role="status">
      <span className="item">
        <span className="num">{exit.water}</span>
        <span className="k">à l'eau</span>
      </span>
      <span className="item">
        <span className="num">
          {exit.out}/{exit.total}
        </span>
        <span className="k">sorties</span>
      </span>
      <span className="item">
        <span className="num">{exit.total - exit.out - exit.water}</span>
        <span className="k">en surface</span>
      </span>
    </div>
  );
}
