// DP Assistant — Wrapper offline-first par-dessus api.js.
//
// Décore les méthodes write de window.api pour passer par l'outbox au lieu
// d'aller directement au réseau. Les méthodes read (list/get) sont aussi
// décorées avec un fallback offlineStore.
//
// Cycle de vie des plongées :
//   dive.create  → POST   /api/dives  (status='prepared' par défaut)
//   dive.update  → PATCH  /api/dives/:id  (transitions + auto-save)
//   dive.delete  → DELETE /api/dives/:id  (suppression logique)
//   dive.drive   → enregistré par ScreenArchive (génération PDF + upload Drive)

(function () {
  if (!window.api) {
    console.error('[offline-api] window.api absent — chargement après api.js requis');
    return;
  }

  const original = {
    divers:   { ...window.api.divers },
    sites:    { ...window.api.sites  },
    dives:    { ...window.api.dives  },
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  function withId(payload) {
    return payload.id ? payload : { ...payload, id: window.randomUUID() };
  }

  async function listWithFallback(store, networkCall) {
    try {
      const list = await networkCall();
      if (Array.isArray(list)) {
        await Promise.all(list.map(async (row) => {
          const key = row.client_uuid || row.id;
          if (!key) return;
          const cur = await window.offlineStore.get(store, key);
          if (cur?._pending) return;
          await window.offlineStore.put(store, key, row);
        }));
      }
      return list;
    } catch {
      const cached = await window.offlineStore.all(store);
      return cached.filter(r => !r?.deleted);
    }
  }

  // ── Divers ──────────────────────────────────────────────────────────────

  window.api.divers.list = async () => listWithFallback('divers',
    () => original.divers.list());

  window.api.divers.create = async (data) => {
    const payload = withId(data);
    await window.offlineStore.put('divers', payload.id, { ...payload, _pending: true });
    await window.outbox.enqueue('diver.create', payload);
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    return { ...payload, _pending: true };
  };

  window.api.divers.update = async (id, data) => {
    const payload = { ...data, id };
    const cur = await window.offlineStore.get('divers', id);
    await window.offlineStore.put('divers', id, { ...(cur || {}), ...payload, _pending: true });
    await window.outbox.enqueue('diver.update', payload);
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    return { ...payload, _pending: true };
  };

  window.api.divers.delete = async (id) => {
    await window.offlineStore.del('divers', id);
    await window.outbox.enqueue('diver.delete', { id });
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'divers' } }));
    return null;
  };

  // ── Sites ───────────────────────────────────────────────────────────────

  window.api.sites.list = async () => listWithFallback('sites',
    () => original.sites.list());

  window.api.sites.create = async (data) => {
    const payload = withId(data);
    await window.offlineStore.put('sites', payload.id, { ...payload, _pending: true });
    await window.outbox.enqueue('site.create', payload);
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    return { ...payload, _pending: true };
  };

  window.api.sites.update = async (id, data) => {
    const payload = { ...data, id };
    const cur = await window.offlineStore.get('sites', id);
    await window.offlineStore.put('sites', id, { ...(cur || {}), ...payload, _pending: true });
    await window.outbox.enqueue('site.update', payload);
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    return { ...payload, _pending: true };
  };

  window.api.sites.delete = async (id) => {
    await window.offlineStore.del('sites', id);
    await window.outbox.enqueue('site.delete', { id });
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'sites' } }));
    return null;
  };

  // ── Dives ────────────────────────────────────────────────────────────────

  // list() : fusionne réseau + store local, déduplicé par client_uuid.
  window.api.dives.list = async () => {
    let serverList = [];
    let networkOk  = false;
    try {
      serverList = await original.dives.list();
      networkOk  = true;
    } catch { /* offline */ }

    const local = await window.offlineStore.all('dives');

    if (networkOk) {
      for (const row of serverList) {
        const key = row.client_uuid || row.id;
        const cur = local.find(l => l.server_id === row.id || l.client_uuid === row.client_uuid);
        const merged = {
          ...(cur || {}),
          ...row,
          server_id:    row.id,
          client_uuid:  cur?.client_uuid || row.client_uuid,
          synced:       true,
          drive_synced: !!row.drive_link,
        };
        if (key) await window.offlineStore.put('dives', key, merged);
      }
    }

    const byKey = new Map();
    for (const row of serverList) {
      const key = row.client_uuid || row.id;
      if (key) byKey.set(key, {
        ...row, _pending: false, drive_synced: !!row.drive_link, synced: true,
      });
    }
    for (const row of local) {
      const key = row.client_uuid || row.server_id || row.id;
      if (byKey.has(key)) continue;
      if (row.deleted) continue;
      byKey.set(key, {
        id:           row.server_id || row.client_uuid,
        client_uuid:  row.client_uuid,
        status:       row.status || 'prepared',
        site_nom:     row.site_nom,
        date_plongee: row.date_plongee,
        planned_at:   row.planned_at,
        started_at:   row.started_at,
        dp_nom:       row.dp_nom,
        dp_qual:      row.dp_qual,
        activite:     row.activite,
        drive_link:   row.drive_link || '',
        nb_palanquees: Array.isArray(row.palanquees) ? row.palanquees.length : 0,
        nb_plongeurs:  Array.isArray(row.palanquees)
          ? row.palanquees.reduce((n, p) => n + (p.membres?.length || 0), 0) : 0,
        _pending:     !row.synced,
        synced:       !!row.synced,
        drive_synced: !!row.drive_synced,
      });
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const da = a.date_plongee || '';
      const db = b.date_plongee || '';
      return db.localeCompare(da);
    });
  };

  // listArchived() — utilisé par screen-archives.jsx et screen-home.jsx
  window.api.dives.listArchived = async () => {
    const all = await window.api.dives.list();
    return all.filter(d => !d.status || d.status === 'archived');
  };

  // listActive() — plongées préparées + en cours (pour la home)
  window.api.dives.listActive = async () => {
    const all = await window.api.dives.list();
    return all.filter(d => d.status === 'prepared' || d.status === 'in_progress');
  };

  // get(id) — essaie réseau, fallback store local
  window.api.dives.get = async (id) => {
    try {
      return await original.dives.get(id);
    } catch (err) {
      const all = await window.offlineStore.all('dives');
      const hit = all.find(a => a.server_id === id || a.client_uuid === id);
      if (hit) return hit;
      throw err;
    }
  };

  // create(data) — optimistic + outbox
  window.api.dives.create = async (data) => {
    const client_uuid = data.client_uuid || window.randomUUID();
    const payload     = { ...data, client_uuid };
    await window.offlineStore.put('dives', client_uuid, {
      ...payload,
      status:       payload.status || 'prepared',
      _pending:     true,
      synced:       false,
      drive_synced: false,
    });
    await window.outbox.enqueue('dive.create', payload);
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    return { client_uuid, _pending: true };
  };

  // update(client_uuid, patch) — optimistic + outbox
  window.api.dives.update = async (client_uuid, patch) => {
    const cur     = await window.offlineStore.get('dives', client_uuid) || {};
    const merged  = { ...cur, ...patch, _pending: true };
    if (patch.status === 'archived') {
      merged.drive_synced = !!patch.drive_link || !!cur.drive_link;
    }
    await window.offlineStore.put('dives', client_uuid, merged);
    await window.outbox.enqueue('dive.update', { client_uuid, patch });
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    return merged;
  };

  // delete(client_uuid) — optimistic soft-delete
  window.api.dives.delete = async (client_uuid) => {
    const cur = await window.offlineStore.get('dives', client_uuid);
    if (cur) await window.offlineStore.put('dives', client_uuid, { ...cur, deleted: true, _pending: true });
    await window.outbox.enqueue('dive.delete', { client_uuid });
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    return null;
  };

  // markDriveDone(client_uuid, drive_link) → PATCH server + store
  window.api.dives.markDriveDone = async (client_uuid, drive_link) => {
    const local = await window.offlineStore.get('dives', client_uuid);
    if (!local?.server_id) {
      throw new Error('Plongée non encore synchronisée — impossible de PATCH drive_link');
    }
    const csrf = (document.cookie.match(/(?:^|; )dp_csrf=([^;]+)/) || [])[1] || '';
    const res  = await fetch(`/api/dives/${encodeURIComponent(local.server_id)}`, {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
      body:        JSON.stringify({ drive_link }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `PATCH HTTP ${res.status}`);
    await window.offlineStore.put('dives', client_uuid, { ...local, drive_link, drive_synced: true });
    window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store: 'dives' } }));
    return json.data;
  };

  // pendingDrive() — plongées archivées mais sans Drive
  window.api.dives.pendingDrive = async () => {
    const all = await window.offlineStore.all('dives');
    return all.filter(a => a.synced && !a.drive_synced && a.status === 'archived');
  };

  // ── Démarrage de l'orchestrateur ─────────────────────────────────────────
  setTimeout(() => {
    if (window.sync && window.sync.start) window.sync.start();
  }, 0);
})();
