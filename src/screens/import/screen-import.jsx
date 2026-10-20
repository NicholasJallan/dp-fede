// DP Assistant — Import de l'annuaire (CSV, export VPDive) : simulation
// (dry_run) → rapport par ligne → confirmation → rapport final.

import React, { useId, useState } from 'react';
import { useClub } from '../../club/club-context.jsx';
import { useOnline } from '../../offline/use-online.jsx';
import { Alert, Notice, Opt, Field } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { api } from '../../api/api.js';
import { sync } from '../../offline/sync.js';
import { checkImportFile, summarizeImport } from '../../club/import-report.js';
import { describeApiError, roleLabel } from '../../club/permissions.js';
import { ImportHelp } from './import-help.jsx';
import { ImportReportView } from './import-report-view.jsx';

const PROFILES = [
  { value: 'auto', label: 'Détection automatique', hint: 'Tableur ou export dont les en-têtes suivent le format ci-dessous' },
  { value: 'vpdive', label: 'Export VPDive', hint: 'Intitulés VPDive supposés, source « vpdive »' },
];

const formatSize = (bytes) => (bytes < 1024 ? `${bytes} o` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} Ko`);

function importErrorText(err) {
  if (err?.status === 413) return `${err.message}. Découpez le fichier en plusieurs imports.`;
  if (err?.status === 422) return `${err.message}. Vérifiez la ligne d'en-têtes et le format (aide ci-dessous).`;
  return describeApiError(err, 'importer l\'annuaire');
}

function DropZone({ file, onFile, disabled }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    if (!disabled && e.dataTransfer?.files?.[0]) onFile(e.dataTransfer.files[0]);
  };
  return (
    <div className={`dropzone ${over ? 'is-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <input id={id} className="file-input" type="file" accept=".csv,.txt,text/csv,text/plain" disabled={disabled}
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
      <label htmlFor={id} className="btn primary"><Icon.Upload />{file ? 'Choisir un autre fichier' : 'Choisir un fichier CSV'}</label>
      {file
        ? <span className="file-name"><StatusIcon tone="ok" />{file.name} <span className="muted">({formatSize(file.size)})</span></span>
        : <span className="hint">ou déposez-le ici. CSV, 1 Mo maximum.</span>}
    </div>
  );
}

function ProfileChoice({ profile, setProfile }) {
  return (
    <Field label="Origine du fichier" labelOnly>
      {({ labelId }) => (
        <div className="opt-group opt-wide" role="radiogroup" aria-labelledby={labelId}>
          {PROFILES.map(p => (
            <Opt key={p.value} label={p.label} hint={p.hint} checked={profile === p.value} onClick={() => setProfile(p.value)} />
          ))}
        </div>
      )}
    </Field>
  );
}

function FileStep({ file, setFile, profile, setProfile, busy, online, onSimulate, error }) {
  return (
    <section className="card" aria-labelledby="imp-file">
      <div className="card-head"><span className="ix">1</span><h2 id="imp-file">Fichier à importer</h2></div>
      <div className="card-body">
        <DropZone file={file} onFile={setFile} disabled={busy} />
        <ProfileChoice profile={profile} setProfile={setProfile} />
        {error && <Alert tone="err" title="Import impossible">{error}</Alert>}
        <div className="row mt-3">
          <button type="button" className="btn primary lg" onClick={onSimulate} disabled={!file || busy || !online}>
            {busy ? <><span className="spin"><Icon.Refresh /></span>Analyse…</> : 'Simuler l\'import'}
          </button>
          <span className="small muted">Rien n'est enregistré avant la confirmation.</span>
        </div>
      </div>
    </section>
  );
}

function SimulationStep({ report, busy, online, onConfirm, onReset }) {
  const s = summarizeImport(report);
  return (
    <section className="card" aria-labelledby="imp-sim">
      <div className="card-head"><span className="ix">2</span><h2 id="imp-sim">Rapport de simulation</h2><span className="hint">Aucune donnée enregistrée</span></div>
      <div className="card-body">
        <ImportReportView report={report} caption="Simulation : résultat prévu pour chaque ligne du fichier (1 = en-têtes)." />
        {s.errors > 0 && (
          <Alert tone="warn">{s.errorLines} ligne{s.errorLines > 1 ? 's' : ''} en erreur ser{s.errorLines > 1 ? 'ont' : 'a'} ignorée{s.errorLines > 1 ? 's' : ''}. Corrigez le fichier et relancez la simulation pour les importer.</Alert>
        )}
        {!s.canConfirm && <Alert tone="info">Aucune fiche à créer ni à modifier : l'annuaire est déjà à jour.</Alert>}
        <div className="row mt-4">
          {s.canConfirm && (
            <button type="button" className="btn primary lg" onClick={onConfirm} disabled={busy || !online}>
              {busy ? 'Import en cours…' : `Confirmer l'import (${s.changes} fiche${s.changes > 1 ? 's' : ''})`}
            </button>
          )}
          <button type="button" className="btn" onClick={onReset} disabled={busy}>Changer de fichier</button>
        </div>
      </div>
    </section>
  );
}

