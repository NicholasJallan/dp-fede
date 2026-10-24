// DP Assistant — Annuaire vu par les écrans de plongée : niveau encadrant
// du cadre de la structure (associatif ou commercial, cf. domain/encadrement.js).
// L'annuaire et ses écritures gardent les niveaux saisis.

import { useMemo } from 'react';
import { useClub } from '../../club/club-context.jsx';
import { diverForCadre, isCadrePro } from '../../domain/index.js';

export function useDiveDivers(divers, user) {
  const { club } = useClub();
  const cadrePro = isCadrePro(club?.structure_type ?? user?.structure_type);
  return useMemo(() => divers.map((d) => diverForCadre(d, cadrePro)), [divers, cadrePro]);
}
