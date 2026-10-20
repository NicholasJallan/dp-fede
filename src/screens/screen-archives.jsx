// DP Assistant — Historique des plongées archivées (lecture seule), avec
// les PDF archivés par le club (fiche, check-list) et leur état.

import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from '../components/components.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { formatDateTime } from '../components/format.js';
import { DiveListSkeleton } from './home-parts.jsx';
import { sortMembresForFiche } from '../domain/index.js';
import { api } from '../api/api.js';
import { DiveDocuments, documentStatus } from './archives/dive-documents.jsx';

const parse = (v, fallback) => (typeof v === 'string' ? JSON.parse(v) : v) || fallback;

function ArchiveDetail({ item, onBack }) {
  const answers = parse(item.answers, {});
  const palanquees = parse(item.palanquees, []);
  const depart = [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(', ') || '—';
  const rows = [
    ['Site', item.site_nom || '—'],
    ['Date', formatDateTime(item.date_plongee)],
    ['DP', `${item.dp_nom || '—'} (${item.dp_qual || '—'})`],
    ['Activité', item.activite || '—'],
    ['Milieu', answers.milieu || '—'],
    ['Départ', depart],
    ['Profondeur max', answers.prof_max || '—'],
  ];
  return (
    <div>
      <div className="page-head">
        <button type="button" className="btn mb-3" onClick={onBack}><Icon.ChevronLeft />Retour à l'historique</button>
        <p className="step-tag">Archive du {formatDateTime(item.date_plongee)}</p>
        <h1>{item.site_nom || 'Site non renseigné'}</h1>
        {item.drive_link && (
          <div className="page-head-actions">
            <a className="btn" href={item.drive_link} target="_blank" rel="noopener noreferrer"><Icon.External />Ouvrir sur Google Drive</a>
          </div>
        )}
      </div>

      <section className="card" aria-labelledby="arch-info">
        <div className="card-head"><h2 id="arch-info">Informations générales</h2></div>
        <div className="card-body">
          <div className="kv-rows">{rows.map(([k, v]) => <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
        </div>
      </section>

      {palanquees.length > 0 && (
        <section className="card" aria-labelledby="arch-pals">
          <div className="card-head"><h2 id="arch-pals">Palanquées</h2></div>
          <div className="card-body flush">
            {palanquees.map((p, pi) => (
              <div key={p.id || pi} className="pal-summary">
                <div className="pal-summary-head">
                  <span>P{pi + 1}</span><span>{p.profMax} m</span><span>{p.duree} min</span>
                  <span>DTR {p.dtr != null ? `${p.dtr} min` : '—'}</span><span>{(p.melanges || []).join(', ') || 'Air'}</span>
                </div>
                <ul>
                  {sortMembresForFiche(p.membres || []).map((m, mi) => (
                    <li key={mi}>
                      <span className="pill">{m.aptitude || '—'}</span>
                      <span>{m.prenom || ''} {(m.nom || '?').toUpperCase()}</span>
                      {m.licence && <span className="num muted small">{m.licence}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <DiveDocuments dive={item} />

      {answers.meteo && (
        <section className="card" aria-labelledby="arch-meteo">
          <div className="card-head"><h2 id="arch-meteo">Conditions</h2></div>
          <div className="card-body"><p>{answers.meteo}</p></div>
        </section>
      )}
    </div>
  );
}

// État court des PDF archivés côté serveur (documents_status).
const DOC_SHORT = { pending: 'PDF en cours', ok: 'PDF archivés', error: 'PDF en erreur' };

function ArchiveState({ row, loading }) {
  if (loading) return <span className="state"><span className="spin"><Icon.Refresh /></span>Ouverture…</span>;
  if (row._pending) return <span className="state text-warn"><StatusIcon tone="warn" />En attente d'envoi</span>;
  const doc = DOC_SHORT[row.documents_status];
  const docTone = documentStatus(row.documents_status).tone;
  return (
    <span className="state">
      {doc && <span className={docTone === 'ok' ? 'text-ok' : docTone === 'warn' ? 'text-warn' : ''}><StatusIcon tone={docTone} /> {doc}</span>}
      {row.synced && !row.drive_synced && !row.drive_link && <span className="text-warn"><StatusIcon tone="warn" /> Dépôt Drive à faire</span>}
      {row.drive_link && <span className="text-ok"><StatusIcon tone="ok" /> Sur Drive</span>}
    </span>
  );
}

function ScreenArchives() {
  const [archives, setArchives] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    api.dives.listArchived()
      .then(rows => setArchives(rows))
      .catch(err => { setError(err.message); setArchives([]); });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('dp:dataChanged', refresh);
    window.addEventListener('dp:syncDone', refresh);
    return () => {
      window.removeEventListener('dp:dataChanged', refresh);
      window.removeEventListener('dp:syncDone', refresh);
    };
  }, [refresh]);

  const openArchive = async (id) => {
    setLoadingId(id); setError('');
    try { setSelected(await api.dives.get(id)); }
    catch (err) { setError(`Ouverture de l'archive impossible : ${err.message}`); }
    finally { setLoadingId(null); }
  };

  if (selected) return <ArchiveDetail item={selected} onBack={() => setSelected(null)} />;

  return (
    <div>
      <div className="page-head">
        <h1>Plongées archivées</h1>
        <p>Consultation seule : une plongée archivée n'est plus modifiable.</p>
      </div>

      {error && <Alert tone="warn">{error}</Alert>}

      <div className="dive-list">
        {archives === null && <DiveListSkeleton rows={3} />}
        {archives?.length === 0 && (
          <div className="empty-state"><b>Aucune plongée archivée</b><span>Les plongées terminées apparaissent ici après l'étape d'archivage.</span></div>
        )}
        {archives?.map(row => {
          const openable = !row._pending; // pas encore d'identifiant serveur
          return (
            <button key={row.client_uuid || row.id} type="button" className="archive-row"
              onClick={() => openable && row.id && openArchive(row.id)}
              disabled={loadingId !== null || !openable}
              title={!openable ? 'Disponible après synchronisation' : undefined}>
              <span className="site">{row.site_nom || 'Site non renseigné'}</span>
              <span className="date">{formatDateTime(row.date_plongee)}</span>
              <span className="sub">DP {row.dp_nom || '—'} ({row.dp_qual || '—'}){row.activite ? `, ${row.activite}` : ''}</span>
              <ArchiveState row={row} loading={loadingId === row.id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { ScreenArchives };
