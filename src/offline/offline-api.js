// DP Assistant — Wrapper offline-first par-dessus src/api/api.js.
//
// decorateApiForOffline(api) remplace EN PLACE les méthodes write de `api`
// pour passer par l'outbox au lieu d'aller directement au réseau. Les
// méthodes read (list/get) sont aussi décorées avec un fallback offlineStore.
// La décoration est en place (et non une copie) : tous les modules importent
// le même objet `api`, décoré une seule fois au démarrage (src/app/bootstrap.js).
//
// Cycle de vie des plongées :
//   dive.create  → POST   /api/dives  (status='prepared' par défaut)
//   dive.update  → PATCH  /api/dives/:id  (transitions + auto-save)
//   dive.delete  → DELETE /api/dives/:id  (suppression logique)
//   Drive        → hors outbox : finalizePendingDrive (src/screens/screen-archive.jsx)

import { offlineStore } from './offline-store.js';
import { outbox as defaultOutbox } from './outbox.js';
import { randomUUID } from './uuid.js';
import { getCsrfToken } from '../api/google-drive.js';
import { notifyIfAuthExpired } from '../api/auth-events.js';
import { clubHeaders, getCurrentClubId } from '../api/club-header.js';

function emitDataChanged(store) {
  window.dispatchEvent(new CustomEvent('dp:dataChanged', { detail: { store } }));
}

// Même tri que le serveur (ORDER BY nom, prenom) : une ligne locale insérée
// ne fait pas sauter la liste.
function byNom(a, b) {
  return (
    String(a.nom || '').localeCompare(String(b.nom || '')) ||
    String(a.prenom || '').localeCompare(String(b.prenom || ''))
  );
}

const rowKey = (row) => row?.client_uuid || row?.id;

// Liste réconciliée (annuaire, sites) : la réponse serveur fait autorité, sauf
//   - les lignes `_pending` (créées / modifiées ici, pas encore poussées) :
//     fusionnées par-dessus, une création ne disparaît jamais au refresh ;
//   - les suppressions encore en file (`hiddenKeys`) : masquées ;
//   - les lignes confirmées absentes du serveur (supprimées ailleurs) :
//     purgées du store, sinon elles ressuscitent au passage hors ligne.
// Hors ligne : uniquement le store. (La liste sans ?since= exclut les
// soft-deletes : ce qui n'y est pas et n'est pas en attente n'existe plus.)
async function listWithFallback(store, storeName, networkCall, hiddenKeys = async () => new Set()) {
  // Lignes déjà synchronisées AVANT l'appel : seules elles peuvent être
  // purgées (une ligne poussée pendant l'appel n'est pas encore dans la
  // réponse et ne doit pas disparaître du store).
  const syncedBefore = new Set((await store.all(storeName)).filter((r) => !r?._pending).map(rowKey));
  let list;
  try {
    list = await networkCall();
  } catch {
    const hidden = await hiddenKeys();
    const cached = await store.all(storeName);
    return cached.filter((r) => !r?.deleted && !hidden.has(rowKey(r))).sort(byNom);
  }
  if (!Array.isArray(list)) return list;

  const hidden = await hiddenKeys();
  const local = await store.all(storeName);
  const pending = new Map();
  for (const row of local) {
    const key = rowKey(row);
    if (key && row._pending && !row.deleted) pending.set(key, row);
  }
  const seen = new Set();
  for (const row of list) {
    const key = rowKey(row);
    if (!key) continue;
    seen.add(key);
    if (pending.has(key) || hidden.has(key)) continue; // nos écritures locales priment
    await store.put(storeName, key, row);
  }
  for (const row of local) {
    const key = rowKey(row);
    if (key && !seen.has(key) && !pending.has(key) && syncedBefore.has(key)) await store.del(storeName, key);
  }
  const merged = list.filter((row) => !hidden.has(rowKey(row))).map((row) => pending.get(rowKey(row)) || row);
  for (const [key, row] of pending) if (!seen.has(key)) merged.push(row); // création pas encore poussée
  return merged.sort(byNom);
}

// ── Divers / Sites (même mécanique, kinds `diver.*` / `site.*`) ────────────

