// Bascule d'espace de travail (lib/scope.js).
//
// Un membre qui passe de son espace personnel à une structure partagée ne doit
// emporter aucune donnée locale du scope précédent : IndexedDB, snapshots
// localStorage et cache SW des réponses API sont tous keyés sans notion
// d'utilisateur. En revanche l'outbox doit survivre (elle porte les écritures
// pas encore envoyées), et la bascule doit être refusée tant qu'elle est pleine.

const test   = require('node:test');
const assert = require('node:assert');
const { bootOffline, loadScript } = require('./helpers/offline-harness.js');

function bootScope() {
  const win = bootOffline();
  win.STORAGE_KEYS = { CACHE_DIVERS: 'dp-cache-divers', CACHE_SITES: 'dp-cache-sites' };
  win.netStatus = () => ({ online: true });

  // Faux Cache Storage : on n'observe que les noms supprimés.
  const deleted = [];
  win.caches = {
    keys:   async () => ['dp-20260101-shell', 'dp-20260101-api', 'dp-20260101-runtime'],
    delete: async (n) => { deleted.push(n); return true; },
  };
  win._deletedCaches = deleted;

  loadScript(win, 'lib/scope.js');
  return win;
}

async function seed(win) {
  await win.offlineStore.put('divers',   'd1', { id: 'd1', nom: 'Perso' });
  await win.offlineStore.put('sites',    's1', { id: 's1', nom: 'Site perso' });
  await win.offlineStore.put('dives',    'v1', { client_uuid: 'v1' });
  await win.offlineStore.put('archives', 'a1', { id: 'a1' });
  await win.offlineStore.put('meta',     'sync', { divers: '2026-01-01' });
  win.localStorage.setItem('dp-cache-divers', JSON.stringify({ list: [1] }));
  win.localStorage.setItem('dp-cache-sites',  JSON.stringify({ list: [1] }));
}

test('purgeLocalScope vide les stores de données', async () => {
  const win = bootScope();
  await seed(win);

  await win.purgeLocalScope();

  for (const store of ['divers', 'sites', 'dives', 'archives', 'meta']) {
    assert.deepEqual(await win.offlineStore.all(store), [], `store ${store} non vidé`);
  }
});

test('purgeLocalScope conserve l\'outbox', async () => {
  const win = bootScope();
  await win.outbox.enqueue('diver.create', { nom: 'Test' });

  await win.purgeLocalScope();

  assert.equal(await win.outbox.size(), 1, 'les écritures en attente ont été perdues');
});

test('purgeLocalScope supprime les snapshots localStorage', async () => {
  const win = bootScope();
  await seed(win);

  await win.purgeLocalScope();

  assert.equal(win.localStorage.getItem('dp-cache-divers'), null);
  assert.equal(win.localStorage.getItem('dp-cache-sites'), null);
});

test('purgeLocalScope supprime le cache SW des réponses API, et lui seul', async () => {
  const win = bootScope();

  await win.purgeLocalScope();

  assert.deepEqual(win._deletedCaches, ['dp-20260101-api']);
});

test('switchScope refuse la bascule si des écritures restent en attente', async () => {
  const win = bootScope();
  await win.outbox.enqueue('diver.create', { nom: 'Pas encore envoyé' });
  // sync.cycle() ne draine rien : pas de fetch monté dans ce harnais.
  win.api = { workspaces: { activate: async () => { throw new Error('ne doit pas être appelé'); } } };

  await assert.rejects(() => win.switchScope(3), err => err.code === 'PENDING_WRITES');

  // L'outbox est intacte : rien n'a été envoyé dans le mauvais espace.
  assert.equal(await win.outbox.size(), 1);
});

test('switchScope active la structure puis purge, quand l\'outbox est vide', async () => {
  const win = bootScope();
  await seed(win);
  let activated;
  win.api = { workspaces: { activate: async (id) => { activated = id; return { id: 7, workspace: { id } }; } } };

  const user = await win.switchScope(3);

  assert.equal(activated, 3);
  assert.equal(user.workspace.id, 3);
  assert.deepEqual(await win.offlineStore.all('divers'), []);
  assert.equal(win.localStorage.getItem('dp-cache-divers'), null);
});
