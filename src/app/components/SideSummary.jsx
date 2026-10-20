// Synthèse de la plongée (étapes 1 à 3) : colonne latérale ≥ 980 px,
// encart repliable au-dessus du contenu en dessous.

import React, { useState } from 'react';
import { Pill, formatDateTime } from '../../components/components.jsx';
import { Icon } from '../../components/icons.jsx';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

function SummaryLine({ k, children, num = false }) {
  return (
    <div className="summary-line">
      <span className="k">{k}</span>
      <span className={`v ${num ? 'num' : ''}`}>{children}</span>
    </div>
  );
}

const CONTEXTS = [
  ['air', 'Air'],
  ['nitrox', 'Nitrox'],
  ['trimix', 'Trimix'],
  ['recycleur', 'Recycleur'],
  ['depart_bateau', 'Bateau'],
  ['depart_bord', 'Bord'],
  ['mineurs', 'Mineurs'],
  ['handisub', 'Handisub'],
  ['etrangers', 'Brevets étrangers'],
];

function ActiveContexts({ answers }) {
  const active = CONTEXTS.filter(([k]) => answers[k]);
  if (active.length === 0) return <p className="muted small">Aucun contexte renseigné pour l'instant.</p>;
  return (
    <div className="row tight">
      {active.map(([k, label]) => (
        <Pill key={k}>{label}</Pill>
      ))}
    </div>
  );
}

function summaryData(answers, palanquees, sites) {
  const selectedSite = sites.find((s) => s.id === answers.site_id);
  return {
    site: selectedSite?.nom || answers.site_nom || answers.site || '—',
    depart: [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(', ') || '—',
    plongeurs: palanquees.reduce((n, p) => n + p.membres.length, 0),
  };
}

function SummaryLines({ answers, palanquees, data }) {
  return (
    <>
      <SummaryLine k="Site">{data.site}</SummaryLine>
      <SummaryLine k="Date">{answers.date ? formatDateTime(answers.date) : '—'}</SummaryLine>
      <SummaryLine k="DP">{answers.dp_nom ? `${answers.dp_nom} (${answers.dp_qual || '—'})` : '—'}</SummaryLine>
      <SummaryLine k="Activité">{answers.activite || '—'}</SummaryLine>
      <SummaryLine k="Milieu">{answers.milieu || '—'}</SummaryLine>
      <SummaryLine k="Départ">{data.depart}</SummaryLine>
      <SummaryLine k="Profondeur max" num>
        {answers.prof_max || '—'}
      </SummaryLine>
      <SummaryLine k="Palanquées" num>
        {palanquees.length}
      </SummaryLine>
      <SummaryLine k="Plongeurs" num>
        {data.plongeurs}
      </SummaryLine>
    </>
  );
}

export function SideSummary({ answers, palanquees, sites }) {
  const data = summaryData(answers, palanquees, sites);
  return (
    <aside className="side" aria-label="Synthèse de la plongée">
      <section className="card">
        <div className="card-head">
          <h2>Synthèse</h2>
        </div>
        <div className="card-body dense">
          <SummaryLines answers={answers} palanquees={palanquees} data={data} />
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Contextes actifs</h2>
        </div>
        <div className="card-body">
          <ActiveContexts answers={answers} />
        </div>
      </section>
    </aside>
  );
}

export function SideSummaryCompact({ answers, palanquees, sites }) {
  const [open, setOpen] = useState(false);
  const data = summaryData(answers, palanquees, sites);
  return (
    <section className="side-compact" aria-label="Synthèse de la plongée">
      <button
        type="button"
        className="side-compact-toggle"
        aria-expanded={open}
        aria-controls="side-compact-body"
        onClick={() => setOpen((o) => !o)}
      >
        Synthèse
        <span className="digest">
          {data.site}, {plural(palanquees.length, 'palanquée')}, {plural(data.plongeurs, 'plongeur')}
        </span>
        <Icon.ChevronDown />
      </button>
      {open && (
        <div className="side-compact-body" id="side-compact-body">
          <SummaryLines answers={answers} palanquees={palanquees} data={data} />
          <div className="mt-3">
            <ActiveContexts answers={answers} />
          </div>
        </div>
      )}
    </section>
  );
}
