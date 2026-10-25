// DP Assistant — Règles de la plongée ouverte : celles du lieu (pays du site),
// sinon celles du club. Les réponses passées au moteur portent la juridiction
// et le type de structure du club (encadrement rémunéré en Polynésie, LP 5).

import { useMemo } from 'react';
import { useClub } from '../../club/club-context.jsx';
import { diveJurisdiction, rulesFor } from '../../domain/index.js';

const STRUCTURES_LUCRATIVES = ['sca', 'patente'];

export function useDiveRules(answers) {
  const { jurisdiction: clubJurisdiction, club } = useClub();
  const structureType = club?.structure_type ?? null;
  const jurisdiction = diveJurisdiction(answers, clubJurisdiction);
  return useMemo(
    () => ({
      jurisdiction,
      rules: rulesFor(jurisdiction),
      ruleAnswers: { ...answers, jurisdiction, structure_type: structureType },
      lucratif: STRUCTURES_LUCRATIVES.includes(structureType),
    }),
    [answers, jurisdiction, structureType],
  );
}
