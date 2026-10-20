// @ts-check
// DP Assistant — Orchestrateur de sync.
//
// Responsabilités :
//   1. Drainer l'outbox (FIFO, backoff exp côté outbox).
//   2. Pull incrémental : GET /api/sync/state, comparer aux meta locaux, et
//      tirer ?since=... sur les tables qui ont bougé côté serveur.
//
// Déclencheurs :
//   - window.online              (navigateur online)
//   - dp:netchange { online: true }  (notre ping)
//   - visibilitychange → visible
//   - dp:sw { type: 'SYNC_TRIGGER' } (Background Sync API)
//   - sync.trigger() manuel
//   - timer post-backoff (calculé via outbox.nextWakeMs)
//
// Concurrence : un seul cycle à la fois. Les triggers concurrents sont
// fusionnés (un seul cycle queue).
//
// Handlers d'outbox : sync.js dispatche les kinds HTTP purs
// (dive.create/update/delete, diver.*, site.*). Le dépôt Google Drive n'est
// PAS un kind d'outbox : il exige un jeton Google interactif et passe par
// finalizePendingDrive (src/screens/screen-archive.jsx), relancé depuis
// l'accueil. Un ancien item 'dive.drive' resterait sans handler (aucun code
// ne l'enqueue plus) ; registerHandler reste disponible pour un kind futur.

import { offlineStore } from './offline-store.js';
import { outbox as defaultOutbox } from './outbox.js';
import { netStatus } from './net.js';
import { getCsrfToken } from '../api/google-drive.js';
import { notifyIfAuthExpired } from '../api/auth-events.js';