function DoneStep({ report, onBack, onReset }) {
  const s = summarizeImport(report);
  return (
    <section className="card" aria-labelledby="imp-done">
      <div className="card-head"><span className="ix">3</span><h2 id="imp-done">Import terminé</h2></div>
      <div className="card-body">
        <div role="status">
          <Alert tone="ok" title="Annuaire mis à jour">
            {s.created} fiche{s.created > 1 ? 's' : ''} créée{s.created > 1 ? 's' : ''}, {s.updated} mise{s.updated > 1 ? 's' : ''} à jour, {s.unchanged} inchangée{s.unchanged > 1 ? 's' : ''}.
          </Alert>
        </div>
        <ImportReportView report={report} caption="Résultat de l'import pour chaque ligne du fichier." />
        <div className="row mt-4">
          <button type="button" className="btn primary" onClick={onBack}>Voir l'annuaire</button>
          <button type="button" className="btn" onClick={onReset}>Importer un autre fichier</button>
        </div>
      </div>
    </section>
  );
}

export function ScreenImport({ onNavigate, onImported }) {
  const club = useClub();
  const online = useOnline();
  const [file, setFileState] = useState(null);
  const [profile, setProfile] = useState('auto');
  const [simulation, setSimulation] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setFile = (f) => {
    const problem = checkImportFile(f);
    setError(problem); setSimulation(null); setResult(null);
    setFileState(problem ? null : f);
  };
  const reset = () => { setFileState(null); setSimulation(null); setResult(null); setError(''); };

  const run = async (dryRun) => {
    setBusy(true); setError('');
    try {
      const report = await api.divers.import(file, { dryRun, profile });
      if (dryRun) { setSimulation(report); return; }
      setResult(report); setSimulation(null);
      sync.trigger('divers-import');
      await onImported();
    } catch (err) {
      setError(importErrorText(err));
      if (!dryRun) setSimulation(null);
    } finally {
      setBusy(false);
    }
  };

  const back = () => onNavigate('admin-divers');
  const allowed = club.can('divers.import');

  return (
    <div>
      <div className="page-head">
        <button type="button" className="btn mb-3" onClick={back}><Icon.ChevronLeft />Retour à l'annuaire</button>
        <h1>Importer des plongeurs</h1>
        <p>Fichier CSV exporté de VPDive ou d'un tableur. Une simulation montre ce qui changera, ligne par ligne, avant toute écriture.</p>
      </div>
      {!allowed && (
        <Notice tone="info" title="Import réservé">Votre rôle ({roleLabel(club.role)}) ne permet pas d'importer l'annuaire : demandez à un DP ou au responsable du club.</Notice>
      )}
      {allowed && !online && <Notice tone="warn" title="Hors ligne">L'import demande une connexion réseau.</Notice>}
      {allowed && !result && (
        <FileStep file={file} setFile={setFile} profile={profile} setProfile={setProfile} busy={busy} online={online}
          onSimulate={() => run(true)} error={simulation ? '' : error} />
      )}
      {allowed && simulation && (
        <SimulationStep report={simulation} busy={busy} online={online} onConfirm={() => run(false)} onReset={reset} />
      )}
      {allowed && simulation && error && <Alert tone="err" title="Import impossible">{error}</Alert>}
      {allowed && result && <DoneStep report={result} onBack={back} onReset={reset} />}
      <div className="mt-4"><ImportHelp /></div>
    </div>
  );
}
