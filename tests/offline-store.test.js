// Tests métier — offline-store (fallback localStorage testé ; le chemin IDB
// est testé indirectement par outbox/sync et manuellement en navigateur).

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { bootOffline } = require('./helpers/offline-harness');

let win;
beforeEach(() => { win = bootOffline(); });

describe('offline-store — CRUD via fallback localStorage', () => {
  test('put + get aller-retour', async () => {
    await win.offlineStore.put('divers', 'd1', { id: 'd1', nom: 'Doe' });
    const got = await win.offlineStore.get('divers', 'd1');
    assert.deepEqual(got, { id: 'd1', nom: 'Doe' });
  });

  test('put écrase la valeur précédente', async () => {
    await win.offlineStore.put('sites', 's1', { id: 's1', nom: 'A' });
    await win.offlineStore.put('sites', 's1', { id: 's1', nom: 'B' });
    const got = await win.offlineStore.get('sites', 's1');
    assert.equal(got.nom, 'B');
  });

  test('get sur clé inexistante renvoie null', async () => {
    const got = await win.offlineStore.get('divers', 'inconnu');
    assert.equal(got, null);
  });

  test('del supprime la clé', async () => {
    await win.offlineStore.put('divers', 'd1', { id: 'd1' });
    await win.offlineStore.del('divers', 'd1');
    assert.equal(await win.offlineStore.get('divers', 'd1'), null);
  });

  test('all retourne tous les items du store, sans collision entre stores', async () => {
    await win.offlineStore.put('divers', 'd1', { id: 'd1', nom: 'D1' });
    await win.offlineStore.put('divers', 'd2', { id: 'd2', nom: 'D2' });
    await win.offlineStore.put('sites',  's1', { id: 's1', nom: 'S1' });
    const divers = await win.offlineStore.all('divers');
    const sites  = await win.offlineStore.all('sites');
    assert.equal(divers.length, 2);
    assert.equal(sites.length, 1);
    // Pas de fuite entre stores
    assert.ok(divers.every(d => d.id.startsWith('d')));
  });

  test('allKeys retourne les clés brutes', async () => {
    await win.offlineStore.put('outbox', 'k1', { v: 1 });
    await win.offlineStore.put('outbox', 'k2', { v: 2 });
    const keys = await win.offlineStore.allKeys('outbox');
    assert.deepEqual(keys.sort(), ['k1', 'k2']);
  });

  test('clear vide un store sans toucher aux autres', async () => {
    await win.offlineStore.put('divers', 'd1', { id: 'd1' });
    await win.offlineStore.put('sites',  's1', { id: 's1' });
    await win.offlineStore.clear('divers');
    assert.equal((await win.offlineStore.all('divers')).length, 0);
    assert.equal((await win.offlineStore.all('sites')).length, 1);
  });

  test('rejette les stores inconnus (garde-fou contre fautes de frappe)', async () => {
    await assert.rejects(() => win.offlineStore.put('autres', 'k', {}), /Store inconnu/);
  });
});
