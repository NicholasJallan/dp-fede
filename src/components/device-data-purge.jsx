// DP Assistant — « Supprimer les données de cet appareil » : bouton +
// confirmation. Proposé partout où des données peuvent rester sur un
// appareil après le départ de l'utilisateur (session expirée, changement de
// compte Google, club quitté, écran de connexion) — appareil partagé, prêté
// ou club quitté.

import React, { useState } from 'react';
import { ConfirmDialog } from './dialog.jsx';
import { useAuth } from '../auth/auth-context.jsx';

export function DeviceDataPurgeButton({ className = 'btn', label = 'Supprimer les données de cet appareil', onWipe }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wipe = onWipe || auth?.wipeDevice;

  const confirm = async () => {
    setBusy(true);
    try {
      await wipe?.();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (<>
    <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
    {open && (
      <ConfirmDialog title="Supprimer les données de cet appareil ?" icon="warn" tone="warn" danger busy={busy}
        confirmLabel="Supprimer" cancelLabel="Annuler" onCancel={() => setOpen(false)} onConfirm={confirm}>
        <p>
          Plongées, annuaire, sites et actions pas encore envoyées au serveur seront effacés de cet appareil.
          Les données déjà enregistrées sur le serveur ne sont pas touchées.
        </p>
      </ConfirmDialog>
    )}
  </>);
}
