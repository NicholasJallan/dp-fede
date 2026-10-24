// Tests unitaires — idempotence upload Google Drive (src/api/drive-upload.js)

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { driveUploadFileOnce } from '../src/api/drive-upload.js';

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('driveUploadFileOnce — upload idempotent avec recherche préalable', () => {
  test("fichier existant trouvé : renvoie id et webViewLink sans appeler l'API d'upload", async () => {
    let getCalled = false;
    let postCalled = false;

    globalThis.fetch = async (url, _opts = {}) => {
      const u = String(url);
      if (u.startsWith('https://www.googleapis.com/drive/v3/files')) {
        getCalled = true;
        const urlObj = new URL(u);
        const q = urlObj.searchParams.get('q');
        assert.ok(q.includes("name='fiche.pdf'"));
        assert.ok(q.includes("'folder-123' in parents"));
        assert.ok(q.includes('trashed=false'));
        return {
          ok: true,
          json: async () => ({
            files: [{ id: 'file-exist-1', webViewLink: 'https://drive.google.com/file/d/file-exist-1/view' }],
          }),
        };
      }
      if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        postCalled = true;
        return { ok: true, json: async () => ({ id: 'new-file', webViewLink: '...' }) };
      }
      throw new Error(`URL inattendue : ${url}`);
    };

    const blob = new Blob(['pdf-data'], { type: 'application/pdf' });
    const res = await driveUploadFileOnce('token-abc', blob, 'fiche.pdf', 'folder-123');

    assert.equal(getCalled, true);
    assert.equal(postCalled, false, "Aucun POST d'upload ne doit être émis quand le fichier existe déjà");
    assert.deepEqual(res, {
      id: 'file-exist-1',
      webViewLink: 'https://drive.google.com/file/d/file-exist-1/view',
    });
  });

  test("aucun fichier trouvé : procède au POST d'upload et renvoie son résultat", async () => {
    let getCalled = false;
    let postCalled = false;

    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.startsWith('https://www.googleapis.com/drive/v3/files')) {
        getCalled = true;
        return {
          ok: true,
          json: async () => ({ files: [] }),
        };
      }
      if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        postCalled = true;
        assert.equal(opts.method, 'POST');
        assert.equal(opts.headers?.Authorization, 'Bearer token-abc');
        return {
          ok: true,
          json: async () => ({ id: 'new-uploaded-id', webViewLink: 'https://drive.google.com/new' }),
        };
      }
      throw new Error(`URL inattendue : ${url}`);
    };

    const blob = new Blob(['pdf-data'], { type: 'application/pdf' });
    const res = await driveUploadFileOnce('token-abc', blob, 'nouvelle_fiche.pdf', 'folder-123');

    assert.equal(getCalled, true);
    assert.equal(postCalled, true);
    assert.deepEqual(res, {
      id: 'new-uploaded-id',
      webViewLink: 'https://drive.google.com/new',
    });
  });

  test('échappement des apostrophes et antislashs dans le nom recherché', async () => {
    let capturedQ = null;

    globalThis.fetch = async (url, _opts = {}) => {
      const u = String(url);
      if (u.startsWith('https://www.googleapis.com/drive/v3/files')) {
        const urlObj = new URL(u);
        capturedQ = urlObj.searchParams.get('q');
        return {
          ok: true,
          json: async () => ({ files: [{ id: 'found-escaped', webViewLink: 'https://drive.../view' }] }),
        };
      }
      throw new Error(`URL inattendue : ${url}`);
    };

    const blob = new Blob(['data']);
    // Nom contenant apostrophe et antislash
    await driveUploadFileOnce('token-abc', blob, "l'Estaque\\sud.pdf", 'folder-123');

    assert.ok(capturedQ);
    assert.ok(capturedQ.includes("name='l\\'Estaque\\\\sud.pdf'"));
  });

  test('échec HTTP de la recherche : uploade quand même pour ne pas perdre la fiche', async () => {
    let getCalled = false;
    let postCalled = false;

    globalThis.fetch = async (url, _opts = {}) => {
      const u = String(url);
      if (u.startsWith('https://www.googleapis.com/drive/v3/files')) {
        getCalled = true;
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Internal error' } }),
        };
      }
      if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        postCalled = true;
        return {
          ok: true,
          json: async () => ({ id: 'fallback-uploaded-id', webViewLink: 'https://drive.google.com/fb' }),
        };
      }
      throw new Error(`URL inattendue : ${url}`);
    };

    const blob = new Blob(['data']);
    const res = await driveUploadFileOnce('token-abc', blob, 'fiche.pdf', 'folder-123');

    assert.equal(getCalled, true);
    assert.equal(postCalled, true);
    assert.deepEqual(res, {
      id: 'fallback-uploaded-id',
      webViewLink: 'https://drive.google.com/fb',
    });
  });
});
