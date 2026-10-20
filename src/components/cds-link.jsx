// DP Assistant — Liens vers les articles du Code du sport (badge + tooltip Légifrance).

import React, { useState, useMemo, useRef } from 'react';
import { CDS_ARTICLES, parseCdsRefs } from '../domain/index.js';

// =========================================================================
// CdsLink — lien vers un article du Code du Sport
// Affiche un badge cliquable avec tooltip de résumé + lien Légifrance.
// Le tooltip est positionné en fixed via JS pour s'échapper des conteneurs
// parents qui ont overflow: hidden (cas .cl-phase, .card, modales, etc.).
// =========================================================================
function CdsBadge({ articleNumber, compact = false }) {
  const info = CDS_ARTICLES[articleNumber];
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
    if (refText) return parseCdsRefs(refText);
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
  const refs = parseCdsRefs(text);
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

export { CdsBadge, CdsLink, withCdsLinks };
