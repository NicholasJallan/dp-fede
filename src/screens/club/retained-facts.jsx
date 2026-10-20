// DP Assistant — Fiches de sécurité conservées après une suppression
// (obligation légale d'un an, art. A322-72 du Code du sport).

import React from 'react';

export function RetainedFacts({ retained }) {
  return (
    <dl className="kv-list">
      <div>
        <dt>Fiches de sécurité conservées</dt>
        <dd className="num">{retained.fiches}</dd>
      </div>
      <div>
        <dt>Conservées jusqu'au</dt>
        <dd className="num">{retained.untilLabel}</dd>
      </div>
      {retained.clubs > 0 && (
        <div>
          <dt>Clubs concernés</dt>
          <dd className="num">{retained.clubs}</dd>
        </div>
      )}
      <div>
        <dt>Motif</dt>
        <dd>Obligation légale, art. A322-72 du Code du sport</dd>
      </div>
    </dl>
  );
}
