// DP Assistant — Outbox de mutations différées.
//
// Chaque entrée :
//   {
//     id:           UUID (client),
//     kind:         'dive.create'  | 'dive.update'  | 'dive.delete'  |
//                   'diver.create' | 'diver.update' | 'diver.delete' |
//                   'site.create'  | 'site.update'  | 'site.delete',
//                   (le dépôt Drive n'est pas un kind d'outbox)
//     payload:      données à envoyer (kind-dépendant),
//     attempts:     nombre d'essais,
//     lastError:    message du dernier échec,
//     nextRetryAt:  timestamp ms du prochain essai (backoff exp),
//     createdAt:    timestamp ms,
//     club_id:      club courant au moment de la mise en file (ou null) :
//                   la sync rejoue l'item avec l'en-tête X-DP-Club, il reste
//                   dans ce club même après un changement de club,
//     status:       'pending' | 'inflight' | 'review' (les 'done' sont
//                   supprimés immédiatement). 'review' = refus métier du
//                   serveur (400/422) : pas de retry automatique, l'item reste
//                   visible dans le tiroir de sync et se réarme dès que
//                   l'utilisateur modifie la même entité (coalesce) ou via
//                   retryNow().
//   }
//
// Backoff exponentiel plafonné à 2h (120 min), retry indéfini (jamais d'expiration).
// Suite : 10s, 30s, 1m, 2m, 5m, 10m, 30m, 1h, 2h, 2h, 2h... (plafond)

import { offlineStore } from './offline-store.js';
import { randomUUID } from './uuid.js';
import { getCurrentClubId } from '../api/club-header.js';

const STORE = 'outbox';

// Suite de backoff en secondes, indexée par `attempts` (0 = premier essai).
// Au-delà du dernier index, on reste au plafond.
const BACKOFF_S = [10, 30, 60, 120, 300, 600, 1800, 3600, 7200];

// Fabrique : `store` = instance offline-store (get/put/del/all/allKeys/clear),
// `uuid` = générateur d'identifiants, `getClubId` = club courant (capturé à
// la mise en file). Les événements dp:outboxChanged sont émis sur le
// `window` global au moment de l'appel.
export function createOutbox({ store, uuid = randomUUID, getClubId = () => null }) {
  const currentClub = () => getClubId() || null;

  function nextRetryDelayMs(attempts) {
    const idx = Math.min(attempts, BACKOFF_S.length - 1);
    // Petit jitter ±15% pour ne pas synchroniser N clients qui auraient eu
    // la même panne en même temps.
    const base = BACKOFF_S[idx] * 1000;
    const jitter = base * (Math.random() * 0.3 - 0.15);
    return Math.max(1000, Math.floor(base + jitter));
  }

  async function enqueue(kind, payload) {
    const id = uuid();
    const item = {
      id, kind, payload,
      club_id: currentClub(),
      attempts: 0,
      lastError: null,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
      status: 'pending',
    };
    await store.put(STORE, id, item);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { kind, id, op: 'enqueue' } }));
    return item;
  }

  async function get(id) {
    return await store.get(STORE, id);
  }

  async function update(id, patch) {
    const cur = await store.get(STORE, id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await store.put(STORE, id, next);
    return next;
  }

  async function markInflight(id) {
    return await update(id, { status: 'inflight' });
  }

  async function markDone(id) {
    await store.del(STORE, id);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { id, op: 'done' } }));
  }

  async function markFailed(id, error) {
    const cur = await store.get(STORE, id);
    if (!cur) return;
    // Le délai du PROCHAIN retry est calculé sur le nombre d'échecs déjà
    // subis (avant incrément) : 1er échec → BACKOFF_S[0] = 10s,
    // 2e échec → BACKOFF_S[1] = 30s, etc.
    const delayMs   = nextRetryDelayMs(cur.attempts || 0);
    const attempts  = (cur.attempts || 0) + 1;
    const nextRetryAt = Date.now() + delayMs;
    await store.put(STORE, id, {
      ...cur,
      attempts,
      lastError: String(error?.message || error || 'unknown'),
      nextRetryAt,
      status: 'pending',
    });
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { id, op: 'fail' } }));
  }

  // Refus métier (400/422) : l'item n'est plus rejoué automatiquement.
  async function markReview(id, error) {
    const cur = await store.get(STORE, id);
    if (!cur) return;
    await store.put(STORE, id, {
      ...cur,
      attempts: (cur.attempts || 0) + 1,
      lastError: String(error?.message || error || 'refusé'),
      status: 'review',
    });
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { id, op: 'review' } }));
  }

  // Fusionne `payload` dans le dernier item `kind` non parti qui satisfait
  // `match`, sinon en crée un nouveau. Évite d'empiler un PATCH complet par
  // frappe (auto-save) et garantit que seul le dernier état part. Jamais de
  // fusion entre clubs : chaque item part vers le club de sa mise en file.
  async function coalesce(kind, payload, match, merge) {
    const all = await store.all(STORE);
    const club = currentClub();
    const target = all
      .filter(it => it.kind === kind && it.status !== 'inflight' && (it.club_id || null) === club && match(it))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!target) return await enqueue(kind, payload);
    const next = {
      ...target,
      payload: merge(target.payload, payload),
      status: 'pending',
      nextRetryAt: target.status === 'review' ? Date.now() : target.nextRetryAt,
    };
    await store.put(STORE, target.id, next);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { kind, id: target.id, op: 'coalesce' } }));
    return next;
  }

  // Remet tous les items (y compris en revue) à « prêt maintenant ».
  // Appelé après une reconnexion (login) ou par le bouton « Réessayer ».
  async function retryNow() {
    const all = await store.all(STORE);
    const now = Date.now();
    await Promise.all(all
      .filter(it => it.status !== 'inflight')
      .map(it => store.put(STORE, it.id, { ...it, status: 'pending', nextRetryAt: now })));
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { op: 'retry' } }));
  }

  // Retourne les items prêts à partir (status=pending et nextRetryAt <= now).
  // Triés par createdAt ASC (FIFO) — garantit que les archives partent dans
  // l'ordre où l'utilisateur les a clôturées.
  async function ready(now = Date.now()) {
    const all = await store.all(STORE);
    return all
      .filter(it => it.status === 'pending' || it.status === undefined)
      .filter(it => (it.nextRetryAt || 0) <= now)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async function pending() {
    return await store.all(STORE);
  }

  async function size() {
    const keys = await store.allKeys(STORE);
    return keys.length;
  }

  async function clear() {
    await store.clear(STORE);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { op: 'clear' } }));
  }

  // Délai jusqu'au prochain retry programmé (ms). Utile pour réveiller le
  // sync orchestrator au bon moment plutôt qu'avec un interval fixe.
  async function nextWakeMs(now = Date.now()) {
    const all = await store.all(STORE);
    if (!all.some(it => it.status !== 'review')) return null;
    const future = all
      .filter(it => it.status !== 'inflight' && it.status !== 'review')
      .map(it => (it.nextRetryAt || 0) - now)
      .filter(d => d > 0);
    if (future.length === 0) return 0; // au moins un item est prêt maintenant
    return Math.min(...future);
  }

  return {
    enqueue, get, update,
    markInflight, markDone, markFailed, markReview,
    coalesce, retryNow,
    ready, pending, size, clear,
    nextWakeMs,
    // Exposé pour tests/inspection.
    _backoffMs: nextRetryDelayMs,
    _store: STORE,
  };
}

export const outbox = createOutbox({ store: offlineStore, getClubId: getCurrentClubId });
