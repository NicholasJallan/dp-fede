// Tests de résistance au fuseau horaire (décalage UTC négatif).
//
// À Tahiti (UTC-10), le parsing 'YYYY-MM-DD' via new Date('YYYY-MM-DD')
// (minuit UTC) produit la veille en heure locale (ex. 14h00 UTC-10).
// Ce test vérifie que ageAt, checkMedical (FR) et checkMedical (PF)
// traitent bien les dates calendaires au jour le jour, sans décalage.

import { test, describe } from 'node:test';
import { execFileSync } from 'node:child_process';

describe('fuseau horaire — décalage UTC négatif (Pacific/Tahiti)', () => {
  test('ageAt et validité certificat médical (FR + PF) sous TZ=Pacific/Tahiti', () => {
    const script = `
      import assert from 'node:assert/strict';
      import { ageAt } from './src/domain/pal-helpers.js';
      import { validatePal, validatePalPf } from './src/domain/index.js';

      // 1. ageAt ne vieillit pas prématurément la veille de l'anniversaire à Tahiti (UTC-10)
      const age = ageAt('2008-06-02', new Date(2026, 5, 1, 10));
      assert.equal(age, 17, \`ageAt doit renvoyer 17, reçu \${age}\`);

      // 2. Certificat médical FR émis le 2025-06-01 : la veille au soir à 20h00 locale (2026-05-31T20:00),
      // le certificat n'est pas expiré (valable jusqu'au 2026-06-01 00:00 local).
      // À Tahiti (UTC-10), le bug UTC midnight le faisait expirer le 2026-05-31 à 14h00 locale.
      const issuesFr = validatePal(
        {
          profMax: 20,
          membres: [
            { diverId: 'e2', aptitude: 'E2' },
            { diverId: 'd1', aptitude: 'PE20' },
          ],
        },
        {
          e2: { id: 'e2', prenom: 'Prof', nom: 'X', niveau_encadrant: 'E2', medical: '2025-06-01' },
          d1: { id: 'd1', prenom: 'Eleve', nom: 'Y', niveau: 'N1', medical: '2025-06-01' },
        },
        { date: '2026-05-31T20:00', dp_qual: 'E3' },
        null
      );
      assert.ok(
        !issuesFr.some((i) => i.code === 'MEDICAL_EXPIRED'),
        \`Certificat FR ne doit pas être expiré : \${JSON.stringify(issuesFr)}\`
      );

      // 3. Certificat médical PF émis le 2025-06-01 : idem, valide le 2026-05-31T20:00
      const issuesPf = validatePalPf(
        {
          profMax: 20,
          membres: [
            { diverId: 'e2', aptitude: 'ENS-20' },
            { diverId: 'd1', aptitude: 'PE-20' },
          ],
        },
        {
          e2: {
            id: 'e2',
            prenom: 'Prof',
            nom: 'X',
            medical: '2025-06-01',
            pf: { aptitudes: ['PE-20', 'PA-20'], fonctions: ['ENS-20'], gaz: [] },
          },
          d1: {
            id: 'd1',
            prenom: 'Eleve',
            nom: 'Y',
            medical: '2025-06-01',
            pf: { aptitudes: ['PE-20'], fonctions: [], gaz: [] },
          },
        },
        { date: '2026-05-31T20:00' },
        { id: 'dp', prenom: 'DP', nom: 'Z', medical: '2026-01-01', pf: { aptitudes: [], fonctions: ['DP-60'], gaz: [] } }
      );
      assert.ok(
        !issuesPf.some((i) => i.code === 'PF_MEDICAL_ENCADRANT'),
        \`Certificat PF ne doit pas être expiré : \${JSON.stringify(issuesPf)}\`
      );
    `;

    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: 'Pacific/Tahiti' },
      stdio: 'pipe',
    });
  });
});
