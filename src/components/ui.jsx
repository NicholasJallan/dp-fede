// DP Assistant — Primitives d'interface : pastilles, alertes, options, champs, questions.

import React, { useId } from 'react';
import { CdsLink } from './cds-link.jsx';
import { StatusIcon, STATUS_LABELS } from './icons.jsx';

// =========================================================================
// Pill — pastille (niveau, mélange, contexte). Tons d'état : ok / warn / err.
// =========================================================================
function Pill({ tone = 'default', children, className = '' }) {
  return <span className={`pill ${tone} ${className}`.trim()}>{children}</span>;
}

// =========================================================================
// Ref — référence réglementaire en texte
// =========================================================================
function Ref({ children }) {
  if (!children) return null;
  return <span className="ref">{children}</span>;
}

// =========================================================================
// Alert — forme + couleur + libellé lu par les lecteurs d'écran
// =========================================================================
const ALERT_SR = { info: 'Information', warn: 'Alerte', ok: 'Conforme', err: 'Bloquant' };

function Alert({ tone = 'info', title, children, className = '' }) {
  return (
    <div className={`alert ${tone} ${className}`.trim()} role={tone === 'err' ? 'alert' : undefined}>
      <StatusIcon tone={tone} />
      <div className="alert-body">
        <span className="sr-only">{ALERT_SR[tone] || STATUS_LABELS[tone]} : </span>
        {title && <b>{title}</b>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// =========================================================================
// Notice — encart d'état dans le contenu (titre + texte + actions)
// =========================================================================
function Notice({ tone = 'info', title, children, actions, live = false, className = '' }) {
  const shape = tone === 'signal' ? 'warn' : tone;
  return (
    <section className={`notice ${tone} ${className}`.trim()} role={live ? 'status' : undefined}>
      {title && (
        <div className="notice-title">
          <StatusIcon tone={shape} />
          {title}
        </div>
      )}
      {children && <div>{children}</div>}
      {actions && <div className="notice-actions">{actions}</div>}
    </section>
  );
}

// =========================================================================
// Opt — gros bouton d'option : radio (choix unique) ou case (choix multiple)
// =========================================================================
function Opt({ checked, onClick, label, hint, multi = false, disabled = false }) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      className={`opt ${multi ? 'sq' : ''}`}
      aria-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="check" aria-hidden="true"></span>
      <span className="body">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

// =========================================================================
// Toggle — interrupteur oui / non (role="switch")
// =========================================================================
function Toggle({ checked, onChange, label, labelledBy, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      className="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
    >
      <span className="track" aria-hidden="true"></span>
      <span className="state" aria-hidden="true">
        {checked ? 'Oui' : 'Non'}
      </span>
    </button>
  );
}

// =========================================================================
// Field — libellé relié au contrôle.
//   - enfant <input>/<select>/<textarea> : id + aria-describedby injectés ;
//   - children fonction : reçoit { id, labelId, hintId } (contrôles composés) ;
//   - group : libellé + role="group" (ensembles d'options).
// =========================================================================
const NATIVE_CONTROLS = ['input', 'select', 'textarea'];

function Field({
  label,
  hint,
  regRef,
  required,
  children,
  controls,
  group = false,
  labelOnly = false,
  id: idProp,
  className = '',
}) {
  const auto = useId();
  const id = idProp || `f${auto.replace(/:/g, '')}`;
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const ids = { id, labelId, hintId };

  let content = typeof children === 'function' ? children(ids) : children;
  if (!group && React.isValidElement(content) && NATIVE_CONTROLS.includes(content.type)) {
    content = React.cloneElement(content, {
      id: content.props.id || id,
      'aria-describedby': content.props['aria-describedby'] || hintId,
      'aria-required': required || undefined,
    });
  }
  // labelOnly : le contrôle composé se relie lui-même au libellé (aria-labelledby).
  const LabelTag = group || controls || labelOnly ? 'span' : 'label';

  return (
    <div className={`field ${className}`.trim()}>
      <div className="field-row">
        <LabelTag className="field-label" id={labelId} htmlFor={LabelTag === 'label' ? id : undefined}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (obligatoire)</span>}
        </LabelTag>
        {regRef && <CdsLink refText={regRef} compact />}
        {controls && (
          <span className="field-controls">{typeof controls === 'function' ? controls(ids) : controls}</span>
        )}
      </div>
      {hint && (
        <div className="field-hint" id={hintId}>
          {hint}
        </div>
      )}
      {content != null &&
        (group ? (
          <div role="group" aria-labelledby={labelId} aria-describedby={hintId}>
            {content}
          </div>
        ) : (
          content
        ))}
    </div>
  );
}

// =========================================================================
// Question — rendu dynamique d'une question du profil
// =========================================================================
function ChoiceQuestion({ q, value, set }) {
  const cols = q.cols || 3;
  return (
    <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required} labelOnly>
      {({ labelId, hintId }) => (
        <div className={`opt-group col-${cols}`} role="radiogroup" aria-labelledby={labelId} aria-describedby={hintId}>
          {q.options.map((o) => (
            <Opt key={o} label={o} checked={value === o} onClick={() => set(o)} />
          ))}
        </div>
      )}
    </Field>
  );
}

function MultiQuestion({ q, value, set }) {
  const cols = q.cols || 3;
  const vals = Array.isArray(value) ? value : [];
  return (
    <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required} group>
      <div className={`opt-group col-${cols}`}>
        {q.options.map((o) => {
          const on = vals.includes(o);
          return (
            <Opt
              key={o}
              multi
              label={o}
              checked={on}
              onClick={() => set(on ? vals.filter((x) => x !== o) : [...vals, o])}
            />
          );
        })}
      </div>
    </Field>
  );
}

function Question({ q, value, onChange }) {
  const set = (v) => onChange(q.id, v);
  const common = { label: q.label, hint: q.hint, regRef: q.ref, required: q.required };

  switch (q.type) {
    case 'bool':
      return (
        <Field
          {...common}
          controls={({ id, labelId }) => <Toggle id={id} checked={!!value} onChange={set} labelledBy={labelId} />}
        />
      );
    case 'choice':
      return <ChoiceQuestion q={q} value={value} set={set} />;
    case 'multi':
      return <MultiQuestion q={q} value={value} set={set} />;
    case 'text':
      return (
        <Field {...common}>
          <input
            className="input"
            type="text"
            placeholder={q.placeholder || ''}
            value={value || ''}
            onChange={(e) => set(e.target.value)}
          />
        </Field>
      );
    case 'textarea':
      return (
        <Field {...common}>
          <textarea
            className="textarea"
            placeholder={q.placeholder || ''}
            value={value || ''}
            onChange={(e) => set(e.target.value)}
          />
        </Field>
      );
    case 'number':
      return (
        <Field {...common}>
          {({ id, hintId }) => (
            <div className="unit-input narrow">
              <input
                id={id}
                aria-describedby={hintId}
                type="text"
                inputMode="decimal"
                value={value ?? ''}
                onChange={(e) => set(parseFloat(e.target.value.replace(',', '.')) || 0)}
              />
              {q.suffix && <span className="unit">{q.suffix}</span>}
            </div>
          )}
        </Field>
      );
    case 'datetime':
      return (
        <Field {...common}>
          <input
            className="input mono narrow"
            type="datetime-local"
            value={value || ''}
            onChange={(e) => set(e.target.value)}
          />
        </Field>
      );
    default:
      return null;
  }
}

export { Pill, Ref, Alert, Notice, Opt, Toggle, Field, Question };
