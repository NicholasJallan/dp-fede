// DP Assistant — Dialogue modal unique (remplace toutes les modales inline,
// confirm() et alert() natifs).
//
//   <Dialog title="…" onClose={…} footer={<>…boutons…</>}>contenu</Dialog>
//
// Accessibilité : role="dialog", aria-modal, titre relié (aria-labelledby),
// focus piégé dans le dialogue puis restauré sur l'élément d'origine à la
// fermeture, Échap et clic hors zone ferment (sauf dismissible={false}).
// Le premier élément portant data-autofocus reçoit le focus à l'ouverture.

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StatusIcon } from './icons.jsx';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

// Verrou de défilement partagé entre dialogues imbriqués.
let openCount = 0;
function lockScroll() {
  openCount += 1;
  if (openCount === 1) document.documentElement.style.overflow = 'hidden';
}
function unlockScroll() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) document.documentElement.style.overflow = '';
}

function initialTarget(node) {
  return node.querySelector('[data-autofocus]') || focusables(node.querySelector('.dialog-body') || node)[0] || node;
}

function trapTab(e, node) {
  const items = focusables(node);
  if (items.length === 0) {
    e.preventDefault();
    node.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.footer]
 * @param {'sm'|'md'|'lg'} [props.size]
 * @param {'err'|'warn'|'urgence'|null} [props.tone]  teinte de l'en-tête
 * @param {'ok'|'warn'|'err'|'info'} [props.icon]    forme d'état devant le titre
 * @param {'drawer'} [props.variant]
 * @param {boolean} [props.dismissible]  Échap / clic hors zone autorisés
 * @param {string} [props.className]
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  tone = null,
  icon = null,
  variant = null,
  dismissible = true,
  className = '',
  describedBy,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    lockScroll();
    const node = ref.current;
    if (node) initialTarget(node).focus();
    return () => {
      unlockScroll();
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      onCloseRef.current?.();
    } else if (e.key === 'Tab' && ref.current) {
      trapTab(e, ref.current);
    }
  };

  const onScrimDown = (e) => {
    if (dismissible && e.target === e.currentTarget) onCloseRef.current?.();
  };

  const classes = ['dialog', size !== 'md' && size, tone && `tone-${tone}`, variant, className]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className={`dialog-scrim ${variant || ''}`} onMouseDown={onScrimDown}>
      <div
        ref={ref}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-head">
          <h2 id={titleId}>
            {icon && <StatusIcon tone={icon} />}
            {title}
          </h2>
          {dismissible && (
            <button type="button" className="x" aria-label="Fermer" onClick={() => onCloseRef.current?.()}>
              ×
            </button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation à deux boutons. Le bouton d'annulation reçoit le focus quand
 * l'action est destructive (tone="danger"), sinon le bouton de confirmation.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  busy = false,
  icon,
  tone,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      size="sm"
      icon={icon}
      tone={tone}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} data-autofocus={danger ? '' : undefined}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'danger solid' : 'primary'}`}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus={danger ? undefined : ''}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
