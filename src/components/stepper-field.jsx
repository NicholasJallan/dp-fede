// DP Assistant — Saisie numérique rapide « − / + » (paramètres de sortie,
// paliers). Sur le terrain, mains mouillées ou gantées, corriger 42 → 38 au
// clavier est lent : les boutons font ±1 et répètent en appui long. Le champ
// reste saisissable (clavier numérique) ; flèches haut / bas = ±1.
//
// Valeur et onChange en chaîne (comme UnitField) : les règles de saisie
// (bornes de fin-rules.js) s'appliquent de la même façon aux deux.

import React, { useEffect, useId, useRef } from 'react';

const HOLD_DELAY_MS = 400;
const HOLD_EVERY_MS = 110;

function clamp(v, min, max) {
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}

function useHoldRepeat(onStep) {
  const timers = useRef(null);
  const stop = () => {
    if (!timers.current) return;
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.every);
    timers.current = null;
  };
  const start = (dir) => {
    stop();
    onStep(dir);
    const delay = setTimeout(() => {
      timers.current = { ...timers.current, every: setInterval(() => onStep(dir), HOLD_EVERY_MS) };
    }, HOLD_DELAY_MS);
    timers.current = { delay };
  };
  useEffect(() => stop, []);
  return { start, stop };
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.label
 * @param {string} props.unit
 * @param {string} props.value
 * @param {(raw: string) => void} props.onChange
 * @param {number} [props.min]
 * @param {number} [props.max]
 * @param {number} [props.step]
 * @param {string} [props.hint]
 * @param {string} [props.placeholder]
 * @param {boolean} [props.autoFocus]
 * @param {boolean} [props.compact]  libellé à gauche, sur une ligne (paliers)
 */
export function StepperField({ label, unit, value, onChange, min = 0, max, step = 1, hint, placeholder, autoFocus = false, compact = false }) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  // Valeur courante tenue à jour entre deux rendus : l'appui long enchaîne
  // les incréments plus vite que React ne re-rend.
  const current = useRef(value);
  current.current = value;

  const bump = (dir) => {
    const n = parseFloat(current.current);
    const base = Number.isFinite(n) ? n : (min ?? 0);
    const next = String(clamp(Math.round((base + dir * step) * 100) / 100, min, max));
    current.current = next;
    onChange(next);
  };
  const hold = useHoldRepeat(bump);
  const n = parseFloat(value);
  const atMin = min != null && Number.isFinite(n) && n <= min;
  const atMax = max != null && Number.isFinite(n) && n >= max;

  const button = (dir, text, sign) => (
    <button type="button" className="num-stepper-btn" aria-label={text}
      aria-controls={id} disabled={dir < 0 ? atMin : atMax}
      onPointerDown={(e) => { if (e.button === 0) hold.start(dir); }}
      onPointerUp={hold.stop} onPointerLeave={hold.stop} onPointerCancel={hold.stop}
      // Clavier (Entrée / Espace) : click sans pointerdown préalable.
      onClick={(e) => { if (e.detail === 0) bump(dir); }}
      onContextMenu={(e) => e.preventDefault()}>
      {sign}
    </button>
  );

  return (
    <div className={`field plain stepper-field ${compact ? 'is-compact' : ''}`}>
      <label htmlFor={id} id={labelId}>{label}</label>
      {/* Groupe nommé par le libellé : « Durée réelle, groupe — Diminuer ». */}
      <div className="num-stepper" role="group" aria-labelledby={labelId}>
        {button(-1, 'Diminuer', '−')}
        <div className="unit-input">
          <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" value={value} placeholder={placeholder}
            aria-describedby={hintId} data-autofocus={autoFocus ? '' : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
            }}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))} />
          <span className="unit" aria-hidden="true">{unit}</span>
        </div>
        {button(1, 'Augmenter', '+')}
      </div>
      {hint && <span className="field-hint" id={hintId}>{hint}</span>}
    </div>
  );
}
