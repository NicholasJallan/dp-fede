// Test harness pour offline-store / outbox / sync / offline-api.
//
// Pose un faux window/localStorage/document sur globalThis, puis crée des
// instances NEUVES des modules (fabriques createOfflineStore / createOutbox /
// createSync) : chaque test part d'un état vierge. Les modules lisent les
// globaux (window, localStorage, fetch, CustomEvent…) au moment de l'appel.

import { randomUUID } from 'node:crypto';
import { createOfflineStore } from '../../src/offline/offline-store.js';
import { createOutbox } from '../../src/offline/outbox.js';
import { createSync } from '../../src/offline/sync.js';
import { decorateApiForOffline } from '../../src/offline/offline-api.js';

// Shim localStorage minimaliste.
export function makeLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

// Shim CustomEvent + EventTarget pour window/document.
class EventBus {
  constructor() { this._listeners = {}; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this._listeners[type];
    if (arr) this._listeners[type] = arr.filter(f => f !== fn);
  }
  dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach(fn => fn(ev)); }
}

export function createWindow() {
  const win = new EventBus();
  win.localStorage = makeLocalStorage();
  win.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  win.indexedDB = null;   // force fallback localStorage dans offline-store
  win.document = Object.assign(new EventBus(), {
    cookie: '',
    visibilityState: 'visible',
  });
  win.navigator = { onLine: true, serviceWorker: undefined };
  win.fetch = async () => { throw new Error('fetch mock not set'); };
  return win;
}

// Installe le faux window comme globaux (ce que lisent les modules à l'appel).
export function installGlobals(win) {
  globalThis.window       = win;
  globalThis.localStorage = win.localStorage;
  globalThis.indexedDB    = win.indexedDB;
  globalThis.document     = win.document;
  globalThis.CustomEvent  = win.CustomEvent;
  globalThis.fetch        = win.fetch;
  // navigator est un getter en lecture seule depuis Node 21 : on le redéfinit.
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
}

// Démarre store + outbox + sync neufs, accrochés au faux window :
//   win.offlineStore, win.outbox, win.sync. `win.netStatus` (optionnel)
//   est lu à chaque cycle, comme l'ancien window.netStatus.
//   `win.clubId` : club courant capturé par l'outbox à la mise en file
//   (HARNESS_CLUB par défaut ; null = club inconnu → item mis en revue).
export const HARNESS_CLUB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export function bootOffline() {
  const win = createWindow();
  installGlobals(win);
  win.clubId = HARNESS_CLUB;
  win.offlineStore = createOfflineStore();
  // Forcer le fallback localStorage dès le départ.
  win.offlineStore._useFallback();
  win.outbox = createOutbox({ store: win.offlineStore, uuid: randomUUID, getClubId: () => win.clubId || null });
  win.sync = createSync({
    store: win.offlineStore,
    outbox: win.outbox,
    getNetStatus: () => (typeof win.netStatus === 'function' ? win.netStatus() : null),
  });
  return win;
}

// Décore win.api (objet api factice) avec la couche offline du harness.
export function loadOfflineApi(win) {
  decorateApiForOffline(win.api, { store: win.offlineStore, outbox: win.outbox, uuid: randomUUID });
  return win.api;
}
