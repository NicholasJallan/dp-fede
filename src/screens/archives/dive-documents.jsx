// DP Assistant — PDF archivés par le club pour une plongée (fiche de
// sécurité et check-list, art. A322-72) : état, téléchargement,
// régénération (rôles responsable / dp) proposée UNIQUEMENT en cas d'échec
// de génération ou de document manquant (règle du serveur, cf.
// src/club/documents.js) : une fiche archivée complète ne se réécrit pas.

import React, { useCallback, useEffect, useState } from 'react';
import { useClub } from '../../club/club-context.jsx';
import { useOnline } from '../../offline/use-online.jsx';
import { useToasts } from '../../components/toast.jsx';
import { Alert } from '../../components/components.jsx';
import { Icon, StatusIcon } from '../../components/icons.jsx';
import { formatDateTime } from '../../components/format.js';
import { api } from '../../api/api.js';
import { saveBlob } from '../../api/download.js';
import { describeApiError } from '../../club/permissions.js';
import { canRegenerateDocuments } from '../../club/documents.js';

export const DOCUMENT_STATUS = {
  pending: { tone: 'info', label: 'Génération des PDF en cours' },
  ok: { tone: 'ok', label: 'PDF archivés par le club' },
  error: { tone: 'warn', label: 'Échec de la génération des PDF' },
  none: { tone: 'muted', label: 'PDF non archivés sur le serveur' },
};

const DOC_LABELS = { fiche: 'Fiche de sécurité', checklist: 'Check-list' };
const POLL_MS = 5000;
const POLL_MAX = 24;

export function documentStatus(status) {
  return DOCUMENT_STATUS[status] || DOCUMENT_STATUS.none;
}

const kb = (bytes) => `${Math.max(1, Math.round((Number(bytes) || 0) / 1024))} Ko`;

function useDocuments(diveId, online) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      setDocs(await api.dives.documents(diveId));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [diveId]);
  useEffect(() => {
    if (online && diveId) load();
  }, [online, diveId, load]);
  // Génération en arrière-plan : relecture périodique tant que « pending ».
  useEffect(() => {
    if (docs?.status !== 'pending' || !online) return undefined;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      if (n > POLL_MAX) clearInterval(id);
      else load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [docs?.status, online, load]);
  return { docs, setDocs, error, load };
}

function DocRow({ doc, busy, online, onDownload }) {
  return (
    <div className="doc-row">
      <div>
        <b>{DOC_LABELS[doc.type] || doc.type}</b>
        <p className="meta">
          PDF, {kb(doc.bytes)}, généré le {formatDateTime(doc.created_at)}
        </p>
        <p className="meta" title="Empreinte SHA-256 vérifiée à chaque téléchargement">
          SHA-256 {String(doc.sha256 || '').slice(0, 16)}…
        </p>
      </div>
      <button type="button" className="btn" disabled={busy || !online} onClick={onDownload}>
        <Icon.Download />
        Télécharger
      </button>
    </div>
  );
}

export function DiveDocuments({ dive }) {
  const club = useClub();
  const online = useOnline();
  const { showToast } = useToasts();
  const diveId = dive.id || dive.client_uuid;
  const { docs, setDocs, error, load } = useDocuments(diveId, online);
  const [busy, setBusy] = useState(false);
  const status = docs ? docs.status : dive.documents_status;
  const meta = documentStatus(status);
  const canGenerate = club.can('documents.generate');

  const download = async (type) => {
    setBusy(true);
    try {
      const { blob, filename } = await api.dives.downloadDocument(diveId, type);
      saveBlob(blob, filename);
    } catch (err) {
      showToast({
        tone: 'err',
        title: 'Téléchargement impossible',
        body: describeApiError(err, 'télécharger ce document'),
      });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await api.dives.regenerateDocuments(diveId);
      setDocs((d) => ({ ...(d || {}), ...res }));
      showToast({ tone: 'ok', title: 'PDF régénérés', body: 'Fiche de sécurité et check-list archivées.' });
    } catch (err) {
      showToast({ tone: 'err', title: 'Régénération impossible', body: describeApiError(err, 'régénérer les PDF') });
      load();
    } finally {
      setBusy(false);
    }
  };

  const documents = docs?.documents || dive.documents || [];
  // docs pas encore lus (hors ligne) : on ne propose rien sur la seule foi du résumé local.
  const showRegenerate =
    canGenerate && (docs !== null || status === 'error') && canRegenerateDocuments({ status, documents });

  return (
    <section className="card" aria-labelledby="arch-docs">
      <div className="card-head">
        <h2 id="arch-docs">Documents archivés</h2>
        <span className="hint">Conservation par le club, art. A322-72</span>
      </div>
      <div className="card-body">
        <p className="doc-status" role="status">
          <StatusIcon tone={meta.tone} />
          {busy && showRegenerate ? 'Régénération en cours (quelques secondes)…' : meta.label}
        </p>
        {!online && <p className="small muted">Téléchargement disponible en ligne.</p>}
        {error && online && <Alert tone="warn">{describeApiError(error, 'consulter les documents')}</Alert>}
        {documents.length > 0 && (
          <div className="doc-list">
            {documents.map((d) => (
              <DocRow key={d.type} doc={d} busy={busy} online={online} onDownload={() => download(d.type)} />
            ))}
          </div>
        )}
        {showRegenerate && (
          <div className="row mt-3">
            <button type="button" className="btn primary" disabled={busy || !online} onClick={regenerate}>
              <Icon.Refresh />
              Régénérer les PDF
            </button>
            <span className="small muted">Fiche et check-list recalculées depuis la plongée archivée.</span>
          </div>
        )}
      </div>
    </section>
  );
}
