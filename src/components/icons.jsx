// DP Assistant — Icônes SVG (trait 2 px, currentColor) et signalétique d'état.
//
// StatusIcon applique la signalétique de sécurité ISO 3864 : la forme porte
// l'information autant que la couleur.
//   ok   → ● disque     (conforme)
//   warn → ▲ triangle   (alerte)
//   err  → ■ carré      (bloquant)
//   info → ○ cercle     (information / en cours)

import React from 'react';

const SHAPES = {
  ok:    <circle cx="8" cy="8" r="6.5" />,
  warn:  <path d="M8 1.2 15.2 14.3H.8Z" />,
  err:   <rect x="1.5" y="1.5" width="13" height="13" rx="1" />,
  info:  <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.4" />,
  muted: <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.2" />,
};

export const STATUS_LABELS = { ok: 'Conforme', warn: 'Alerte', err: 'Bloquant', info: 'Information', muted: 'Inactif' };

/** Forme d'état. `label` : texte lu par les lecteurs d'écran (sinon décoratif). */
export function StatusIcon({ tone = 'info', label }) {
  return (
    <svg className={`sicon sicon--${tone}`} viewBox="0 0 16 16" fill="currentColor"
      role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}
      focusable="false">
      {SHAPES[tone] || SHAPES.info}
    </svg>
  );
}

function Svg({ children, size = '1.2em' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const Icon = {
  ChevronLeft:  (p) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>,
  ChevronRight: (p) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>,
  ChevronDown:  (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>,
  Check:        (p) => <Svg {...p}><path d="M4 12.5 9.5 18 20 6.5" /></Svg>,
  Lock:         (p) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>,
  Phone:        (p) => <Svg {...p}><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2Z" /></Svg>,
  Sun:          (p) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>,
  Moon:         (p) => <Svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" /></Svg>,
  Menu:         (p) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>,
  Home:         (p) => <Svg {...p}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></Svg>,
  Plus:         (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  Play:         (p) => <Svg {...p}><path d="M7 4.5v15l12-7.5Z" fill="currentColor" stroke="none" /></Svg>,
  Stop:         (p) => <Svg {...p}><rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" /></Svg>,
  Edit:         (p) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16Z" /></Svg>,
  Copy:         (p) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></Svg>,
  Trash:        (p) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>,
  Print:        (p) => <Svg {...p}><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" /><path d="M7 14h10v7H7Z" /></Svg>,
  Download:     (p) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>,
  External:     (p) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></Svg>,
  Refresh:      (p) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" /></Svg>,
  Logout:       (p) => <Svg {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" /></Svg>,
  User:         (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>,
  History:      (p) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" /></Svg>,
  Users:        (p) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></Svg>,
  Pin:          (p) => <Svg {...p}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></Svg>,
};

/** Marque « DP Assistant » : cadran de profondimètre stylisé. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 4v4M28 16h-4M16 28v-4M4 16h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path className="needle" d="M16 16 22 10" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.5" fill="currentColor" />
    </svg>
  );
}
