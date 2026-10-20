// DP Assistant — Statistiques du club (plongées archivées) : période,
// plongées par type, plongeurs distincts, heures cumulées, export CSV.

import React, { useCallback, useEffect, useState } from 'react';
import { useClub } from '../../club/club-context.jsx';
import { useOnline } from '../../offline/use-online.jsx';
import { useToasts } from '../../components/toast.jsx';
import { Alert, Notice } from '../../components/components.jsx';
import { Icon } from '../../components/icons.jsx';
import { formatDate } from '../../components/format.js';
import { DiveListSkeleton } from '../home-parts.jsx';
import { api } from '../../api/api.js';
import { saveBlob } from '../../api/download.js';
import { describeApiError } from '../../club/permissions.js';
import { isoDate, seasonRange } from '../../club/season.js';

const TYPES = [
  ['exploration', 'Exploration'],
  ['guidee', 'Guidée'],
  ['formation', 'Formation'],
  ['bapteme', 'Baptême'],
];

const hours = (h) => (Number(h) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function periodPresets(today = new Date()) {
  return [
    { id: 'season', label: 'Saison en cours', ...seasonRange(today, 0) },
    { id: 'previous', label: 'Saison précédente', ...seasonRange(today, -1) },
    { id: 'year', label: `Année ${today.getFullYear()}`, from: `${today.getFullYear()}-01-01`, to: isoDate(today) },
  ];
}

function PeriodForm({ period, setPeriod, onApply, busy, online }) {
  const presets = periodPresets();
  const submit = (e) => { e.preventDefault(); onApply(period); };
  return (
    <form className="card" aria-labelledby="stats-period" onSubmit={submit}>
      <div className="card-head"><h2 id="stats-period">Période</h2><span className="hint">Saison FFESSM : 15/09 → 14/09</span></div>
      <div className="card-body">
        <div className="period-form">
          <div className="field">
            <label htmlFor="stats-from">Du</label>
            <input id="stats-from" className="input mono" type="date" value={period.from} max={period.to || undefined}
              onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="stats-to">Au</label>
            <input id="stats-to" className="input mono" type="date" value={period.to} min={period.from || undefined}
              onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} />
          </div>
          <button type="submit" className="btn primary" disabled={busy || !online}>Afficher</button>
        </div>
        <div className="period-presets">
          {presets.map(p => (
            <button key={p.id} type="button" className="btn" disabled={busy || !online}
              onClick={() => { setPeriod({ from: p.from, to: p.to }); onApply({ from: p.from, to: p.to }); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

function Kpis({ s }) {
  const items = [
    ['Plongées archivées', s.plongees],
    ['Palanquées', s.palanquees],
    ['Plongeurs distincts', s.plongeurs_distincts],
    ['Baptêmes', s.baptemes],
    ['Participations', s.participations],
    ['Heures-plongeur', hours(s.heures_cumulees)],
  ];
  return (
    <div className="kpi-grid" role="list" aria-label="Indicateurs de la période">
      {items.map(([k, v]) => (
        <div key={k} className="kpi" role="listitem"><span className="v">{v ?? 0}</span><span className="k">{k}</span></div>
      ))}
    </div>
  );
}

function ByType({ s }) {
  return (
    <section className="card" aria-labelledby="stats-types">
      <div className="card-head"><h2 id="stats-types">Par type</h2><span className="hint">Une plongée compte pour chaque type de palanquée qu'elle comporte</span></div>
      <div className="card-body flush">
        <table className="data-table">
          <thead><tr><th scope="col">Type</th><th scope="col" className="num">Plongées</th><th scope="col" className="num">Palanquées</th></tr></thead>
          <tbody>
            {TYPES.map(([key, label]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className="num">{s.plongees_par_type?.[key] ?? 0}</td>
                <td className="num">{s.palanquees_par_type?.[key] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ByDiver({ rows }) {
  return (
    <section className="card" aria-labelledby="stats-divers">
      <div className="card-head"><h2 id="stats-divers">Par plongeur</h2><span className="hint num">{rows.length}</span></div>
      {rows.length === 0
        ? <div className="card-body"><p className="muted">Aucune participation sur la période.</p></div>
        : (
          <div className="table-wrap">
            <table className="data-table stack">
              <thead><tr><th scope="col">Plongeur</th><th scope="col">Licence</th><th scope="col" className="num">Plongées</th><th scope="col" className="num">Dirigées (DP)</th><th scope="col" className="num">Heures</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.diver_id || `${r.nom}-${r.prenom}`}>
                    <td data-label="Plongeur"><span>{[r.prenom, (r.nom || '').toUpperCase()].filter(Boolean).join(' ')}</span></td>
                    <td data-label="Licence" className="mono"><span>{r.licence || '—'}</span></td>
                    <td data-label="Plongées" className="num"><span>{r.plongees}</span></td>
                    <td data-label="Dirigées (DP)" className="num"><span>{r.dp}</span></td>
                    <td data-label="Heures" className="num"><span>{hours(r.heures)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

function useStats(online) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (period) => {
    setBusy(true);
    try { setStats(await api.club.stats(period)); setError(null); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (online) load({}); }, [online, load]);
  return { stats, error, busy, load };
}

export function ScreenStats({ onNavigate }) {
  const club = useClub();
  const online = useOnline();
  const { showToast } = useToasts();
  const { stats, error, busy, load } = useStats(online);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (stats?.from) setPeriod(p => (p.from ? p : { from: stats.from, to: stats.to }));
  }, [stats?.from, stats?.to]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await api.club.statsCsv({ from: stats?.from, to: stats?.to });
      saveBlob(blob, filename);
    } catch (err) {
      showToast({ tone: 'err', title: 'Export impossible', body: describeApiError(err, 'exporter les statistiques') });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <button type="button" className="btn mb-3" onClick={() => onNavigate('club')}><Icon.ChevronLeft />Retour au club</button>
        <h1>Statistiques du club</h1>
        <p>Plongées archivées de {club.club?.nom || 'votre club'} : activité, plongeurs, heures cumulées. Utile pour l'assemblée générale.</p>
      </div>
      {!online && <Notice tone="warn" title="Hors ligne">Les statistiques sont calculées par le serveur : connexion requise.</Notice>}
      <PeriodForm period={period} setPeriod={setPeriod} onApply={load} busy={busy} online={online} />
      {error && <Alert tone="err" title="Statistiques indisponibles">{describeApiError(error, 'consulter les statistiques')}</Alert>}
      {busy && !stats && <DiveListSkeleton rows={2} />}
      {stats && (
        <div className="mt-4">
          <div className="row-between">
            <p className="stats-period">Du {formatDate(stats.from)} au {formatDate(stats.to)}</p>
            <button type="button" className="btn" onClick={exportCsv} disabled={exporting || !online}>
              <Icon.Download />{exporting ? 'Export…' : 'Exporter en CSV'}
            </button>
          </div>
          <Kpis s={stats} />
          <ByType s={stats} />
          <ByDiver rows={stats.par_plongeur || []} />
        </div>
      )}
    </div>
  );
}
