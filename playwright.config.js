// @ts-check
// Playwright config — DP Assistant
//
// La cible par défaut est https://dp-fede.bullesenvalais.ch (production).
// Override avec PLAYWRIGHT_BASE_URL pour viser staging ou local.
// Les tests E2E nécessitent une session valide : ils tournent en mode
// authenticated via le storageState pré-rempli (voir tests-e2e/auth.setup.js).

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://dp-fede.bullesenvalais.ch';

module.exports = defineConfig({
  testDir: 'tests-e2e',
  // Timeout par test (les golden paths font du I/O, on laisse de la marge).
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Pas de parallélisme : on partage un compte et des sites. À paralléliser
  // quand on aura un compte fixture par worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests-e2e-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests-e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
        storageState: 'tests-e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
