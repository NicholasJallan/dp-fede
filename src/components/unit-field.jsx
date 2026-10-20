// DP Assistant — Saisie numérique avec unité (m, min, bar, %), clavier
// numérique sur mobile, libellé relié.

import React, { useId } from 'react';

export function UnitField({ label, unit, value, onChange, hint, placeholder, inputMode = 'numeric', autoFocus = false }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field plain">
      <label htmlFor={id}>{label}</label>
      <div className="unit-input">
        <input id={id} type="text" inputMode={inputMode} pattern={inputMode === 'numeric' ? '[0-9]*' : undefined}
          value={value} placeholder={placeholder} aria-describedby={hintId}
          data-autofocus={autoFocus ? '' : undefined}
          onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))} />
        <span className="unit" aria-hidden="true">{unit}</span>
      </div>
      {hint && <span className="field-hint" id={hintId}>{hint}</span>}
    </div>
  );
}
