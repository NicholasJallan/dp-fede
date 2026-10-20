// DP Assistant — Rapport d'import : compteurs, format détecté, tableau par
// ligne (créés / mis à jour / inchangés / erreurs) filtrable.

import React, { useState } from 'react';
import { StatusIcon } from '../../components/icons.jsx';
import {
  IMPORT_ACTIONS,
  IMPORT_FILTERS,
  countByFilter,
  describeFormat,
  filterImportRows,
  importRows,
  summarizeImport,
} from '../../club/import-report.js';

function Counters({ s }) {
  const items = [
    { k: 'Créés', v: s.created, tone: 'ok' },
    { k: 'Mis à jour', v: s.updated, tone: 'info' },
    { k: 'Inchangés', v: s.unchanged, tone: 'muted' },
    { k: 'Lignes en erreur', v: s.errorLines, tone: s.errors > 0 ? 'err' : 'muted' },
  ];
  return (
    <div className="kpi-grid" role="list" aria-label="Résultat par ligne">
      {items.map((it) => (
        <div key={it.k} role="listitem" className={`kpi ${it.tone !== 'muted' ? `is-${it.tone}` : ''}`}>
          <span className="v">{it.v}</span>
          <span className="k">
            <StatusIcon tone={it.tone} />
            {it.k}
          </span>
        </div>
      ))}
    </div>
  );
}

function FormatLine({ report, total }) {
  const recognized = Object.keys(report.columns?.recognized || {});
  const ignored = report.columns?.ignored || [];
  return (
    <div className="import-meta">
      <span>
        <span className="num">{total}</span> ligne{total > 1 ? 's' : ''} lue{total > 1 ? 's' : ''}
      </span>
      {describeFormat(report) && <span>{describeFormat(report)}</span>}
      {recognized.length > 0 && <span>Colonnes reconnues : {recognized.join(', ')}</span>}
      {ignored.length > 0 && <span>Ignorées : {ignored.join(', ')}</span>}
    </div>
  );
}

function Filters({ filter, setFilter, counts }) {
  return (
    <div className="import-filters">
      <div className="seg" role="radiogroup" aria-label="Afficher">
        {IMPORT_FILTERS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="count">{counts[f.id] || 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TONE_CLASS = { ok: 'text-ok', err: 'text-err', info: '', muted: 'muted' };

function ReportRow({ r }) {
  const meta = IMPORT_ACTIONS[r.action];
  return (
    <tr className={r.action === 'error' ? 'is-error' : undefined}>
      <td className="num" data-label="Ligne">
        <span>{r.line}</span>
      </td>
      <td data-label="Résultat">
        <span className={`state ${TONE_CLASS[meta.tone]}`}>
          <StatusIcon tone={meta.tone} />
          {meta.label}
        </span>
      </td>
      <td data-label="Plongeur">
        <span>{r.name || '—'}</span>
      </td>
      <td data-label="Détail">
        <div>
          {r.detail}
          {r.warnings.map((w, i) => (
            <span key={i} className="note">
              <StatusIcon tone="warn" />
              {w}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

export function ImportReportView({ report, caption }) {
  const [filter, setFilter] = useState('all');
  const rows = importRows(report);
  const s = summarizeImport(report);
  const shown = filterImportRows(rows, filter);
  return (
    <div>
      <Counters s={s} />
      <FormatLine report={report} total={s.total} />
      <Filters filter={filter} setFilter={setFilter} counts={countByFilter(rows)} />
      <div className="table-wrap">
        <table className="data-table stack">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="num">
                Ligne
              </th>
              <th scope="col">Résultat</th>
              <th scope="col">Plongeur</th>
              <th scope="col">Détail</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <ReportRow key={r.key} r={r} />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} data-label="">
                  Aucune ligne dans cette catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
