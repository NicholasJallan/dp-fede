// DP Assistant — Mes données (RGPD) : export (droit d'accès / portabilité)
// et suppression définitive du compte (saisie de SUPPRIMER).
//
// Après suppression : message du serveur (fiches de sécurité conservées au
// titre de l'art. A322-72, le cas échéant) affiché sur l'écran de connexion,
// données locales purgées (IndexedDB, pré-caches, club courant).

import React, { useState } from 'react';
import { useAuth } from '../../auth/auth-context.jsx';
import { useOnline } from '../../offline/use-online.jsx';
import { useToasts } from '../../components/toast.jsx';
import { Alert } from '../../components/components.jsx';
import { Icon } from '../../components/icons.jsx';
import { TypedConfirmDialog } from '../../components/typed-confirm-dialog.jsx';
import { api } from '../../api/api.js';
import { saveJson } from '../../api/download.js';
import { isoDate } from '../../club/season.js';
import { describeAccountDeletionError, describeDeletion } from '../../club/deletion.js';
import { describeApiError } from '../../club/permissions.js';

function DeletionRefusal({ refusal, onOpenClub }) {
  return (
    <Alert tone="err" title={refusal.title}>
      <p>{refusal.body}</p>
      {refusal.clubAction && (
        <p className="mt-3"><button type="button" className="btn" onClick={onOpenClub}><Icon.Flag />Ouvrir l'écran Club</button></p>
      )}
    </Alert>
  );
}

function ExportRow({ online }) {
  const { showToast } = useToasts();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const data = await api.account.export();
      saveJson(data, `dp-assistant-export-${isoDate(new Date())}.json`);
      showToast({ tone: 'ok', title: 'Export prêt', body: 'Fichier JSON téléchargé.' });
    } catch (err) {
      showToast({ tone: 'err', title: 'Export impossible', body: describeApiError(err, 'exporter vos données') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row-between">
      <div>
        <b>Télécharger mes données</b>
        <p className="small muted">Compte, clubs et rôles, invitations envoyées, plongeurs, sites et plongées dont vous êtes l'auteur (JSON).</p>
      </div>
      <button type="button" className="btn" onClick={download} disabled={busy || !online}>
        <Icon.Download />{busy ? 'Préparation…' : 'Télécharger mes données'}
      </button>
    </div>
  );
}

export function AccountPrivacy({ onNavigate }) {
  const { endSession } = useAuth();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(null);

  const remove = async () => {
    setBusy(true); setRefusal(null);
    try {
      const res = await api.account.delete();
      const { message, retained } = describeDeletion(res, 'Votre compte a été supprimé.');
      await endSession({ notice: { title: 'Compte supprimé', message, retained } });
    } catch (err) {
      setRefusal(describeAccountDeletionError(err));
      setBusy(false);
    }
  };

  const openClub = () => { setOpen(false); onNavigate('club'); };

  return (
    <section className="card" aria-labelledby="acc-rgpd">
      <div className="card-head"><h2 id="acc-rgpd">Mes données</h2><span className="hint">RGPD : accès, portabilité, effacement</span></div>
      <div className="card-body stack">
        <ExportRow online={online} />
        <div className="row-between">
          <div>
            <b>Supprimer mon compte</b>
            <p className="small muted">Définitif. Vos saisies dans un club partagé y restent, sans auteur.</p>
          </div>
          <button type="button" className="btn danger" disabled={!online} onClick={() => { setRefusal(null); setOpen(true); }}>
            <Icon.Trash />Supprimer mon compte
          </button>
        </div>
        {!online && <p className="small muted">Ces actions demandent une connexion réseau.</p>}
      </div>
      {open && (
        <TypedConfirmDialog title="Supprimer votre compte ?" confirmLabel="Supprimer mon compte" busy={busy}
          error={refusal ? <DeletionRefusal refusal={refusal} onOpenClub={openClub} /> : null}
          onCancel={() => setOpen(false)} onConfirm={remove}>
          <p>Votre compte, vos adhésions et vos sessions sont supprimés. Un club dont vous êtes le seul membre est supprimé
            avec ses données ; ses fiches de sécurité archivées de moins d'un an sont conservées (art. A322-72) puis effacées.</p>
          <p>Les données de cet appareil seront effacées. Pensez à télécharger vos données avant.</p>
        </TypedConfirmDialog>
      )}
    </section>
  );
}
