// DP Assistant — Composants UI partagés

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// =========================================================================
// Pill — pastille de tag/mélange
// =========================================================================
function Pill({ tone = "default", children, className = "" }) {
  return <span className={`pill ${tone} ${className}`}>{children}</span>;
}

// =========================================================================
// Ref — référence réglementaire
// =========================================================================
function Ref({ children }) {
  if (!children) return null;
  return <span className="ref" title="Référence réglementaire">{children}</span>;
}

// =========================================================================
// Alert
// =========================================================================
function Alert({ tone = "info", title, children }) {
  const labels = { info: "INFO", warn: "ATTENTION", ok: "OK", err: "BLOQUANT" };
  return (
    <div className={`alert ${tone}`}>
      <span className="ic">{labels[tone] || tone.toUpperCase()}</span>
      <div>
        {title && <b style={{ display: "block", marginBottom: 2 }}>{title}</b>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// =========================================================================
// Option button (single / multi)
// =========================================================================
function Opt({ checked, onClick, label, hint, multi = false }) {
  return (
    <button
      type="button"
      className={`opt ${multi ? "sq" : ""}`}
      aria-checked={checked ? "true" : "false"}
      onClick={onClick}
    >
      <span className="check"></span>
      <span className="body">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

// =========================================================================
// Toggle (yes/no)
// =========================================================================
function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className="toggle"
      aria-checked={checked ? "true" : "false"}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

// =========================================================================
// Field wrapper
// =========================================================================
function Field({ label, hint, regRef, required, children, controls }) {
  return (
    <div className="field">
      <div className="field-row">
        <label className="field-label">
          {label}
          {required && <span className="req">*</span>}
        </label>
        {regRef && <Ref>{regRef}</Ref>}
        {controls}
      </div>
      {hint && <div className="field-hint">{hint}</div>}
      <div>{children}</div>
    </div>
  );
}

// =========================================================================
// Dynamic question renderer
// =========================================================================
function Question({ q, value, onChange }) {
  const set = (v) => onChange(q.id, v);

  if (q.type === "bool") {
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}
        controls={
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
            <Toggle checked={!!value} onChange={set} label={q.label} />
            <span style={{ fontFamily: "var(--t-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", minWidth: 30 }}>
              {value ? "OUI" : "NON"}
            </span>
          </div>
        }>
      </Field>
    );
  }

  if (q.type === "choice") {
    const cols = q.cols || 3;
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
        <div className={`opt-group col-${cols}`}>
          {q.options.map(o => (
            <Opt key={o} label={o} checked={value === o} onClick={() => set(o)} />
          ))}
        </div>
      </Field>
    );
  }

  if (q.type === "multi") {
    const cols = q.cols || 3;
    const vals = Array.isArray(value) ? value : [];
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
        <div className={`opt-group col-${cols}`}>
          {q.options.map(o => {
            const on = vals.includes(o);
            return (
              <Opt key={o} multi label={o} checked={on}
                onClick={() => set(on ? vals.filter(x => x !== o) : [...vals, o])} />
            );
          })}
        </div>
      </Field>
    );
  }

  if (q.type === "text") {
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
        <input className="input" type="text" placeholder={q.placeholder || ""}
          value={value || ""} onChange={(e) => set(e.target.value)} />
      </Field>
    );
  }

  if (q.type === "textarea") {
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
        <textarea className="textarea" placeholder={q.placeholder || ""}
          value={value || ""} onChange={(e) => set(e.target.value)} />
      </Field>
    );
  }

  if (q.type === "number") {
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input className="input num" type="number" step="0.1"
            value={value ?? ""} onChange={(e) => set(parseFloat(e.target.value) || 0)} />
          {q.suffix && <span className="muted" style={{ fontFamily: "var(--t-mono)", fontSize: 12 }}>{q.suffix}</span>}
        </div>
      </Field>
    );
  }

  if (q.type === "datetime") {
    return (
      <Field label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
        <input className="input tight" type="datetime-local"
          value={value || ""} onChange={(e) => set(e.target.value)} />
      </Field>
    );
  }

  return null;
}

// =========================================================================
// Helpers de format
// =========================================================================
function formatDateTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      + " — " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

function diverFullName(d) {
  return `${d.prenom} ${d.nom.toUpperCase()}`;
}

function getDiver(diversById, id) {
  return diversById[id] || { prenom: "?", nom: "?", niveau: "?" };
}

// =========================================================================
// Export to window for cross-file usage
// =========================================================================
Object.assign(window, {
  Pill, Ref, Alert, Opt, Toggle, Field, Question,
  formatDateTime, diverFullName, getDiver
});
