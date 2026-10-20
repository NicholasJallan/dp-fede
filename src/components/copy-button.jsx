// DP Assistant — Bouton « Copier » (presse-papiers) avec confirmation
// annoncée aux lecteurs d'écran. Repli : sélection du champ associé et
// copie système si l'API Clipboard est refusée (contexte non sécurisé).

import React, { useEffect, useRef, useState } from 'react';
import { Icon, StatusIcon } from './icons.jsx';

const COPIED_MS = 4000;

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* API refusée ou indisponible : repli sur la sélection */ }
  try {
    input?.focus();
    input?.select();
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/**
 * @param {object} props
 * @param {string} props.text           texte copié
 * @param {React.RefObject<HTMLInputElement>} [props.inputRef]  champ sélectionné en repli
 * @param {string} [props.label]
 */
export function CopyButton({ text, inputRef, label = 'Copier le lien' }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    const ok = await copyText(text, inputRef?.current);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), COPIED_MS);
  };

  return (
    <>
      <button type="button" className="btn primary" onClick={onCopy}>
        {state === 'copied' ? <><Icon.Check />Copié</> : <><Icon.Copy />{label}</>}
      </button>
      <span className="sr-only" role="status">
        {state === 'copied' ? 'Lien copié dans le presse-papiers.' : ''}
      </span>
      {state === 'failed' && (
        <span className="small text-warn" role="alert">
          <StatusIcon tone="warn" /> Copie impossible : sélectionnez le lien et copiez-le manuellement.
        </span>
      )}
    </>
  );
}
