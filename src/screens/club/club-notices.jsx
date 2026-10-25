// DP Assistant — Bandeaux « club » de l'accueil : compte rattaché à aucun
// club (club personnel jamais nommé), demandes d'adhésion en attente
// (responsable). Données : dernier GET /api/club (useClub).

import React from 'react';
import { Notice } from '../../components/components.jsx';
import { Icon } from '../../components/icons.jsx';
import { useClub } from '../../club/club-context.jsx';
import { isUnnamedClub } from '../../club/directory.js';

export function ClubHomeNotices({ onOpenClub }) {
  const club = useClub();
  const counts = club.info?.counts;
  const openButton = (label) => (
    <button type="button" className="btn" onClick={onOpenClub}>
      {label}
      <Icon.ChevronRight />
    </button>
  );
  if (club.club && isUnnamedClub(club.club) && (counts?.members ?? 1) <= 1) {
    return (
      <Notice tone="signal" title="Rattachez-vous à votre club" actions={openButton('Rejoindre ou créer un club')}>
        <p>
          Demandez à rejoindre votre club dans l'annuaire, ou créez-le : ses plongeurs, sites et plongées seront
          partagés avec ses membres.
        </p>
      </Notice>
    );
  }
  const pending = counts?.join_requests || 0;
  if (pending > 0 && club.can('club.manage')) {
    return (
      <Notice
        tone="info"
        title={`${pending} demande${pending > 1 ? 's' : ''} d'adhésion en attente`}
        actions={openButton('Voir les demandes')}
      >
        <p>Acceptez-les en choisissant le rôle de chaque personne, ou refusez-les.</p>
      </Notice>
    );
  }
  return null;
}
