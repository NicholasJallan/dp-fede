// DP Assistant — Annuaire vu par les écrans de plongée : niveau encadrant
// du cadre de la structure (associatif ou commercial, cf. domain/encadrement.js).
// L'annuaire et ses écritures gardent les niveaux saisis. En Polynésie, pas de
// cadre SCA du Code du sport : l'encadrement rémunéré relève de la LP 18.

import { useMemo } from 'react';
import { useClub } from '../../club/club-context.jsx';
import { diverForCadre, isCadrePro } from '../../domain/index.js';

export function useDiveDivers(divers, user, jurisdiction = 'FR') {
  const { club } = useClub();
  const cadrePro = jurisdiction !== 'PF' && isCadrePro(club?.structure_type ?? user?.structure_type);
  return useMemo(() => divers.map((d) => diverForCadre(d, cadrePro)), [divers, cadrePro]);
}
