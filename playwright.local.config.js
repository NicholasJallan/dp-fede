// @ts-check
// Playwright — smoke test LOCAL du build de production (dist/).
//
//   npm run test:e2e:local
//
// webServer construit dist/ (node build.js) puis le sert en statique sur
// http://127.0.0.1:8765 (python3 -m http.server). Toutes les routes /api/**
// sont simulées dans le test : aucun backend ni compte Google requis.
// Le Service Worker est bloqué par défaut (pour que context.route voie toutes
// les requêtes) ; le test hors-ligne dédié le réactive.

const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.DP_LOCAL_PORT || 8765);
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: 'tests-e2e',
  testMatch: /local-smoke\.spec\.js$/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-local', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node build.js && python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist`,
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
