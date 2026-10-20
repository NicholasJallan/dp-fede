// Colonne latérale « Synthèse » + « Contextes actifs » des étapes 1 à 3.

import React from 'react';
import { Pill, formatDateTime } from '../../components/components.jsx';

function SummaryLine({ k, children }) {
  return <div className="summary-line"><span className="k">{k}</span><span className="v">{children}</span></div>;
}

function ActiveContexts({ answers }) {
  return (
    <div className="row tight" style={{ gap:6 }}>
      {answers.air           && <Pill tone="marine">AIR</Pill>}
      {answers.nitrox        && <Pill tone="kelp">NITROX</Pill>}
      {answers.trimix        && <Pill tone="sun">TRIMIX</Pill>}
      {answers.recycleur     && <Pill tone="coral">RECYCLEUR</Pill>}
      {answers.depart_bateau && <Pill>BATEAU</Pill>}
      {answers.depart_bord   && <Pill>BORD</Pill>}
      {answers.mineurs       && <Pill>MINEURS</Pill>}
      {answers.handisub      && <Pill>HANDISUB</Pill>}
      {answers.etrangers     && <Pill>BREVETS ÉTR.</Pill>}
      {!answers.air && !answers.nitrox && !answers.trimix && !answers.recycleur
       && !answers.depart_bateau && !answers.depart_bord
       && <span className="muted">À renseigner →</span>}
    </div>
  );
}

export function SideSummary({ answers, palanquees, sites }) {
  const selectedSite = sites.find(s => s.id === answers.site_id);
  const siteName = selectedSite?.nom || answers.site_nom || answers.site || '—';
  const departParts = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean);
  const depart = departParts.join(' / ') || '—';
  return (
    <div className="side">
      <div className="card">
        <div className="card-head"><h2>Synthèse</h2></div>
        <div className="card-body">
          <SummaryLine k="Site">{siteName}</SummaryLine>
          <SummaryLine k="Date">{answers.date ? formatDateTime(answers.date) : "—"}</SummaryLine>
          <SummaryLine k="DP">{answers.dp_nom || "—"} <small className="muted">({answers.dp_qual || "—"})</small></SummaryLine>
          <SummaryLine k="Activité">{answers.activite || "—"}</SummaryLine>
          <SummaryLine k="Milieu">{answers.milieu || "—"}</SummaryLine>
          <SummaryLine k="Départ">{depart}</SummaryLine>
          <SummaryLine k="Prof. max">{answers.prof_max || "—"}</SummaryLine>
          <SummaryLine k="Palanquées">{palanquees.length}</SummaryLine>
          <SummaryLine k="Plongeurs">{palanquees.reduce((n, p) => n + p.membres.length, 0)}</SummaryLine>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Contextes actifs</h2></div>
        <div className="card-body">
          <ActiveContexts answers={answers} />
        </div>
      </div>
    </div>
  );
}
