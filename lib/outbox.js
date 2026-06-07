// DP Assistant — Outbox de mutations différées.
//
// Chaque entrée :
//   {
//     id:           UUID (client),
//     kind:         'dive.create'  | 'dive.update'  | 'dive.delete'  |
//                   'dive.drive'   | 'diver.create' | 'diver.update' |
//                   'diver.delete' | 'site.create'  | 'site.update'  |
//                   'site.delete',
//     payload:      données à envoyer (kind-dépendant),
//     attempts:     nombre d'essais,
//     lastError:    message du dernier échec,
//     nextRetryAt:  timestamp ms du prochain essai (backoff exp),
//     createdAt:    timestamp ms,
//     status:       'pending' | 'inflight' | 'done' (les 'done' sont nettoyés
//                   immédiatement ; on garde un terminus 'review' réservé en
//                   cas d'erreur 4xx irrécupérable, mais le user a demandé un
//                   retry indéfini donc 'review' n'est jamais sticky ici).
//   }
//
// Backoff exponentiel plafonné à 2h (120 min), retry indéfini (jamais d'expiration).
// Suite : 10s, 30s, 1m, 2m, 5m, 10m, 30m, 1h, 2h, 2h, 2h... (plafond)

(function () {
  const STORE = 'outbox';

  // Suite de backoff en secondes, indexée par `attempts` (0 = premier essai).
  // Au-delà du dernier index, on reste au plafond.
  const BACKOFF_S = [10, 30, 60, 120, 300, 600, 1800, 3600, 7200];

  function nextRetryDelayMs(attempts) {
    const idx = Math.min(attempts, BACKOFF_S.length - 1);
    // Petit jitter ±15% pour ne pas synchroniser N clients qui auraient eu
    // la même panne en même temps.
    const base = BACKOFF_S[idx] * 1000;
    const jitter = base * (Math.random() * 0.3 - 0.15);
    return Math.max(1000, Math.floor(base + jitter));
  }

  async function enqueue(kind, payload) {
    const id = window.randomUUID();
    const item = {
      id, kind, payload,
      attempts: 0,
      lastError: null,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
      status: 'pending',
    };
    await window.offlineStore.put(STORE, id, item);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { kind, id, op: 'enqueue' } }));
    return item;
  }

  async function get(id) {
    return await window.offlineStore.get(STORE, id);
  }

  async function update(id, patch) {
    const cur = await window.offlineStore.get(STORE, id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await window.offlineStore.put(STORE, id, next);
    return next;
  }

  async function markInflight(id) {
    return await update(id, { status: 'inflight' });
  }

  async function markDone(id) {
    await window.offlineStore.del(STORE, id);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { id, op: 'done' } }));
  }

  async function markFailed(id, error) {
    const cur = await window.offlineStore.get(STORE, id);
    if (!cur) return;
    // Le délai du PROCHAIN retry est calculé sur le nombre d'échecs déjà
    // subis (avant incrément) : 1er échec → BACKOFF_S[0] = 10s,
    // 2e échec → BACKOFF_S[1] = 30s, etc.
    const delayMs   = nextRetryDelayMs(cur.attempts || 0);
    const attempts  = (cur.attempts || 0) + 1;
    const nextRetryAt = Date.now() + delayMs;
    await window.offlineStore.put(STORE, id, {
      ...cur,
      attempts,
      lastError: String(error?.message || error || 'unknown'),
      nextRetryAt,
      status: 'pending',
    });
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { id, op: 'fail' } }));
  }

  // Retourne les items prêts à partir (status=pending et nextRetryAt <= now).
  // Triés par createdAt ASC (FIFO) — garantit que les archives partent dans
  // l'ordre où l'utilisateur les a clôturées.
  async function ready(now = Date.now()) {
    const all = await window.offlineStore.all(STORE);
    return all
      .filter(it => it.status !== 'inflight')
      .filter(it => (it.nextRetryAt || 0) <= now)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async function pending() {
    return await window.offlineStore.all(STORE);
  }

  async function size() {
    const keys = await window.offlineStore.allKeys(STORE);
    return keys.length;
  }

  async function clear() {
    await window.offlineStore.clear(STORE);
    window.dispatchEvent(new CustomEvent('dp:outboxChanged', { detail: { op: 'clear' } }));
  }

  // Délai jusqu'au prochain retry programmé (ms). Utile pour réveiller le
  // sync orchestrator au bon moment plutôt qu'avec un interval fixe.
  async function nextWakeMs(now = Date.now()) {
    const all = await window.offlineStore.all(STORE);
    if (all.length === 0) return null;
    const future = all
      .filter(it => it.status !== 'inflight')
      .map(it => (it.nextRetryAt || 0) - now)
      .filter(d => d > 0);
    if (future.length === 0) return 0; // au moins un item est prêt maintenant
    return Math.min(...future);
  }

  window.outbox = {
    enqueue, get, update,
    markInflight, markDone, markFailed,
    ready, pending, size, clear,
    nextWakeMs,
    // Exposé pour tests/inspection.
    _backoffMs: nextRetryDelayMs,
    _store: STORE,
  };
})();
