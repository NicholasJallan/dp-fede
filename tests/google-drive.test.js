// Tests pour lib/google-drive.js — getDriveToken (cache + GIS mock) et
// getCsrfToken (lecture cookie).
//
// On simule un faux `window` global avec :
//   - GOOGLE_CLIENT_ID configuré
//   - google.accounts.oauth2.initTokenClient mockable
//   - document.cookie

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function loadGoogleDriveInto(win) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'google-drive.js'), 'utf8');
  // eslint-disable-next-line no-eval
  (function (window) { eval(src); })(win);
}

function makeWin({ tokenReply = null, tokenError = null, gisAvailable = true, cookie = '' } = {}) {
  let lastTokenClient = null;
  const win = {
    GOOGLE_CLIENT_ID: 'fake-client-id.apps.googleusercontent.com',
    dp_driveToken: null,
    document: { cookie },
  };
  if (gisAvailable) {
    win.google = {
      accounts: {
        oauth2: {
          initTokenClient(opts) {
            lastTokenClient = opts;
            return {
              requestAccessToken(req) {
                // Simule la réponse GIS asynchrone.
                setImmediate(() => {
                  if (tokenError) opts.callback({ error: tokenError });
                  else if (tokenReply) opts.callback({ access_token: tokenReply });
                });
              },
            };
          },
        },
      },
    };
  }
  return { win, getLastTokenClient: () => lastTokenClient };
}

describe('lib/google-drive — getDriveToken', () => {
  test('GIS indisponible → reject', async () => {
    const { win } = makeWin({ gisAvailable: false });
    loadGoogleDriveInto(win);
    await assert.rejects(() => win.getDriveToken({}), /indisponible/i);
  });

  test('cache valide → renvoie le token sans appel GIS', async () => {
    const { win, getLastTokenClient } = makeWin({ tokenReply: 'NEVER-SHOULD-FIRE' });
    loadGoogleDriveInto(win);
    win.dp_driveToken = { access_token: 'CACHED', expires_at: Date.now() + 60_000 };
    const tok = await win.getDriveToken({ explicit: false });
    assert.equal(tok, 'CACHED');
    assert.equal(getLastTokenClient(), null, 'GIS ne doit pas être appelé');
  });

  test('cache expiré → demande un nouveau token via GIS', async () => {
    const { win, getLastTokenClient } = makeWin({ tokenReply: 'FRESH' });
    loadGoogleDriveInto(win);
    win.dp_driveToken = { access_token: 'STALE', expires_at: Date.now() - 1000 };
    const tok = await win.getDriveToken({ explicit: false });
    assert.equal(tok, 'FRESH');
    assert.equal(getLastTokenClient().scope, 'https://www.googleapis.com/auth/drive.file');
  });

  test('explicit=true force prompt=consent même si cache valide', async () => {
    const { win, getLastTokenClient } = makeWin({ tokenReply: 'NEW' });
    loadGoogleDriveInto(win);
    win.dp_driveToken = { access_token: 'CACHED', expires_at: Date.now() + 60_000 };
    const tok = await win.getDriveToken({ explicit: true });
    assert.equal(tok, 'NEW');
    assert.ok(getLastTokenClient(), 'GIS doit être appelé même avec cache');
  });

  test('GIS error → reject avec le message', async () => {
    const { win } = makeWin({ tokenError: 'access_denied' });
    loadGoogleDriveInto(win);
    await assert.rejects(() => win.getDriveToken({}), /access_denied/);
  });

  test('token frais est mis en cache (55 min)', async () => {
    const { win } = makeWin({ tokenReply: 'FRESH' });
    loadGoogleDriveInto(win);
    await win.getDriveToken({});
    assert.equal(win.dp_driveToken.access_token, 'FRESH');
    const delta = win.dp_driveToken.expires_at - Date.now();
    assert.ok(delta > 50 * 60 * 1000 && delta <= 55 * 60 * 1000,
      `expires_at devrait être ~55min, got ${delta}ms`);
  });
});

describe('lib/google-drive — getCsrfToken', () => {
  // getCsrfToken lit `document.cookie` (global). On installe un faux
  // document sur globalThis avant chaque test, on le retire ensuite pour ne
  // pas polluer les autres suites.
  function withFakeDocument(cookie, fn) {
    const prev = globalThis.document;
    globalThis.document = { cookie };
    try { return fn(); } finally {
      if (prev === undefined) delete globalThis.document;
      else globalThis.document = prev;
    }
  }

  test('cookie présent → token lu et décodé', () => {
    const { win } = makeWin();
    loadGoogleDriveInto(win);
    withFakeDocument('other=foo; dp_csrf=abc%20def; bar=baz', () => {
      assert.equal(win.getCsrfToken(), 'abc def');
    });
  });

  test('cookie absent → chaîne vide', () => {
    const { win } = makeWin();
    loadGoogleDriveInto(win);
    withFakeDocument('other=foo', () => {
      assert.equal(win.getCsrfToken(), '');
    });
  });

  test('document absent → chaîne vide (Node sans DOM)', () => {
    const { win } = makeWin();
    loadGoogleDriveInto(win);
    // Pas de document → on s'assure qu'il n'y en a pas.
    const prev = globalThis.document;
    delete globalThis.document;
    try {
      assert.equal(win.getCsrfToken(), '');
    } finally {
      if (prev !== undefined) globalThis.document = prev;
    }
  });
});
