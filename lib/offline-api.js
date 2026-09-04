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

  // Liste réconciliée : la réponse serveur fait autorité, sauf pour les lignes
  // encore `_pending` (créées/modifiées ici et pas encore poussées) qui sont
  // fusionnées par-dessus. Trois raisons :
  //   - une création qui vient d'être faite ne doit jamais disparaître de la
  //     liste au refresh suivant, même si le POST n'est pas encore parti ;
  //   - une ligne supprimée ailleurs doit disparaître du store local, sinon
  //     elle y ressuscite et réapparaît dès qu'on passe hors-ligne ;
  //   - hors-ligne, on retombe intégralement sur le store.
  // La liste sans `?since=` exclut les soft-deletes côté serveur : ce qui n'y
  // est pas et n'est pas `_pending` n'existe plus.
  async function listWithFallback(store, networkCall) {
    let list;
    try {
      list = await networkCall();
    } catch {
      const cached = await window.offlineStore.all(store);
      return cached.filter(r => !r?.deleted).sort(byNom);
    }
    if (!Array.isArray(list)) return list;

    const local   = await window.offlineStore.all(store);
    const pending = new Map();
    for (const row of local) {
      const key = row.client_uuid || row.id;
      if (key && row._pending && !row.deleted) pending.set(key, row);
    }

    const seen = new Set();
    for (const row of list) {
      const key = row.client_uuid || row.id;
      if (!key) continue;
      seen.add(key);
      if (pending.has(key)) continue;          // nos écritures locales priment
      await window.offlineStore.put(store, key, row);
    }

    // Purge des fantômes : présents en local, confirmés (non `_pending`),
    // mais absents de la réponse serveur → supprimés ailleurs.
    for (const row of local) {
      const key = row.client_uuid || row.id;
      if (!key || seen.has(key) || pending.has(key)) continue;
      await window.offlineStore.del(store, key);
    }

    const merged = list.map(row => pending.get(row.client_uuid || row.id) || row);
    for (const [key, row] of pending) {
      if (!seen.has(key)) merged.push(row);    // création pas encore poussée
    }
    return merged.sort(byNom);
  }

  // Même tri que le serveur (`ORDER BY nom, prenom`), pour que l'insertion
  // d'une ligne `_pending` ne fasse pas sauter l'annuaire.
  function byNom(a, b) {
    return String(a.nom || '').localeCompare(String(b.nom || ''))
        || String(a.prenom || '').localeCompare(String(b.prenom || ''));
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
    // drive_synced est un champ local uniquement (le serveur ne connaît que
    // drive_link) : une fois posé à true (upload Drive réel, ou session sans
    // Drive comme BEPPA Hendaye), un pull ne doit jamais le repasser à false.
    const findCur = (row) => local.find(l => l.server_id === row.id || l.client_uuid === row.client_uuid);
    const driveSynced = (row, cur) => !!row.drive_link || !!cur?.drive_synced;

    if (networkOk) {
      for (const row of serverList) {
        const key = row.client_uuid || row.id;
        const cur = findCur(row);
        const merged = {
          ...(cur || {}),
          ...row,
          server_id:    row.id,
          client_uuid:  cur?.client_uuid || row.client_uuid,
          synced:       true,
          drive_synced: driveSynced(row, cur),
        };
        if (key) await window.offlineStore.put('dives', key, merged);
      }
    }

    const byKey = new Map();
    for (const row of serverList) {
      const key = row.client_uuid || row.id;
      if (key) byKey.set(key, {
        ...row, _pending: false, drive_synced: driveSynced(row, findCur(row)), synced: true,
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

  // get(id) — préfère le store local si _pending (données plus récentes que le serveur)
  window.api.dives.get = async (id) => {
    const local = await window.offlineStore.get('dives', id);
    if (local?._pending) return local;
    try {
      return await original.dives.get(id);
    } catch (err) {
      if (local) return local;
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
      drive_synced: payload.drive_synced === true,
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
      // drive_synced explicite (session sans archivage Drive, ex. BEPPA Hendaye)
      // prime sur le calcul par défaut — sinon le dive réapparaît dans
      // « Finaliser sur Drive » sur l'accueil alors qu'aucun upload n'est prévu.
      merged.drive_synced = patch.drive_synced === true
        ? true
        : (!!patch.drive_link || !!cur.drive_link);
    }
    await window.offlineStore.put('dives', client_uuid, merged);
    // Coalescé par fiche : l'auto-save tire toutes les 500 ms et seul le
    // dernier état compte. Les patchs sont des « pose ces champs », donc les
    // fusionner dans l'ordre d'arrivée donne exactement le même résultat que
    // de les rejouer un par un — en un seul PATCH.
    await window.outbox.enqueue('dive.update', { client_uuid, patch }, {
      coalesceKey:  client_uuid,
      mergePayload: (prev, next) => ({
        client_uuid,
        patch: { ...prev.patch, ...next.patch },
      }),
    });
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
    const csrf = window.getCsrfToken ? window.getCsrfToken() : '';
    const res  = await fetch(`/api/dives/${encodeURIComponent(local.server_id)}`, {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
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