function decorateDirectory(resource, ctx, storeName, kind) {
  const { store, outbox, uuid } = ctx;
  const originalList = resource.list;
  const withId = (payload) => (payload.id ? payload : { ...payload, id: uuid() });

  // Suppressions pas encore parties : la ligne reste masquée même si le
  // serveur la renvoie encore.
  const pendingDeletes = async () =>
    new Set((await outbox.pending()).filter((it) => it.kind === `${kind}.delete`).map((it) => it.payload?.id));
  resource.list = async () => listWithFallback(store, storeName, () => originalList(), pendingDeletes);

  resource.create = async (data) => {
    const payload = withId(data);
    await store.put(storeName, payload.id, { ...payload, _pending: true });
    await outbox.enqueue(`${kind}.create`, payload);
    emitDataChanged(storeName);
    return { ...payload, _pending: true };
  };

  resource.update = async (id, data) => {
    const payload = { ...data, id };
    const cur = await store.get(storeName, id);
    await store.put(storeName, id, { ...(cur || {}), ...payload, _pending: true });
    await outbox.coalesce(
      `${kind}.update`,
      payload,
      (it) => it.payload.id === id,
      (prev, next) => ({ ...prev, ...next }),
    );
    emitDataChanged(storeName);
    return { ...payload, _pending: true };
  };

  resource.delete = async (id) => {
    await store.del(storeName, id);
    await outbox.enqueue(`${kind}.delete`, { id });
    emitDataChanged(storeName);
    return null;
  };
}

// ── Dives : lecture ─────────────────────────────────────────────────────

// Résumé de liste construit depuis une plongée locale non encore synchronisée.
function localDiveSummary(row) {
  return {
    id: row.server_id || row.client_uuid,
    client_uuid: row.client_uuid,
    status: row.status || 'prepared',
    site_nom: row.site_nom,
    date_plongee: row.date_plongee,
    planned_at: row.planned_at,
    started_at: row.started_at,
    dp_nom: row.dp_nom,
    dp_qual: row.dp_qual,
    activite: row.activite,
    drive_link: row.drive_link || '',
    nb_palanquees: Array.isArray(row.palanquees) ? row.palanquees.length : 0,
    nb_plongeurs: Array.isArray(row.palanquees) ? row.palanquees.reduce((n, p) => n + (p.membres?.length || 0), 0) : 0,
    _pending: !row.synced,
    synced: !!row.synced,
    drive_synced: !!row.drive_synced,
  };
}

// Persiste la liste serveur en local en conservant le contenu complet existant.
async function persistServerDives(store, serverList, local) {
  for (const row of serverList) {
    const key = row.client_uuid || row.id;
    const cur = local.find((l) => l.server_id === row.id || l.client_uuid === row.client_uuid);
    const merged = {
      ...(cur || {}),
      ...row,
      server_id: row.id,
      client_uuid: cur?.client_uuid || row.client_uuid,
      synced: true,
      drive_synced: !!row.drive_link,
    };
    if (key) await store.put('dives', key, merged);
  }
}

function mergeDiveLists(serverList, local) {
  const byKey = new Map();
  for (const row of serverList) {
    const key = row.client_uuid || row.id;
    if (key)
      byKey.set(key, {
        ...row,
        _pending: false,
        drive_synced: !!row.drive_link,
        synced: true,
      });
  }
  for (const row of local) {
    const key = row.client_uuid || row.server_id || row.id;
    if (byKey.has(key)) continue;
    if (row.deleted) continue;
    byKey.set(key, localDiveSummary(row));
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const da = a.date_plongee || '';
    const db = b.date_plongee || '';
    return db.localeCompare(da);
  });
}

function decorateDiveReads(dives, ctx, original) {
  const { store } = ctx;

  // list() : fusionne réseau + store local, déduplicé par client_uuid.
  dives.list = async () => {
    let serverList = [];
    let networkOk = false;
    try {
      serverList = await original.list();
      networkOk = true;
    } catch {
      /* offline */
    }

    const local = await store.all('dives');
    if (networkOk) await persistServerDives(store, serverList, local);
    return mergeDiveLists(serverList, local);
  };

  // listArchived() — utilisé par screen-archives.jsx et screen-home.jsx
  dives.listArchived = async () => {
    const all = await dives.list();
    return all.filter((d) => !d.status || d.status === 'archived');
  };

  // listActive() — plongées préparées + en cours (pour la home)
  dives.listActive = async () => {
    const all = await dives.list();
    return all.filter((d) => d.status === 'prepared' || d.status === 'in_progress');
  };

  // get(id) — préfère le store local si _pending (données plus récentes que le serveur).
  // Une lecture réseau réussie est persistée en local : la plongée préparée
  // en ligne reste complète si on la rouvre ensuite sans réseau.
  dives.get = async (id) => {
    const local = await store.get('dives', id);
    if (local?._pending) return local;
    try {
      const remote = await original.get(id);
      if (remote) {
        const key = remote.client_uuid || id;
        const cur = local || (await store.get('dives', key));
        if (!cur?._pending) {
          await store.put('dives', key, {
            ...(cur || {}),
            ...remote,
            client_uuid: key,
            server_id: remote.id,
            synced: true,
            drive_synced: !!remote.drive_link,
          });
        }
      }
      return remote;
    } catch (err) {
      if (local) return local;
      const all = await store.all('dives');
      const hit = all.find((a) => a.server_id === id || a.client_uuid === id);
      if (hit) return hit;
      throw err;
    }
  };

  // getRemote(id) — lecture serveur stricte (aucun repli local) : sert à
  // confirmer qu'une transition (ex. archivage) a réellement été acceptée.
  dives.getRemote = (id) => original.get(id);

  // pendingDrive() — plongées archivées mais sans Drive
  dives.pendingDrive = async () => {
    const all = await store.all('dives');
    return all.filter((a) => a.synced && !a.drive_synced && a.status === 'archived');
  };
}

