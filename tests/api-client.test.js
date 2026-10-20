// Tests — client API (src/api/api.js) : en-tête X-DP-Club sur toutes les
// requêtes métier, 403 CLUB_NOT_MEMBER signalé pour resynchroniser le club.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow, installGlobals } from './helpers/offline-harness.js';
import { api } from '../src/api/api.js';
import { setCurrentClubId } from '../src/api/club-header.js';

const CLUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let win;

function mockFetch(responses) {
  const calls = [];
  win.fetch = globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: (opts.method || 'GET').toUpperCase(), headers: opts.headers || {} });
    const { status = 200, body = { ok: true, data: null } } = responses.shift() || {};
    const ok = status >= 200 && status < 300;
    return {
      ok, status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      blob: async () => new Blob(['%PDF']),
      headers: { get: () => null },
    };
  };
  return calls;
}

beforeEach(() => {
  win = createWindow();
  installGlobals(win);
  setCurrentClubId(CLUB_A);
});

describe('api — en-tête X-DP-Club', () => {
  test('lectures et écritures métier ciblent le club courant', async () => {
    const calls = mockFetch([{}, {}, {}]);
    await api.divers.list();
    await api.dives.update('d1', { drive_link: 'x' });
    await api.club.stats({ from: '2026-09-15', to: '2027-09-14' });
    assert.ok(calls.every(c => c.headers['X-DP-Club'] === CLUB_A), JSON.stringify(calls));
  });

  test('téléchargements (PDF archivé, PDF à la volée) aussi', async () => {
    const calls = mockFetch([{}, {}]);
    await api.dives.downloadDocument('d1', 'fiche');
    await api.pdf.blob('d1', 'fiche');
    assert.equal(calls[0].headers['X-DP-Club'], CLUB_A);
    assert.equal(calls[1].headers['X-DP-Club'], CLUB_A);
  });

  test("pas d'en-tête sur /auth/* (session, découverte du club courant)", async () => {
    const calls = mockFetch([{}, {}]);
    await api.auth.me();
    await api.auth.logout();
    assert.ok(calls.every(c => !('X-DP-Club' in c.headers)));
  });

  test("club courant inconnu : pas d'en-tête", async () => {
    setCurrentClubId(null);
    const calls = mockFetch([{}]);
    await api.divers.list();
    assert.equal('X-DP-Club' in calls[0].headers, false);
  });
});

describe('api — 403 CLUB_NOT_MEMBER', () => {
  test("erreur avec code stable et événement dp:clubNotMember (club envoyé)", async () => {
    const events = [];
    win.addEventListener('dp:clubNotMember', (e) => events.push(e.detail));
    mockFetch([{ status: 403, body: { ok: false, error: "Vous n'êtes pas membre de ce club", code: 'CLUB_NOT_MEMBER' } }]);
    await assert.rejects(api.divers.list(), (err) => err.status === 403 && err.code === 'CLUB_NOT_MEMBER');
    assert.deepEqual(events, [{ clubId: CLUB_A }]);
  });

  test('un autre 403 ne déclenche pas la resynchronisation', async () => {
    const events = [];
    win.addEventListener('dp:clubNotMember', (e) => events.push(e.detail));
    mockFetch([{ status: 403, body: { ok: false, error: 'Action non autorisée', code: 'CLUB_ROLE_FORBIDDEN' } }]);
    await assert.rejects(api.divers.create({ nom: 'X' }), (err) => err.code === 'CLUB_ROLE_FORBIDDEN');
    assert.deepEqual(events, []);
  });
});
