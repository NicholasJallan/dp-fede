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
//   - timer périodique 60 s tant que l'onglet est visible (pull des
//     créations/modifications faites par les autres membres de la structure)
//
// Concurrence : un seul cycle à la fois. Les triggers concurrents sont
// fusionnés (un seul cycle queue).
//
// Handlers d'outbox : par défaut, sync.js sait dispatcher les kinds HTTP
// purs (dive.create/update/delete, diver.*, site.*). Le kind 'dive.drive'
// requiert la génération PDF + Google Drive et doit être enregistré par un
// module foreground via sync.registerHandler('dive.drive', fn). Tant qu'aucun
// handler n'est enregistré pour un kind, l'item reste en outbox sans erreur.

(function () {
  // Pull périodique tant que l'onglet est visible. Sans lui, les seuls
  // déclencheurs sont boot / online / visibilitychange / outbox : un moniteur
  // qui laisse l'app ouverte au premier plan ne voit jamais les plongeurs ni
  // les fiches créés par les autres membres de la structure.
  const PULL_INTERVAL_MS = 60000;

  // ── État interne ────────────────────────────────────────────────────────
  let _cycleInFlight = null;
  let _cycleQueued   = false;
  let _wakeTimer     = null;
  const _handlers    = {};  // kind → async (item) => void

  // ── Helpers réseau ──────────────────────────────────────────────────────
  // Lecture CSRF centralisée dans lib/google-drive.js → window.getCsrfToken.
  // Fallback inline pour les tests Node (setup.js n'expose pas le helper).
  function csrfToken() {
    if (typeof window !== 'undefined' && window.getCsrfToken) return window.getCsrfToken();
    if (typeof document === 'undefined') return '';
    const m = document.cookie.match(/(?:^|; )dp_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
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
      const local = await window.offlineStore.get('dives', item.payload.client_uuid);
      await window.offlineStore.put('dives', item.payload.client_uuid, {
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
      const local = await window.offlineStore.get('dives', client_uuid);
      if (!local?.server_id) {
        throw new Error(`dive.update: server_id inconnu pour ${client_uuid} — create pas encore synced`);
      }
      await http('PATCH', `/api/dives/${encodeURIComponent(local.server_id)}`, patch);
      const updated = await window.offlineStore.get('dives', client_uuid);
      if (updated) {
        // L'utilisateur a pu continuer à saisir pendant l'envoi : dans ce cas
        // un autre item attend et la fiche reste `_pending`, sinon le pull
        // incrémental écraserait les modifications pas encore poussées.
        const queued = await window.outbox.pending();
        const stillQueued = queued.some(i => i.id !== item.id
          && i.kind === 'dive.update'
          && i.payload?.client_uuid === client_uuid);
        await window.offlineStore.put('dives', client_uuid,
          { ...updated, ...patch, _pending: stillQueued });
      }
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    },

    'dive.delete': async (item) => {
      const { client_uuid } = item.payload;
      const local = await window.offlineStore.get('dives', client_uuid);
      if (local?.server_id) {
        await http('DELETE', `/api/dives/${encodeURIComponent(local.server_id)}`, {});
      }
      await window.offlineStore.del('dives', client_uuid);
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    },

    'diver.create': async (item) => {
      const res = await http('POST', '/api/divers', item.payload);
      await window.offlineStore.put('divers', item.payload.id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    },

    'diver.update': async (item) => {
      const { id, ...patch } = item.payload;
      const res = await http('PUT', `/api/divers/${encodeURIComponent(id)}`, patch);
      await window.offlineStore.put('divers', id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    },

    'diver.delete': async (item) => {
      await http('DELETE', `/api/divers/${encodeURIComponent(item.payload.id)}`, {});
      await window.offlineStore.del('divers', item.payload.id);
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    },

    'site.create': async (item) => {
      const res = await http('POST', '/api/sites', item.payload);
      await window.offlineStore.put('sites', item.payload.id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    },

    'site.update': async (item) => {
      const { id, ...patch } = item.payload;
      const res = await http('PUT', `/api/sites/${encodeURIComponent(id)}`, patch);
      await window.offlineStore.put('sites', id, { ...res, _pending: false });
      window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    },

    'site.delete': async (item) => {
      await http('DELETE', `/api/sites/${encodeURIComponent(item.payload.id)}`, {});
      await window.offlineStore.del('sites', item.payload.id);
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
  async function drainOutbox() {
    // On ne tente que si on est online (selon notre détecteur).
    if (window.netStatus && !window.netStatus().online) return;

    const items = await window.outbox.ready();
    for (const item of items) {
      const handler = getHandler(item.kind);
      if (!handler) {
        // Pas de handler enregistré (ex. dive.drive sans écran archive
        // monté). On laisse l'item, il repartira au prochain cycle.
        continue;
      }
      try {
        await window.outbox.markInflight(item.id);
        await handler(item);
        await window.outbox.markDone(item.id);
      } catch (err) {
        // Erreur 4xx (autre que 409 idempotence) : l'item est mal formé.
        // Le user a demandé un retry indéfini → on schedule un retry de
        // toute façon, mais on log lourdement.
        if (err.status === 409) {
          // Idempotence : le serveur a déjà la ressource. Considéré comme
          // un succès.
          await window.outbox.markDone(item.id);
        } else {
          console.warn(`[sync] ${item.kind} échec :`, err.message);
          await window.outbox.markFailed(item.id, err);
          // Si erreur réseau, on stoppe le drain (pas la peine d'enchaîner).
          if (!err.status) break;
        }
      }
    }
  }

  // ── Pull incrémental ────────────────────────────────────────────────────

  // Horodatage le plus récent d'une entrée de /api/sync/state, 0 si la table
  // est vide côté serveur. Le test naïf `Date.parse(x || 0)` renvoyait
  // Date.parse(0) → « 2000-01-01 » pour une table vide : le pull se croyait
  // en retard et retirait tout depuis 1970 à chaque cycle, sans jamais
  // pouvoir avancer son curseur (il n'y a pas de date à mémoriser).
  function cursorTs(entry) {
    if (!entry) return 0;
    return Math.max(
      entry.updated_at ? Date.parse(entry.updated_at) || 0 : 0,
      entry.deleted_at ? Date.parse(entry.deleted_at) || 0 : 0,
    );
  }

  async function pullIncremental() {
    if (window.netStatus && !window.netStatus().online) return;

    let state;
    try {
      state = await http('GET', '/api/sync/state');
    } catch (err) {
      // Pas de panique : on réessaiera. Si c'est 401, l'auth-context
      // émettra dp:authExpired via son re-check.
      return;
    }

    const meta = (await window.offlineStore.get('meta', 'sync')) || {};

    // Helper qui décide s'il faut pull et persiste le nouveau curseur.
    async function pullIfChanged(table, getter) {
      const local  = meta[table];
      const remote = cursorTs(state[table]);
      if (!remote) return;
      const localTs = local ? Date.parse(local) || 0 : 0;
      if (remote <= localTs) return; // rien de neuf

      const since = local || '1970-01-01T00:00:00';
      const list  = await getter(since);
      for (const row of list || []) {
        if (row.deleted) {
          await window.offlineStore.del(table, row.id);
        } else {
          // On préserve un éventuel flag _pending posé localement entre
          // temps (utilisateur a re-modifié pendant le sync).
          const cur = await window.offlineStore.get(table, row.id);
          if (cur?._pending) continue;
          await window.offlineStore.put(table, row.id, row);
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
    await window.offlineStore.put('meta', 'sync', meta);
    window.dispatchEvent(new CustomEvent('dp:syncDone', { detail: { at: meta.lastSyncAt } }));
  }

  async function pullDivesIfChanged(meta, state) {
    const remote = cursorTs(state.dives);
    if (!remote) return;
    const localTs = meta.dives ? Date.parse(meta.dives) || 0 : 0;
    if (remote <= localTs) return;

    const since = meta.dives || '1970-01-01T00:00:00';
    const list  = await http('GET', `/api/dives?since=${encodeURIComponent(since)}`);
    for (const row of list || []) {
      const key = row.client_uuid || row.id;
      if (!key) continue;
      if (row.deleted) {
        await window.offlineStore.del('dives', key);
      } else {
        const cur = await window.offlineStore.get('dives', key);
        if (cur?._pending) continue;
        // Fusion et non remplacement : `GET /api/dives?since=` ne renvoie que
        // le résumé (pas answers/palanquees/render_state). Un `put` sec
        // viderait la fiche mise en cache localement — invisible en ligne
        // (dives.get repasse par le réseau) mais fatal hors-ligne.
        // drive_synced est local uniquement (le serveur ne connaît que
        // drive_link) : une fois vrai (upload réel, ou session sans Drive
        // comme BEPPA Hendaye), un pull ne doit jamais le repasser à false.
        await window.offlineStore.put('dives', key, {
          ...(cur || {}), ...row,
          server_id: row.id, synced: true,
          drive_synced: !!row.drive_link || !!cur?.drive_synced,
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
    const delay = await window.outbox.nextWakeMs();
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

    setInterval(() => {
      if (document.visibilityState === 'visible') trigger('interval');
    }, PULL_INTERVAL_MS);

    // Premier cycle au démarrage, après avoir récupéré les items laissés
    // 'inflight' par une fermeture d'onglet en plein envoi.
    window.outbox.recoverInflight()
      .catch(() => 0)
      .then(() => trigger('boot'));
  }

  // ── API publique ────────────────────────────────────────────────────────
  window.sync = {
    trigger, cycle, start,
    registerHandler,
    // Pour les tests.
    _drainOutbox: drainOutbox,
    _pullIncremental: pullIncremental,
    _handlers: _handlers,
    _defaultHandlers: DEFAULT_HANDLERS,
  };
})();