// ── Dives : écriture ────────────────────────────────────────────────────

function decorateDiveWrites(dives, ctx) {
  const { store, outbox, uuid } = ctx;

  // create(data) — optimistic + outbox
  dives.create = async (data) => {
    const client_uuid = data.client_uuid || uuid();
    const payload = { ...data, client_uuid };
    await store.put('dives', client_uuid, {
      ...payload,
      status: payload.status || 'prepared',
      _pending: true,
      synced: false,
      drive_synced: false,
    });
    await outbox.enqueue('dive.create', payload);
    emitDataChanged('dives');
    return { client_uuid, _pending: true };
  };

  // update(client_uuid, patch) — optimistic + outbox
  dives.update = async (client_uuid, patch) => {
    const cur = (await store.get('dives', client_uuid)) || {};
    const merged = { ...cur, ...patch, _pending: true };
    if (patch.status === 'archived') {
      merged.drive_synced = !!patch.drive_link || !!cur.drive_link;
    }
    await store.put('dives', client_uuid, merged);
    await outbox.coalesce(
      'dive.update',
      { client_uuid, patch },
      (it) => it.payload.client_uuid === client_uuid,
      (cur, next) => ({ client_uuid, patch: { ...cur.patch, ...next.patch } }),
    );
    emitDataChanged('dives');
    return merged;
  };

  // delete(client_uuid) — optimistic soft-delete
  dives.delete = async (client_uuid) => {
    const cur = await store.get('dives', client_uuid);
    if (cur) await store.put('dives', client_uuid, { ...cur, deleted: true, _pending: true });
    await outbox.enqueue('dive.delete', { client_uuid });
    emitDataChanged('dives');
    return null;
  };

  // markDriveDone(client_uuid, drive_link) → PATCH server + store
  dives.markDriveDone = async (client_uuid, drive_link) => {
    const local = await store.get('dives', client_uuid);
    if (!local?.server_id) {
      throw new Error('Plongée non encore synchronisée — impossible de PATCH drive_link');
    }
    const res = await fetch(`/api/dives/${encodeURIComponent(local.server_id)}`, {
      method: 'PATCH',
      credentials: 'include',
      // Même club que les autres requêtes métier (cf. src/api/api.js).
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
        ...clubHeaders(getCurrentClubId()),
      },
      body: JSON.stringify({ drive_link }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      notifyIfAuthExpired(res.status, '/dives');
      throw new Error(json.error || `PATCH HTTP ${res.status}`);
    }
    await store.put('dives', client_uuid, { ...local, drive_link, drive_synced: true });
    emitDataChanged('dives');
    return json.data;
  };
}

/**
 * Décore `api` (divers, sites, dives) pour le mode offline-first.
 * @param {object} api  objet api (src/api/api.js) — modifié en place
 * @param {{store?: object, outbox?: object, uuid?: () => string}} [deps]
 * @returns {object} le même objet `api`
 */
export function decorateApiForOffline(api, deps = {}) {
  const ctx = {
    store: deps.store || offlineStore,
    outbox: deps.outbox || defaultOutbox,
    uuid: deps.uuid || randomUUID,
  };
  const originalDives = { ...api.dives };
  decorateDirectory(api.divers, ctx, 'divers', 'diver');
  decorateDirectory(api.sites, ctx, 'sites', 'site');
  decorateDiveReads(api.dives, ctx, originalDives);
  decorateDiveWrites(api.dives, ctx);
  return api;
}
