// Tests — saisie rapide de la date de naissance (src/screens/palanquees/birthdate.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskBirthdate, parseBirthdate } from '../src/screens/palanquees/birthdate.js';

const TODAY = new Date(2026, 9, 22);

describe('maskBirthdate — JJ/MM/AAAA au fil de la frappe', () => {
  test('insère les barres obliques', () => {
    assert.equal(maskBirthdate('1'), '1');
    assert.equal(maskBirthdate('12'), '12');
    assert.equal(maskBirthdate('123'), '12/3');
    assert.equal(maskBirthdate('12031990'), '12/03/1990');
  });

  test('ignore les séparateurs et caractères saisis, borne à 8 chiffres', () => {
    assert.equal(maskBirthdate('12.03-1990'), '12/03/1990');
    assert.equal(maskBirthdate('12/03/19901'), '12/03/1990');
    assert.equal(maskBirthdate('ab'), '');
  });
});

describe('parseBirthdate', () => {
  test('date complète → ISO et âge au jour donné', () => {
    assert.deepEqual(parseBirthdate('12/03/1990', TODAY), { iso: '1990-03-12', age: 36 });
    assert.deepEqual(parseBirthdate('23/10/2009', TODAY), { iso: '2009-10-23', age: 16 });
  });

  test('saisie incomplète → ni date ni erreur', () => {
    assert.deepEqual(parseBirthdate('12/03/19', TODAY), {});
    assert.deepEqual(parseBirthdate('', TODAY), {});
  });

  test('date impossible, future ou invraisemblable → erreur', () => {
    assert.ok(parseBirthdate('31/02/1990', TODAY).error);
    assert.ok(parseBirthdate('01/01/2030', TODAY).error);
    assert.ok(parseBirthdate('01/01/1890', TODAY).error);
  });
});
