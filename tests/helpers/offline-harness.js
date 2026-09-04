// Test harness pour offline-store / outbox / sync.
// Pose un faux window/localStorage/document, fait passer les fichiers lib/*
// dans un eval indirect (même realm V8 que les tests, pour assert.deepEqual).

const fs   = require('fs');
const path = require('path');
const projectRoot = path.join(__dirname, '..', '..');

// Shim localStorage minimaliste.
function makeLocalStorage() {
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

function createWindow() {
  const win = new EventBus();
  win.localStorage = makeLocalStorage();
  win.crypto = { randomUUID: () => require('crypto').randomUUID() };
  win.randomUUID = () => win.crypto.randomUUID();
  win.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  win.indexedDB = null;   // force fallback localStorage dans offline-store
  win.setTimeout    = setTimeout;
  win.clearTimeout  = clearTimeout;
  win.setInterval   = setInterval;
  win.clearInterval = clearInterval;
  win.document = Object.assign(new EventBus(), {
    cookie: '',
    visibilityState: 'visible',
  });
  win.navigator = { onLine: true, serviceWorker: undefined };
  win.fetch = async () => { throw new Error('fetch mock not set'); };
  return win;
}

function loadScript(win, rel) {
  const code = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
  global.window       = win;
  globalThis.window   = win;
  global.localStorage = win.localStorage;
  global.indexedDB    = win.indexedDB;
  global.document     = win.document;
  global.navigator    = win.navigator;
  global.CustomEvent  = win.CustomEvent;
  global.fetch        = win.fetch;
  // Inject window.addEventListener etc. to globals too — net.js uses them via window.
  const indirectEval = eval;
  indirectEval(code);
}

function bootOffline() {
  const win = createWindow();
  // Ordre : offline-store, outbox, sync. (net.js et offline-api.js dépendent
  // d'api et de React — pas chargés pour ces tests unitaires.)
  loadScript(win, 'lib/offline-store.js');
  // Forcer le fallback localStorage dès le départ.
  win.offlineStore._useFallback();
  loadScript(win, 'lib/outbox.js');
  loadScript(win, 'lib/sync.js');
  return win;
}

// Comme bootOffline, plus lib/offline-api.js par-dessus un window.api stub.
// `sync.start()` est neutralisé : offline-api l'appelle en setTimeout(0) et il
// poserait des listeners + un interval de 60 s qui garderaient node --test en
// vie. Les tests appellent sync._drainOutbox() / _pullIncremental() directement.
function bootOfflineApi(apiStub) {
  const win = bootOffline();
  win.sync.start = () => {};
  win.api = apiStub;
  win.netStatus = () => ({ online: true });
  loadScript(win, 'lib/offline-api.js');
  return win;
}

module.exports = { createWindow, loadScript, bootOffline, bootOfflineApi, makeLocalStorage };
