// DP Assistant — Quitter le club, ou le supprimer (responsable).
// Suppression : les fiches de sécurité archivées de moins d'un an sont
// conservées par le serveur (art. A322-72) ; la réponse indique combien et
// jusqu'à quand.

import React, { useState } from 'react';
import { Alert } from '../../components/components.jsx';
import { ConfirmDialog, Dialog } from '../../components/dialog.jsx';
import { TypedConfirmDialog } from '../../components/typed-confirm-dialog.jsx';
import { api } from '../../api/api.js';
import { describeApiError } from '../../club/permissions.js';
import { describeDeletion } from '../../club/deletion.js';
import { RetainedFacts } from './retained-facts.jsx';

function LeaveRow({ online, onLeave }) {
  return (
    <div className="row-between">
      <div>
        <b>Quitter le club</b>
        <p>
          Vous n'aurez plus accès à ses plongées, à son annuaire ni à ses sites. Ce que vous avez saisi reste au club.
        </p>
      </div>
      <button type="button" className="btn danger" disabled={!online} onClick={onLeave}>
        Quitter le club
      </button>
    </div>
  );
}

function DeleteRow({ online, onDelete }) {
  return (
    <div className="row-between">
      <div>
        <b>Supprimer le club</b>
        <p>
          Supprime l'annuaire, les sites, les plongées, les membres et les invitations. Les fiches de sécurité archivées
          de moins d'un an restent conservées (obligation légale, art. A322-72), puis sont effacées.
        </p>
      </div>
      <button type="button" className="btn danger" disabled={!online} onClick={onDelete}>
        Supprimer le club
      </button>
    </div>
  );
}

export function ClubDangerZone({ clubName, myUserId, canManage, online, onLeft }) {
  const [dialog, setDialog] = useState(null); // 'leave' | 'delete' | { result }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setDialog(null);
    setError('');
  };

  const leave = async () => {
    setBusy(true);
    setError('');
    try {
      await api.club.removeMember(myUserId);
      setDialog(null);
      await onLeft();
    } catch (err) {
      setError(err.status === 409 ? `${err.message}.` : describeApiError(err, 'quitter le club'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.club.delete();
      setDialog({ result: describeDeletion(res, `Le club ${clubName} a été supprimé.`) });
    } catch (err) {
      setError(describeApiError(err, 'supprimer le club'));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setDialog(null);
    await onLeft();
  };

  return (
    <section className="card danger-zone" aria-labelledby="club-danger">
      <div className="card-head">
        <h2 id="club-danger">Quitter ou supprimer le club</h2>
      </div>
      <div className="card-body">
        {myUserId != null && <LeaveRow online={online} onLeave={() => setDialog('leave')} />}
        {canManage && <DeleteRow online={online} onDelete={() => setDialog('delete')} />}
      </div>

      {dialog === 'leave' && (
        <ConfirmDialog
          title={`Quitter ${clubName} ?`}
          danger
          busy={busy}
          confirmLabel="Quitter le club"
          onCancel={close}
          onConfirm={leave}
        >
          <p>Les données de ce club seront retirées de cet appareil.</p>
          {error && <Alert tone="err">{error}</Alert>}
        </ConfirmDialog>
      )}
      {dialog === 'delete' && (
        <TypedConfirmDialog
          title={`Supprimer ${clubName} ?`}
          confirmLabel="Supprimer définitivement"
          busy={busy}
          error={error ? <Alert tone="err">{error}</Alert> : null}
          onCancel={close}
          onConfirm={remove}
        >
          <p>
            Action définitive. Téléchargez d'abord les PDF des plongées archivées dont vous avez besoin (écran
            Historique) : après la suppression, plus aucun membre n'y aura accès.
          </p>
        </TypedConfirmDialog>
      )}
      {dialog?.result && (
        <Dialog
          title="Club supprimé"
          size="sm"
          icon="ok"
          onClose={finish}
          footer={
            <button type="button" className="btn primary" onClick={finish} data-autofocus="">
              Continuer
            </button>
          }
        >
          <p>{dialog.result.message}</p>
          {dialog.result.retained && <RetainedFacts retained={dialog.result.retained} />}
        </Dialog>
      )}
    </section>
  );
}
