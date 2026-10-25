// DP Assistant — Carte d'une palanquée : en-tête, alarme de blocage, mode,
// paramètres prévus, mélanges, membres, règles appliquées.
//
// Une palanquée bloquée (issue tone 'err') est encadrée en rouge détresse,
// avec un résumé en tête et ses plongeurs concernés surlignés. Chaque règle
// affiche son texte et sa référence (Code du sport, ou loi du pays et arrêté
// n° 199 CM en Polynésie), sans survol. Rôles, mode et plafond viennent des
// règles de la juridiction (ctx.rules).

import React, { useEffect, useId } from 'react';
import { CdsLink, Pill, diverFullName } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { gasQualSummary, minDtr, PAL_TYPE_LABELS, palGas, parseCdsRefs } from '../../domain/index.js';

const isEncadrantRolePf = (role) => /^(ENS|GP)-/.test(role || '');

function memberName(m, diversById) {
  if (m._bapteme) return `${m.prenom || ''} ${(m.nom || '').toUpperCase()}`.trim();
  const d = diversById[m.diverId];
  return d ? diverFullName(d) : '?';
}

// Référence lisible : article du Code du sport (lien Légifrance) ou annexe.
export function IssueRef({ refText, jurisdiction }) {
  if (!refText) return null;
  if (jurisdiction === 'PF') {
    const texte = /^LP\b/.test(refText) ? 'loi du pays n° 2017-44' : 'arrêté n° 199 CM';
    return (
      <span className="issue-ref">
        {texte} : {refText}
      </span>
    );
  }
  const arts = parseCdsRefs(refText);
  return (
    <span className="issue-ref">
      Code du sport : {arts.length > 0 ? <CdsLink refText={refText} compact /> : <span>annexe {refText}</span>}
    </span>
  );
}

const ISSUE_TAG = { err: 'Bloquant', warn: 'Alerte', ok: 'Conforme' };

