// @ts-check
// Auth setup pour Playwright — connecte via Google OAuth une fois et sauve
// le storageState pour réutilisation dans tous les tests.
//
// Stratégie : on ne peut pas automatiser Google OAuth (CAPTCHA, 2FA). On
// utilise donc un cookie de session pré-existant injecté via les variables
// d'env DP_E2E_SESSION_COOKIE et DP_E2E_CSRF_COOKIE (à obtenir une fois
// manuellement depuis le navigateur, puis stockées en secret CI).
//
// Pour relancer manuellement en local :
//   export DP_E2E_SESSION_COOKIE=...
//   export DP_E2E_CSRF_COOKIE=...
//   npm run test:e2e

const { test: setup, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

setup('authenticate via injected cookies', async ({ page, baseURL }) => {
  const session = process.env.DP_E2E_SESSION_COOKIE;
  const csrf    = process.env.DP_E2E_CSRF_COOKIE;
  if (!session || !csrf) {
    throw new Error(
      'DP_E2E_SESSION_COOKIE et DP_E2E_CSRF_COOKIE doivent être définis. '
      + 'Voir tests-e2e/README.md pour les obtenir.'
    );
  }

  const url    = new URL(baseURL);
  const domain = url.hostname;

  await page.context().addCookies([
    {
      name: 'dp_session',
      value: session,
      domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
    {
      name: 'dp_csrf',
      value: csrf,
      domain,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Strict',
    },
  ]);

  await page.goto('/');
  // Heuristique : l'écran d'accueil affiche « Préparer et diriger la plongée. »
  // si la session est valide. Sinon on retombe sur le login.
  await expect(page.locator('h1')).toContainText('Préparer et diriger', { timeout: 15_000 });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