// Fabrique : `store` (offline-store), `outbox` (createOutbox) et
// `getNetStatus` (() => { online }) sont injectés. fetch, window et document
// sont lus à l'appel (globaux du navigateur, ou faux globaux en test).
export function createSync({ store, outbox, getNetStatus }) {
  // ── État interne ────────────────────────────────────────────────────────
  let _cycleInFlight = null;
  let _cycleQueued   = false;
  let _wakeTimer     = null;
  const _handlers    = {};  // kind → async (item) => void

  // ── Helpers réseau ──────────────────────────────────────────────────────
  // Lecture CSRF centralisée dans src/api/google-drive.js (getCsrfToken).
  function csrfToken() {
    return getCsrfToken();
  }

  // Hors-ligne selon le détecteur réseau injecté (absent → on tente).
  function isOffline() {
    const status = getNetStatus ? getNetStatus() : null;
    return !!status && !status.online;
  }

  async function http(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (['POST','PUT','PATCH','DELETE'].includes(method)) {
      headers['X-CSRF-Token'] = csrfToken();
    }
    const res = await fetch(path, {
      method, headers, credentials: 'include',
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, error: 'invalid json' }));
    if (!res.ok || !json.ok) {
      notifyIfAuthExpired(res.status, path);
      const err = new Error(json.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.responseBody = json;
      throw err;
    }
    return json.data;
  }

  // ── Handlers par défaut (HTTP-only) ─────────────────────────────────────
  const DEFAULT_HANDLERS = {
    'dive.create': async (item) => {
      const res = await http('POST', '/api/dives', item.payload);
      const local = await store.get('dives', item.payload.client_uuid);
      await store.put('dives', item.payload.client_uuid, {
        ...(local || {}),
        ...(item.payload || {}),
        client_uuid: item.payload.client_uuid,
        server_id: res.id,
        synced: true,
      });
      window.dispatchEvent(new CustomEvent('dp:diveSynced', {
        detail: { client_uuid: item.payload.client_uuid, server_id: res.id },
      }));
    },

    'dive.update': async (item) => {
      const { client_uuid, patch } = item.payload;
      const local = await store.get('dives', client_uuid);
      if (!local?.server_id) {
        throw new Error(`dive.update: server_id inconnu pour ${client_uuid} — create pas encore synced`);
      }
      try {
        await http('PATCH', `/api/dives/${encodeURIComponent(local.server_id)}`, patch);
      } catch (err) {
        // 409 = le serveur a refusé un patch qui aurait vidé la plongée : on
        // lève le flag local pour que le prochain pull rapatrie la vraie version.
        if (err.status === 409) {
          const cur = await store.get('dives', client_uuid);
          if (cur) await store.put('dives', client_uuid, { ...cur, _pending: false });
          const meta = (await store.get('meta', 'sync')) || {};
          await store.put('meta', 'sync', { ...meta, dives: null });
        }
        throw err;
      }
      const updated = await store.get('dives', client_uuid);
      if (updated) {
        await store.put('dives', client_uuid, { ...updated, ...patch, _pending: false });
      }
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    },

    'dive.delete': async (item) => {
      const { client_uuid } = item.payload;
      const local = await store.get('dives', client_uuid);
      if (local?.server_id) {
        await http('DELETE', `/api/dives/${encodeURIComponent(local.server_id)}`, {});
      }
      await store.del('dives', client_uuid);
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    },

    'diver.create': async (item) => {
      const res = await http('POST', '/api/divers', item.payload);
      await store.put('divers', item.payload.id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    },

    'diver.update': async (item) => {
      const { id, ...patch } = item.payload;
      const res = await http('PUT', `/api/divers/${encodeURIComponent(id)}`, patch);
      await store.put('divers', id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    },

    'diver.delete': async (item) => {
      await http('DELETE', `/api/divers/${encodeURIComponent(item.payload.id)}`, {});
      await store.del('divers', item.payload.id);
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    },

    'site.create': async (item) => {
      const res = await http('POST', '/api/sites', item.payload);
      await store.put('sites', item.payload.id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    },

    'site.update': async (item) => {
      const { id, ...patch } = item.payload;
      const res = await http('PUT', `/api/sites/${encodeURIComponent(id)}`, patch);
      await store.put('sites', id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    },

    'site.delete': async (item) => {
      await http('DELETE', `/api/sites/${encodeURIComponent(item.payload.id)}`, {});
      await store.del('sites', item.payload.id);
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    },
  };

  function registerHandler(kind, fn) {
    _handlers[kind] = fn;
  }

  function getHandler(kind) {
    return _handlers[kind] || DEFAULT_HANDLERS[kind] || null;
  }

  // ── Drain de l'outbox ───────────────────────────────────────────────────
  // Clé d'entité : garantit l'ordre par entité (un PATCH ancien ne doit
  // jamais repasser après un plus récent de la même plongée).
  function entityKey(item) {
    const p = item.payload || {};
    const type = String(item.kind).split('.')[0];
    return `${type}:${p.client_uuid || p.id || ''}`;
  }

  // 400/422 : refus métier, rejouer ne sert à rien tant que l'utilisateur
  // n'a pas corrigé → revue. 401/403/429/5xx/réseau : problème transitoire
  // ou de session → on retente plus tard et on arrête le drain.
  const REVIEW_STATUSES = new Set([400, 404, 422]);

  async function drainOutbox() {
    // On ne tente que si on est online (selon notre détecteur).
    if (isOffline()) return;

    const items = await outbox.ready();
    // Entités bloquées : en revue, en attente de backoff ou échouées pendant ce drain.
    const all = await outbox.pending();
    const blocked = new Set(all
      .filter(it => it.status === 'review' || (it.nextRetryAt || 0) > Date.now())
      .map(entityKey));

    for (const item of items) {
      const key = entityKey(item);
      if (blocked.has(key)) continue;
      const handler = getHandler(item.kind);
      if (!handler) {
        // Pas de handler enregistré (ex. dive.drive sans écran archive
        // monté). On laisse l'item, il repartira au prochain cycle.
        blocked.add(key);
        continue;
      }
      try {
        await outbox.markInflight(item.id);
        await handler(item);
        await outbox.markDone(item.id);
      } catch (err) {
        if (err.status === 409) {
          // Idempotence : le serveur a déjà la ressource. Considéré comme
          // un succès.
          await outbox.markDone(item.id);
          continue;
        }
        console.warn(`[sync] ${item.kind} échec :`, err.message);
        blocked.add(key);
        if (REVIEW_STATUSES.has(err.status)) {
          await outbox.markReview(item.id, err);
          continue;
        }
        await outbox.markFailed(item.id, err);
        // Réseau, session, quota ou serveur en difficulté : inutile d'enchaîner.
        if (!err.status || err.status === 401 || err.status === 403 || err.status === 429 || err.status >= 500) break;
      }
    }
  }

  // ── Pull incrémental ────────────────────────────────────────────────────
  // Attention : Date.parse(0) vaut l'an 2000 dans V8 — ne jamais parser un
  // fallback numérique, sinon une table vide déclenche un pull à chaque cycle.
  function ts(v) {
    return v ? (Date.parse(v) || 0) : 0;
  }

  async function pullIncremental() {
    if (isOffline()) return;

    let state;
    try {
      state = await http('GET', '/api/sync/state');
    } catch (err) {
      // Pas de panique : on réessaiera. Si c'est 401, l'auth-context
      // émettra dp:authExpired via son re-check.
      return;
    }

    const meta = (await store.get('meta', 'sync')) || {};

    // Helper qui décide s'il faut pull et persiste le nouveau curseur.
    async function pullIfChanged(table, getter) {
      const local  = meta[table];
      if (!state[table]) return;
      const remote = Math.max(ts(state[table].updated_at), ts(state[table].deleted_at));
      if (!remote) return;
      const localTs = ts(local);
      if (remote <= localTs) return; // rien de neuf

      const since = local || '1970-01-01T00:00:00';
      const list  = await getter(since);
      for (const row of list || []) {
        if (row.deleted) {
          await store.del(table, row.id);
        } else {
          // On préserve un éventuel flag _pending posé localement entre
          // temps (utilisateur a re-modifié pendant le sync).
          const cur = await store.get(table, row.id);
          if (cur?._pending) continue;
          await store.put(table, row.id, { ...(cur || {}), ...row });
        }
      }
      meta[table] = state[table].updated_at || state[table].deleted_at || meta[table];
    }

    try {
      await pullIfChanged('divers',
        (since) => http('GET', `/api/divers?since=${encodeURIComponent(since)}`));
      await pullIfChanged('sites',
        (since) => http('GET', `/api/sites?since=${encodeURIComponent(since)}`));
      // dives : clé = client_uuid (pas id serveur)
      await pullDivesIfChanged(meta, state);
    } catch (err) {
      console.warn('[sync] pull incrémental échec :', err.message);
    }

    meta.lastSyncAt = new Date().toISOString();
    await store.put('meta', 'sync', meta);
    window.dispatchEvent(new CustomEvent('dp:syncDone', { detail: { at: meta.lastSyncAt } }));
  }

  async function pullDivesIfChanged(meta, state) {
    if (!state.dives) return;
    const remote = Math.max(ts(state.dives.updated_at), ts(state.dives.deleted_at));
    if (!remote) return;
    const localTs = ts(meta.dives);
    if (remote <= localTs) return;

    const since = meta.dives || '1970-01-01T00:00:00';
    const list  = await http('GET', `/api/dives?since=${encodeURIComponent(since)}`);
    for (const row of list || []) {
      const key = row.client_uuid || row.id;
      if (!key) continue;
      if (row.deleted) {
        await store.del('dives', key);
      } else {
        const cur = await store.get('dives', key);
        if (cur?._pending) continue;
        // La liste serveur est un résumé (sans answers/palanquees/render_state) :
        // on fusionne pour ne jamais perdre le contenu complet déjà en local.
        await store.put('dives', key, {
          ...(cur || {}), ...row, client_uuid: key,
          server_id: row.id, synced: true, drive_synced: !!row.drive_link,
        });
      }
    }
    meta.dives = state.dives.updated_at || state.dives.deleted_at || meta.dives;
  }


  // ── Cycle complet ───────────────────────────────────────────────────────
  async function cycle() {
    if (_cycleInFlight) {
      _cycleQueued = true;
      return;
    }
    _cycleInFlight = (async () => {
      try {
        await drainOutbox();
        await pullIncremental();
      } finally {
        _cycleInFlight = null;
        scheduleWake();
        if (_cycleQueued) {
          _cycleQueued = false;
          // Re-cycle si demandé pendant l'exécution.
          cycle();
        }
      }
    })();
    return _cycleInFlight;
  }

  // Programme le prochain réveil basé sur le plus court délai de retry
  // dans l'outbox. Évite les wakeups inutiles si rien n'est en attente.
  async function scheduleWake() {
    if (_wakeTimer) clearTimeout(_wakeTimer);
    const delay = await outbox.nextWakeMs();
    if (delay == null) return;          // rien à attendre
    const ms = Math.max(1000, Math.min(delay, 5 * 60 * 1000)); // 1s .. 5min max
    _wakeTimer = setTimeout(() => cycle(), ms);
  }

  // ── Triggers ────────────────────────────────────────────────────────────
  function trigger(reason) {
    cycle();
    if (reason) window.dispatchEvent(new CustomEvent('dp:syncTrigger', { detail: { reason } }));
  }

  function start() {
    window.addEventListener('online', () => trigger('navigator-online'));
    window.addEventListener('dp:netchange', (e) => {
      if (e.detail.online) trigger('net-ping-ok');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') trigger('visible');
    });
    window.addEventListener('dp:outboxChanged', () => trigger('outbox-changed'));
    window.addEventListener('dp:sw', (e) => {
      if (e.detail?.type === 'SYNC_TRIGGER') trigger('background-sync');
    });

    // Background Sync API si supportée (Chrome Android principalement).
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready
        .then(reg => reg.sync.register('dp-outbox'))
        .catch(() => { /* unsupported ou refusé */ });
    }

    // Premier cycle au démarrage.
    trigger('boot');
  }

  // ── API publique ────────────────────────────────────────────────────────
  return {
    trigger, cycle, start,
    registerHandler,
    // Pour les tests.
    _drainOutbox: drainOutbox,
    _pullIncremental: pullIncremental,
    _handlers: _handlers,
    _defaultHandlers: DEFAULT_HANDLERS,
  };
}

export const sync = createSync({ store: offlineStore, outbox: defaultOutbox, getNetStatus: netStatus });
