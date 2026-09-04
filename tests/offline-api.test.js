// Tests métier — offline-api : réconciliation des listes annuaire.
//
// Régression couverte : le Service Worker servait /api/divers en
// stale-while-revalidate, donc la réponse réseau avait toujours une requête de
// retard. Un plongeur créé disparaissait de l'annuaire au refresh suivant et un
// plongeur supprimé y ressuscitait. Le SW ne cache plus l'API, mais la liste
// doit rester juste même quand la réponse réseau est en retard.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { bootOfflineApi } = require('./helpers/offline-harness');

let win, serveur, reseauKo;

const stubApi = () => ({
  divers: {
    list: async () => { if (reseauKo) throw new Error('offline'); return serveur.map(d => ({ ...d })); },
    create: async () => {}, update: async () => {}, delete: async () => {},
  },
  sites: { list: async () => [], create: async () => {}, update: async () => {}, delete: async () => {} },
  dives: { list: async () => [], get: async () => {}, create: async () => {}, update: async () => {}, delete: async () => {} },
});

beforeEach(() => {
  serveur  = [{ id: 'srv-1', nom: 'Martin', prenom: 'Paul' }];
  reseauKo = false;
  win = bootOfflineApi(stubApi());
});

const noms = (list) => list.map(d => d.nom);

describe('offline-api — divers.list réconcilie réseau et local', () => {
  test('un plongeur créé reste dans la liste tant qu\'il n\'est pas poussé', async () => {
    await win.api.divers.create({ nom: 'Valbuena', prenom: 'Alain' });
    // Le serveur ne l'a pas encore (POST pas encore drainé).
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin', 'Valbuena']);
  });

  test('une fois poussé, il vient du serveur sans doublon', async () => {
    const d = await win.api.divers.create({ nom: 'Valbuena', prenom: 'Alain' });
    serveur.push({ id: d.id, nom: 'Valbuena', prenom: 'Alain' });
    await win.offlineStore.put('divers', d.id, { ...d, _pending: false });

    const list = await win.api.divers.list();
    assert.deepEqual(noms(list), ['Martin', 'Valbuena']);
    assert.equal(list.filter(x => x.nom === 'Valbuena').length, 1);
  });

  test('le tri suit celui du serveur (nom, prénom)', async () => {
    serveur = [{ id: 's1', nom: 'Aubert' }, { id: 's2', nom: 'Zola' }];
    await win.api.divers.create({ nom: 'Martin', prenom: 'Paul' });
    assert.deepEqual(noms(await win.api.divers.list()), ['Aubert', 'Martin', 'Zola']);
  });

  test('un plongeur supprimé ailleurs est purgé du cache local', async () => {
    await win.offlineStore.put('divers', 'fantome', { id: 'fantome', nom: 'Supprimé', _pending: false });
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin']);
    assert.equal(await win.offlineStore.get('divers', 'fantome'), null,
      'la ligne ne doit pas ressusciter au prochain passage hors-ligne');
  });

  test('les écritures locales priment sur la version serveur', async () => {
    await win.api.divers.update('srv-1', { nom: 'Martin', prenom: 'Paul-Édouard' });
    const list = await win.api.divers.list();
    assert.equal(list[0].prenom, 'Paul-Édouard');
  });

  test('hors-ligne : la liste vient entièrement du store', async () => {
    await win.api.divers.list();          // amorce le cache local
    await win.api.divers.create({ nom: 'Valbuena', prenom: 'Alain' });
    reseauKo = true;
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin', 'Valbuena']);
  });

  test('hors-ligne : les lignes supprimées localement restent masquées', async () => {
    await win.api.divers.list();
    await win.offlineStore.put('divers', 'x', { id: 'x', nom: 'Parti', deleted: true });
    reseauKo = true;
    assert.deepEqual(noms(await win.api.divers.list()), ['Martin']);
  });
});
