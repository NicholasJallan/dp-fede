// Tests — fiche archivée figée côté client (régénération des PDF, auto-save),
// club quitté et données de l'appareil.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootOffline } from './helpers/offline-harness.js';
import { canRegenerateDocuments } from '../src/club/documents.js';
import { autoSaveAction, flushAction, buildAutoSavePatch } from '../src/offline/auto-save-policy.js';
import { handleClubNotMember } from '../src/club/membership-lost.js';
import { purgeLocalData, hasLocalData, wipeDeviceData } from '../src/auth/local-data.js';
import { getCurrentClubId, setCurrentClubId } from '../src/api/club-header.js';

const CLUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOTH = [{ type: 'checklist' }, { type: 'fiche' }];

describe('canRegenerateDocuments — bouton « Régénérer » uniquement en erreur ou document manquant', () => {
  test('erreur → oui ; complet → non ; en cours → non', () => {
    assert.equal(canRegenerateDocuments({ status: 'error', documents: BOTH }), true);
    assert.equal(canRegenerateDocuments({ status: 'ok', documents: BOTH }), false);
    assert.equal(canRegenerateDocuments({ status: 'pending', documents: [] }), false);
  });

  test('document manquant (ou archivage antérieur aux PDF serveur) → oui', () => {
    assert.equal(canRegenerateDocuments({ status: 'ok', documents: [{ type: 'fiche' }] }), true);
    assert.equal(canRegenerateDocuments({ status: null, documents: [] }), true);
    assert.equal(canRegenerateDocuments({ status: undefined, documents: undefined }), true);
  });
});

describe('auto-save — plus de render_state après archivage', () => {
  const base = { user: { id: 1 }, diveId: 'd1', saved: { diveId: 'd1', json: 'A' }, json: 'B' };

  test('plongée figée (archivée ou en cours d\'archivage) : ni envoi différé ni flush', () => {
    assert.equal(autoSaveAction({ ...base, plongeeFigee: true }), 'skip');
    assert.equal(flushAction({ ...base, plongeeFigee: true }), 'skip');
  });

  test('plongée modifiable : envoi si l\'état a changé, référence au premier rendu', () => {
    assert.equal(autoSaveAction({ ...base, plongeeFigee: false }), 'send');
    assert.equal(autoSaveAction({ ...base, plongeeFigee: false, json: 'A' }), 'skip');
    assert.equal(autoSaveAction({ ...base, plongeeFigee: false, saved: { diveId: 'autre', json: 'A' } }), 'baseline');
    assert.equal(autoSaveAction({ ...base, plongeeFigee: false, user: null }), 'skip');
    assert.equal(flushAction({ ...base, plongeeFigee: false }), 'send');
    assert.equal(flushAction({ ...base, plongeeFigee: false, json: 'A' }), 'skip');
  });

  test('le patch porte render_state (d\'où l\'importance de ne plus l\'envoyer une fois figée)', () => {
    const patch = buildAutoSavePatch({
      answers: { date: '2026-10-20T09:00', site_nom: 'Lac' }, palanquees: [],
      checked: {}, comments: {}, pressions: {}, realises: {}, heuresDebut: {}, heuresFin: {},
    });
    assert.ok(patch.render_state);
    assert.equal(patch.date_plongee, '2026-10-20T09:00');
    assert.equal(patch.site_nom, 'Lac');
  });
});

describe('club quitté — purge des actions en revue de ce club', () => {
  let win;
  beforeEach(() => { win = bootOffline(); });

  test('retire les items en revue du club, oublie le club courant s\'il est concerné', async () => {
    win.clubId = CLUB_A;
    const a = await win.outbox.enqueue('diver.update', { id: 'd-1' });
    await win.outbox.markReview(a.id, new Error('403'));
    win.clubId = CLUB_B;
    const b = await win.outbox.enqueue('diver.update', { id: 'd-2' });
    await win.outbox.markReview(b.id, new Error('422'));
    setCurrentClubId(CLUB_A);

    const res = await handleClubNotMember({ clubId: CLUB_A, outbox: win.outbox });

    assert.deepEqual(res, { removed: 1, wasCurrent: true });
    assert.equal(await win.outbox.get(a.id), null);
    assert.ok(await win.outbox.get(b.id));
    assert.equal(getCurrentClubId(), null);
  });

  test('club refusé différent du club courant : le club courant est conservé', async () => {
    setCurrentClubId(CLUB_B);
    const res = await handleClubNotMember({ clubId: CLUB_A, outbox: win.outbox });
    assert.equal(res.wasCurrent, false);
    assert.equal(getCurrentClubId(), CLUB_B);
  });
});

describe('données de l\'appareil', () => {
  let win;
  beforeEach(() => { win = bootOffline(); });

  test('hasLocalData : vrai dès qu\'il reste une action, une plongée ou un propriétaire', async () => {
    assert.equal(await hasLocalData(win.offlineStore), false);
    await win.offlineStore.put('meta', 'owner', 7);
    assert.equal(await hasLocalData(win.offlineStore), true);
  });

  test('purgeLocalData vide le stockage local, les pré-caches et le club courant', async () => {
    await win.offlineStore.put('dives', 'x', { client_uuid: 'x' });
    await win.outbox.enqueue('diver.create', { id: 'd-1' });
    localStorage.setItem('dp-cache-divers', '{}');
    localStorage.setItem('dp-last-user', '{}');
    setCurrentClubId(CLUB_A);

    await purgeLocalData({ store: win.offlineStore });

    assert.equal(await win.outbox.size(), 0);
    assert.deepEqual(await win.offlineStore.all('dives'), []);
    assert.equal(localStorage.getItem('dp-cache-divers'), null);
    assert.equal(getCurrentClubId(), null);
    // Instantané de session conservé (réécrit juste avant un changement d'utilisateur).
    assert.equal(localStorage.getItem('dp-last-user'), '{}');
  });

  test('wipeDeviceData efface tout, instantané de session compris', async () => {
    await win.outbox.enqueue('diver.create', { id: 'd-1' });
    localStorage.setItem('dp-last-user', '{}');
    await wipeDeviceData({ store: win.offlineStore });
    assert.equal(await hasLocalData(win.offlineStore), false);
  });
});
