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
// CdsLink — lien vers un article du Code du Sport
// Affiche un badge cliquable avec tooltip de résumé + lien Légifrance.
// Le tooltip est positionné en fixed via JS pour s'échapper des conteneurs
// parents qui ont overflow: hidden (cas .cl-phase, .card, modales, etc.).
// =========================================================================
function CdsBadge({ articleNumber, compact = false }) {
  const info = window.CDS_ARTICLES[articleNumber];
  const href = info?.url
    || `https://www.legifrance.gouv.fr/search/code?searchField=ARTICLE&query=${encodeURIComponent(articleNumber)}&tab_selection=code`;

  const badgeRef   = useRef(null);
  const tooltipRef = useRef(null);
  const [open, setOpen] = useState(false);

  const place = () => {
    const badge = badgeRef.current;
    const tip   = tooltipRef.current;
    if (!badge || !tip) return;

    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const badgeRect = badge.getBoundingClientRect();

    // Render au préalable pour mesurer
    tip.style.left = '0px';
    tip.style.top  = '0px';
    tip.style.visibility = 'hidden';
    tip.style.opacity = '0';
    tip.style.display = 'block';
    const tipRect = tip.getBoundingClientRect();

    // Centre horizontal sur le badge, mais clamp dans le viewport
    let left = badgeRect.left + badgeRect.width / 2 - tipRect.width / 2;
    left = Math.max(margin, Math.min(vw - tipRect.width - margin, left));

    // Au-dessous par défaut ; au-dessus si pas la place
    let top = badgeRect.bottom + margin;
    let arrowAbove = true;
    if (top + tipRect.height + margin > vh) {
      const aboveTop = badgeRect.top - tipRect.height - margin;
      if (aboveTop > margin) { top = aboveTop; arrowAbove = false; }
    }

    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
    tip.dataset.arrow = arrowAbove ? 'above' : 'below';

    // Position horizontale de la flèche pour qu'elle pointe vers le badge
    const arrowX = (badgeRect.left + badgeRect.width / 2) - left;
    tip.style.setProperty('--arrow-x', `${arrowX}px`);

    tip.style.visibility = '';
    tip.style.opacity = '';
  };

  const show = () => { setOpen(true); requestAnimationFrame(place); };
  const hide = () => setOpen(false);

  return (
    <a ref={badgeRef}
      href={href}
      target="_blank" rel="noopener noreferrer"
      className={`cds-badge ${compact ? 'compact' : ''}`}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={hide}
      onBlur={hide}
      onClick={e => e.stopPropagation()}>
      <span className="cds-icon">§</span>
      <span className="cds-art">Art. {articleNumber}</span>
      <span ref={tooltipRef} className={`cds-tooltip ${open ? 'open' : ''}`} role="tooltip">
        <b>{info?.title || `Article ${articleNumber}`}</b>
        <small>{info?.summary || 'Voir le texte sur Légifrance.'}</small>
        <em>Légifrance ↗</em>
      </span>
    </a>
  );
}

function CdsLink({ art, label, refText, compact = false }) {
  const arts = useMemo(() => {
    if (art) return [art];
    if (refText) return window.parseCdsRefs(refText);
    return [];
  }, [art, refText]);

  if (arts.length === 0) {
    return label ? <span className="cds-badge muted">{label}</span> : null;
  }

  return (
    <span className={`cds-refs ${compact ? 'compact' : ''}`}>
      {label && <span className="cds-label">{label}</span>}
      {arts.map(a => <CdsBadge key={a} articleNumber={a} compact={compact} />)}
    </span>
  );
}

