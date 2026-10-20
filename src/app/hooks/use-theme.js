// DP Assistant — Thème Soleil (clair) / Nuit (cabine).
//
// Sans choix explicite, le thème suit prefers-color-scheme (CSS seul).
// La bascule de la barre haute pose data-theme sur <html> et mémorise le
// choix (localStorage, protégé : mode privé ou stockage bloqué → non persisté).
// public/inline-boot.js relit ce choix avant le premier rendu.

import { useState, useEffect, useCallback } from 'react';
import { useMediaQuery } from './use-media-query.js';

const KEY = 'dp-theme';
const THEME_COLOR = { light: '#0B2E4A', dark: '#01070D' };

function readChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

function writeChoice(v) {
  try { localStorage.setItem(KEY, v); } catch { /* stockage indisponible : choix limité à la session */ }
}

export function useTheme() {
  const [choice, setChoice] = useState(readChoice);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = choice || (systemDark ? 'dark' : 'light');

  useEffect(() => {
    const root = document.documentElement;
    if (choice) root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  }, [choice, theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    writeChoice(next);
    setChoice(next);
  }, [theme]);

  return { theme, toggle };
}
