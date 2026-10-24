// @ts-check
// DP Assistant — Délai maximal des requêtes réseau.
//
// Sans délai, un fetch sur un réseau dégradé (portail captif, 3G au bord de
// l'eau) peut rester pendant plusieurs minutes : le cycle de synchro reste
// bloqué et l'item d'outbox « en cours ». Un abandon est traité comme une
// panne réseau (échec transitoire, nouvel essai).

export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Signal qui abandonne après `ms` (raison TimeoutError) ou avec `callerSignal`.
 * Délai invalide ou navigateur sans AbortSignal.timeout : `callerSignal` seul.
 * @param {number} ms
 * @param {AbortSignal} [callerSignal]
 * @returns {AbortSignal | undefined}
 */
export function timeoutSignal(ms, callerSignal) {
  if (!Number.isFinite(ms) || ms <= 0 || typeof AbortSignal.timeout !== 'function') return callerSignal;
  const timeout = AbortSignal.timeout(ms);
  if (!callerSignal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([callerSignal, timeout]);
  // Safari < 17.4 : combinaison manuelle, écouteurs détachés au premier abandon.
  if (callerSignal.aborted) return callerSignal;
  const ctrl = new AbortController();
  const signals = [callerSignal, timeout];
  const onAbort = (/** @type {Event} */ e) => {
    signals.forEach((s) => s.removeEventListener('abort', onAbort));
    ctrl.abort(/** @type {AbortSignal} */ (e.target).reason);
  };
  signals.forEach((s) => s.addEventListener('abort', onAbort));
  return ctrl.signal;
}
