// DP Assistant — Signal « session expirée ».
//
// Toute réponse 401 d'un appel authentifié émet dp:authExpired (écouté par
// src/app/hooks/use-auth-expired.js) : le bandeau propose de se reconnecter
// sans effacer les actions en attente. Les routes /api/auth/* sont exclues :
// un 401 y est une réponse normale (pas encore connecté).

export function notifyIfAuthExpired(status, path = '') {
  if (status !== 401) return;
  if (String(path).includes('/auth/')) return;
  window.dispatchEvent(new CustomEvent('dp:authExpired', { detail: { path } }));
}