function IssueList({ issues, onBirthdate, jurisdiction }) {
  return (
    <ul className="issue-list" aria-label="Règles appliquées">
      {issues.map((v, i) => (
        <li key={`${v.code}-${i}`} className={`issue ${v.tone}`} data-code={v.code}>
          <StatusIcon tone={v.tone} />
          <span className="issue-text">
            <b>{ISSUE_TAG[v.tone]} :</b>
            {v.text}
          </span>
          <IssueRef refText={v.ref} jurisdiction={jurisdiction} />
          {v.code === 'AGE_UNKNOWN' && onBirthdate && v.ids?.[0] && (
            <button type="button" className="btn issue-action" onClick={() => onBirthdate(v.ids[0])}>
              Saisir la date de naissance
            </button>
          )}
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
        <StatusIcon tone="err" />
        Palanquée bloquée : {n} règle{n > 1 ? 's' : ''} non respectée{n > 1 ? 's' : ''}
      </div>
      {flaggedNames.length > 0 && <p>Plongeurs concernés : {flaggedNames.join(', ')}.</p>}
      <p>Détail et références ci-dessous.</p>
    </div>
  );
}

// Mode enseignement / exploration (A322-75) : choisi dès qu'un enseignant
// est présent ; un baptême est toujours de l'enseignement.
function PalModeToggle({ pal, rules, onChange }) {
  const labelId = useId();
  const apts = pal.membres.map((m) => m.aptitude);
  if (!apts.some(rules.isEnseignantRole) || apts.includes('Baptême') || apts.includes('Débutant')) return null;
  const mode = rules.palMode(pal);
  return (
    <div className="pal-mode">
      <span className="pal-mode-label" id={labelId}>
        Type de plongée
      </span>
      <div className="seg" role="radiogroup" aria-labelledby={labelId}>
        {[
          ['enseignement', 'Enseignement'],
          ['exploration', 'Exploration'],
        ].map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => onChange(v)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumParam({ label, unit, value, onChange, placeholder, missing, alert, hint, min, max }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="pal-param">
      <label htmlFor={id}>{label}</label>
      <div className={`unit-input ${missing ? 'is-missing' : ''}`}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ''}
          placeholder={placeholder}
          aria-describedby={hint || missing || alert ? hintId : undefined}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        />
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      {missing || alert ? (
        <span className="hint warn" id={hintId}>
          <StatusIcon tone="warn" />
          {missing ? 'À saisir' : alert}
        </span>
      ) : (
        hint && (
          <span className="hint" id={hintId}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

function PalParams({ pal, hardLimit, pf, onProf, onField }) {
  const gas = palGas(pal.melanges);
  const dtrMin = minDtr(pal.profMax);
  return (
    <div className="pal-params">
      <NumParam
        label="Profondeur max"
        unit="m"
        value={pal.profMax}
        min={1}
        hint={Number.isFinite(hardLimit) ? `Plafond ${hardLimit} m` : undefined}
        onChange={(v) => onProf(v || 0)}
      />
      <NumParam label="Durée prévue" unit="min" value={pal.duree} min={1} onChange={(v) => onField('duree', v || 0)} />
      <NumParam
        label="DTR prévue"
        unit="min"
        value={pal.dtr}
        min={0}
        placeholder="à saisir"
        missing={pal.dtr == null}
        alert={pal.dtr != null && pal.dtr < dtrMin ? `Minimum ${dtrMin} min (1 min / 10 m)` : undefined}
        hint={`Min. ${dtrMin} min (1 min / 10 m)`}
        onChange={(v) => onField('dtr', v)}
      />
      {gas.bottomNitrox && (
        <NumParam
          label={gas.decoNitrox ? 'O₂ du gaz fond' : 'O₂ du nitrox'}
          unit="%"
          value={pal.o2}
          min={22}
          max={gas.bottomO2Max}
          placeholder="à saisir"
          missing={pal.o2 == null}
          hint="Contrôle de la MOD (PpO₂ 1,6 bar)"
          onChange={(v) => onField('o2', v)}
        />
      )}
      {pf && gas.trimix && (
        <>
          <NumParam
            label="O₂ du trimix"
            unit="%"
            value={pal.o2}
            min={5}
            max={50}
            placeholder="à saisir"
            missing={pal.o2 == null}
            hint="PpO₂ 1,6 bar (art. 29)"
            onChange={(v) => onField('o2', v)}
          />
          <NumParam
            label="Hélium du trimix"
            unit="%"
            value={pal.he}
            min={0}
            max={95}
            placeholder="à saisir"
            hint="PpN₂ 4 bar au plus (art. 31)"
            onChange={(v) => onField('he', v)}
          />
        </>
      )}
      {gas.decoNitrox && (
        <NumParam
          label="O₂ du gaz de déco"
          unit="%"
          value={pal.o2_deco}
          min={41}
          max={100}
          placeholder="ex. 80"
          hint="Gaz de déco : pas de MOD au fond"
          onChange={(v) => onField('o2_deco', v)}
        />
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

function PalOptions({
  pal,
  palType,
  melangesCatalog,
  siteShotLine,
  pfFormation,
  onToggleMelange,
  onToggleNoDeco,
  onField,
}) {
  const melanges = pal.melanges || [];
  const isBapteme = palType === 'bapteme';
  return (
    <div className="pal-options">
      <fieldset>
        <legend>Mélanges</legend>
        <div className="qualif-row">
          {melangesCatalog.map(({ value, allowed, reason }) => (
            <ChipToggle
              key={value}
              on={melanges.includes(value)}
              locked={!allowed}
              reason={reason}
              onToggle={() => onToggleMelange(value)}
            >
              {value}
            </ChipToggle>
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
            <ChipToggle on={!!pal.shot_line} onToggle={() => onField('shot_line', !pal.shot_line)}>
              Shot-line
            </ChipToggle>
          )}
          {pfFormation && (
            <ChipToggle
              on={!!pal.derogation_formation_60}
              onToggle={() => onField('derogation_formation_60', !pal.derogation_formation_60)}
            >
              Formation jusqu'à 60 m (standards de l'organisme, art. 26)
            </ChipToggle>
          )}
        </div>
      </fieldset>
    </div>
  );
}

function AptitudeSelect({ diver, value, palContext, rules, onChange, invalid }) {
  const available = rules.rolesFor(diver, palContext);
  const single = available.length === 1 ? available[0] : null;
  // Une seule aptitude possible : sélection automatique (après rendu).
  useEffect(() => {
    if (single && !value) onChange(single);
  }, [single, value]); // eslint-disable-line react-hooks/exhaustive-deps
  if (available.length === 0) return <span className="muted apt-fixed">Aucune aptitude</span>;
  return (
    <select
      className={`input role-sel ${invalid ? 'invalid' : ''}`}
      value={value || ''}
      aria-label={`Aptitude de ${diverFullName(diver)}`}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Aptitude…</option>
      {available.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
      {value && !available.includes(value) && <option value={value}>{value} (non justifiée)</option>}
    </select>
  );
}

// Polynésie : encadrement rémunéré ou bénévole (LP 5, LP 18) ; toujours
// rémunéré dans une structure lucrative.
function RemunereToggle({ m, d, onChange }) {
  const on = typeof m.remunere === 'boolean' ? m.remunere : !!d.pf?.patente;
  return (
    <label className="qualif-toggle remunere">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      Rémunéré
    </label>
  );
}

function MemberRow({ m, diversById, flagged, palContext, rules, showRemunere, onAptitude, onRemunere, onRemove }) {
  const name = memberName(m, diversById);
  const d = m._bapteme ? null : diversById[m.diverId];
  if (!m._bapteme && !d) return null;
  return (
    <div className={`diver-row ${flagged ? 'flagged' : ''}`}>
      <span className="lvl">{m._bapteme ? 'Bapt.' : d.niveau_encadrant || d.niveau_plongeur || '?'}</span>
      <div className="name">
        <b>{name}</b>
        <small>{m._bapteme ? 'Baptême, hors annuaire' : gasQualSummary(d).join(' ')}</small>
        <span className="flag">
          <StatusIcon tone="err" />
          Règle bloquante
        </span>
      </div>
      {m._bapteme ? (
        <span className="apt-fixed">
          <Pill>Baptême</Pill>
        </span>
      ) : (
        <AptitudeSelect
          diver={d}
          value={m.aptitude}
          palContext={palContext}
          rules={rules}
          invalid={flagged}
          onChange={onAptitude}
        />
      )}

      <button type="button" className="x" aria-label={`Retirer ${name} de la palanquée`} onClick={onRemove}>
        ×
      </button>
      {showRemunere && !m._bapteme && isEncadrantRolePf(m.aptitude) && (
        <RemunereToggle m={m} d={d} onChange={onRemunere} />
      )}
    </div>
  );
}

export function PalCard({ pal, index, ctx }) {
  const {
    diversById,
    issues,
    palType,
    palContext,
    hardLimit,
    melangesCatalog,
    siteShotLine,
    rules,
    jurisdiction,
    lucratif,
    actions,
  } = ctx;
  const pf = jurisdiction === 'PF';
  const blocking = issues.filter((v) => v.tone === 'err');
  const flagged = new Set(blocking.flatMap((v) => v.ids || []));
  const flaggedNames = pal.membres
    .filter((m) => flagged.has(m._bapteme ? m.id : m.diverId))
    .map((m) => memberName(m, diversById));
  const titleId = `pal-${pal.id}-title`;

  return (
    <article
      className={['pal', pal.membres.length > 0 && `kind-${palType}`, blocking.length > 0 && 'is-blocked']
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={titleId}
    >
      <div className="pal-head">
        <span className="pal-num" id={titleId}>
          P{index + 1}
        </span>
        <input
          className="input"
          value={pal.nom}
          aria-label={`Nom de la palanquée ${index + 1}`}
          onChange={(e) => actions.setField('nom', e.target.value)}
        />
        <span className="pal-type">{PAL_TYPE_LABELS[palType] || palType}</span>
        <button type="button" className="btn ghost icon" aria-label={`Supprimer ${pal.nom}`} onClick={actions.remove}>
          <Icon.Trash />
        </button>
      </div>
      {blocking.length > 0 && <PalAlarm blocking={blocking} flaggedNames={flaggedNames} />}
      <div className="pal-body">
        <PalModeToggle pal={pal} rules={rules} onChange={actions.setMode} />
        <PalParams pal={pal} hardLimit={hardLimit} pf={pf} onProf={actions.setProf} onField={actions.setField} />
        <PalOptions
          pal={pal}
          palType={palType}
          melangesCatalog={melangesCatalog}
          siteShotLine={siteShotLine}
          pfFormation={pf && rules.palMode(pal) === 'enseignement'}
          onToggleMelange={actions.toggleMelange}
          onToggleNoDeco={actions.toggleNoDeco}
          onField={actions.setField}
        />
        <div className="pal-members">
          {pal.membres.length === 0 && <p className="muted">Aucun plongeur. Ajoutez-en depuis l'annuaire.</p>}
          {pal.membres.map((m) => (
            <MemberRow
              key={m._bapteme ? `b${m.id}` : m.diverId}
              m={m}
              diversById={diversById}
              flagged={flagged.has(m._bapteme ? m.id : m.diverId)}
              palContext={palContext}
              rules={rules}
              showRemunere={pf && !lucratif}
              onAptitude={(apt) => actions.setAptitude(m.diverId, apt)}
              onRemunere={(v) => actions.setRemunere(m.diverId, v)}
              onRemove={() => actions.removeMember(m._bapteme ? m.id : m.diverId)}
            />
          ))}
        </div>
        <IssueList issues={issues} onBirthdate={actions.editBirthdate} jurisdiction={jurisdiction} />
      </div>
    </article>
  );
}