// Helper — rend un libellé contenant "Art. A322-xxx" en remplaçant par un CdsLink
function withCdsLinks(text) {
  if (!text) return text;
  const refs = window.parseCdsRefs(text);
  if (refs.length === 0) return text;
  // On garde le texte intact et on ajoute les badges après
  // (plus simple que de découper en regex pour préserver la structure)
  return (
    <React.Fragment>
      {text.replace(/\s*\(?(Art\.|CdS)\s*A322-\d+(?:-\d+)?(?:\s*[,/]\s*A322-\d+(?:-\d+)?)*\)?/g, '').trim()}
      {' '}
      <CdsLink refText={text} compact />
    </React.Fragment>
  );
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
        {regRef && <CdsLink refText={regRef} compact />}
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
// SyncDrawer — overlay listant les actions en attente d'envoi au serveur
// =========================================================================
const KIND_LABELS = {
  'dive.create':  'Plongée — créer',
  'dive.update':  'Plongée — sauvegarder',
  'dive.delete':  'Plongée — supprimer',
  'dive.drive':   'Plongée — déposer sur Drive',
  // Alias legacy (anciennes entrées en outbox migrées)
  'archive.create': 'Plongée — enregistrer',
  'archive.drive':  'Plongée — déposer sur Drive',
  'diver.create':   'Plongeur — créer',
  'diver.update':   'Plongeur — modifier',
  'diver.delete':   'Plongeur — supprimer',
  'site.create':    'Site — créer',
  'site.update':    'Site — modifier',
  'site.delete':    'Site — supprimer',
};

function formatAge(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60)     return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)     return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h`;
}

function describePayload(item) {
  const p = item.payload || {};
  switch (item.kind) {
    case 'dive.create':
    case 'dive.update':
    case 'dive.delete':
    case 'dive.drive':
    case 'archive.create': return p.site_nom || (p.payload?.site_nom) || 'Plongée';
    case 'archive.drive':  return p.site_nom || 'Plongée';
    case 'diver.create':
    case 'diver.update':   return `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Plongeur';
    case 'diver.delete':   return 'Plongeur supprimé';
    case 'site.create':
    case 'site.update':    return p.nom || 'Site';
    case 'site.delete':    return 'Site supprimé';
    default:               return item.kind;
  }
}

function SyncDrawer({ items, online, onClose, onForceSync }) {
  // Tick toutes les secondes pour ré-afficher les âges et les compte-à-rebours.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Échap pour fermer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const now = Date.now();

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 1100, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface)', width: 'min(440px, 100%)', height: '100%',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase',
                          letterSpacing: '0.06em', marginBottom: 3 }}>
              Synchronisation
            </div>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {items.length === 0
                ? (online ? 'Tout est à jour' : 'Aucune action en attente')
                : `${items.length} action${items.length > 1 ? 's' : ''} en attente`}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{
            background: 'transparent', border: 0, fontSize: 22, cursor: 'pointer',
            color: 'var(--ink-3)', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--line)',
                      background: online ? 'rgba(45,134,83,0.06)' : 'rgba(224,120,86,0.08)',
                      fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {online ? (
            items.length === 0
              ? <>Votre connexion est active. Toutes vos modifications ont été
                  envoyées au serveur.</>
              : <>Connexion active. Les actions ci-dessous sont envoyées au
                  serveur en arrière-plan.</>
          ) : (
            <>● <b>Hors ligne</b>. Vos actions sont conservées localement et
              seront envoyées <b>automatiquement</b> dès que la connexion revient.
              La fiche PDF et le dépôt Google Drive de chaque plongée seront
              produits à ce moment.</>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {items.length === 0 && (
            <div style={{ padding: '24px 22px', color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
              Aucune action en attente.
            </div>
          )}
          {items.map((it) => {
            const eta = (it.nextRetryAt || 0) - now;
            const failed = it.attempts > 0;
            return (
              <div key={it.id} style={{
                padding: '12px 22px', borderBottom: '1px solid var(--line)',
                display: 'grid', gap: 4,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {KIND_LABELS[it.kind] || it.kind}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--t-mono)' }}>
                    il y a {formatAge(now - it.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {describePayload(it)}
                </div>
                {failed && (
                  <div style={{ fontSize: 11, color: 'var(--coral, #e07856)', lineHeight: 1.4 }}>
                    Échec {it.attempts}× — {it.lastError || 'erreur inconnue'}
                    {eta > 0 && (online
                      ? <> · prochain essai dans {formatAge(eta)}</>
                      : <> · sera retenté à la reconnexion</>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)',
                      display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn primary"
            onClick={onForceSync}
            disabled={!online || items.length === 0}
            title={!online ? 'Hors ligne — impossible de forcer maintenant' :
                   items.length === 0 ? 'Rien à synchroniser' : undefined}>
            ↻ Forcer la synchronisation
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// Export to window for cross-file usage
// =========================================================================
Object.assign(window, {
  Pill, Ref, CdsLink, withCdsLinks, Alert, Opt, Toggle, Field, Question,
  formatDateTime, diverFullName, getDiver,
  SyncDrawer,
});
