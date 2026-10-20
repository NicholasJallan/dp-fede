// Tests — copie Google Drive facultative (préférence de l'appareil).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow, installGlobals } from './helpers/offline-harness.js';
import { isDriveExportEnabled, setDriveExportEnabled, DRIVE_PREF_EVENT } from '../src/api/drive-preference.js';

let win;
beforeEach(() => {
  win = createWindow();
  installGlobals(win);
});

describe('drive-preference', () => {
  test('activée par défaut (comportement historique)', () => {
    assert.equal(isDriveExportEnabled(), true);
  });

  test('désactivée puis réactivée, mémorisée et annoncée', () => {
    const events = [];
    win.addEventListener(DRIVE_PREF_EVENT, (e) => events.push(e.detail.on));
    setDriveExportEnabled(false);
    assert.equal(isDriveExportEnabled(), false);
    assert.equal(localStorage.getItem('dp-drive-export'), 'off');
    setDriveExportEnabled(true);
    assert.equal(isDriveExportEnabled(), true);
    assert.deepEqual(events, [false, true]);
  });

  test('stockage indisponible : activée, sans exception', () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error('bloqué');
      },
      setItem() {
        throw new Error('bloqué');
      },
    };
    assert.equal(isDriveExportEnabled(), true);
    assert.doesNotThrow(() => setDriveExportEnabled(false));
  });
});
