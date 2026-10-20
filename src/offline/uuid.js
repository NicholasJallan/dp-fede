// DP Assistant — Génération d'UUID v4 (client_uuid, ids d'outbox).
//
// crypto.randomUUID quand il existe ; sinon polyfill RFC 4122 basé sur
// crypto.getRandomValues (Safari < 15.4). La disponibilité est testée à
// chaque appel : le module ne touche aucun global au chargement.

function polyfillUUID(cryptoImpl) {
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  // Version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Variant 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/** @returns {string} UUID v4 */
export function randomUUID() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return polyfillUUID(c);
}
