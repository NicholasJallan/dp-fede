// @ts-check
// Smoke test local du build de production (dist/), sans backend réel.
//
// Lancement : npm run test:e2e:local (config playwright.local.config.js, qui
// construit dist/ puis le sert sur http://127.0.0.1:8765).
//
// Toutes les routes /api/** sont simulées (context.route) avec un utilisateur
// connecté, un petit annuaire et une plongée préparée. Les scripts tiers
// (Google Identity Services, Maps, Google Fonts) sont remplacés par des
// réponses vides : le test ne dépend d'aucun réseau externe.
//
// Vérifie : accueil, création d'une plongée, étapes 1 → 5 sans erreur
// console, et passage hors-ligne sans écran blanc (avec et sans Service Worker).

const { test, expect } = require('@playwright/test');

const DIVE_UUID = '11111111-1111-4111-8111-111111111111';

const pad = (n) => String(n).padStart(2, '0');
const localNow = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
};

const USER = {
  id: 'u-1', email: 'dp.test@example.org', prenom: 'Test', nom: 'DP',
  role: 'admin', club_nom: 'Club Test', urgence_defaut: '112',
};

const DIVERS = [
  { id: 'd-dp', nom: 'MARTIN', prenom: 'Paul', niveau_encadrant: 'E3', nitrox: ['PN-C'], trimix: [], aptitudes_sup: [], medical: '2026-09-01' },
  { id: 'd-gp', nom: 'DURAND', prenom: 'Léa', niveau_encadrant: 'N4', nitrox: [], trimix: [], aptitudes_sup: [], medical: '2026-09-01' },
  { id: 'd-n2', nom: 'BERNARD', prenom: 'Hugo', niveau_plongeur: 'N2', nitrox: [], trimix: [], aptitudes_sup: [], medical: '2026-09-01' },
];

const SITES = [
  {
    id: 's-1', nom: 'Lac de Test', milieu: 'Lac', profondeur_max: 40,
    depart_bord: true, depart_bateau: false, pays: 'Suisse', pays_code: 'CH',
    coordonnees: { lat: 46.2, lng: 7.3 }, acces_secours: 'Parking du lac', caisson: 'HUG Genève',
  },
];

function diveSummary(plannedAt) {
  return {
    id: 'srv-1', client_uuid: DIVE_UUID, status: 'prepared',
    site_nom: 'Lac de Test', planned_at: plannedAt, date_plongee: plannedAt,
    dp_nom: 'Paul MARTIN', dp_qual: 'E3', nb_palanquees: 1, nb_plongeurs: 2, drive_link: '',
  };
}

// Plongée complète : palanquée déjà sortie de l'eau (heures début + fin), ce
// qui débloque le passage fiche → archivage.
function fullDive(plannedAt) {
  return {
    ...diveSummary(plannedAt),
    answers: {
      date: plannedAt, site_id: 's-1', site_nom: 'Lac de Test', milieu: 'Lac',
      site_pays_code: 'CH', dp_id: 'd-dp', dp_nom: 'Paul MARTIN', dp_qual: 'E3',
      air: true, depart_bord: true, prof_max: '20',
      // Plan de secours propagé depuis le site par l'écran profil.
      site_acces_secours: 'Parking du lac', site_caisson: 'HUG Genève',
      site_coords: { lat: 46.2, lng: 7.3 },
    },
    palanquees: [{
      id: 'p1', nom: 'Palanquée 1', mode: 'exploration',
      membres: [{ diverId: 'd-gp', aptitude: 'GP' }, { diverId: 'd-n2', aptitude: 'PE40' }],
      profMax: 20, duree: 40, dtr: 2, melanges: ['Air'],
    }],
    render_state: { heuresDebut: { p1: '10:00' }, heuresFin: { p1: '10:40' } },
  };
}

const ok = (data, status = 200) => ({
  status, contentType: 'application/json', body: JSON.stringify({ ok: true, data }),
});

function apiResponse(method, path, search, state) {
  if (path === '/api/auth/me') return ok(USER);
  if (path === '/api/divers') return ok(DIVERS);
  if (path === '/api/sites') return ok(SITES);
  if (path === '/api/sync/state') return ok({ divers: {}, sites: {}, dives: {} });
  if (path === '/api/dives' && method === 'GET') return ok(search ? [] : [diveSummary(state.plannedAt)]);
  if (path === '/api/dives' && method === 'POST') return ok({ id: `srv-new-${state.calls.length}`, duplicate: false }, 201);
  if (path.startsWith('/api/dives/') && method === 'GET') return ok(fullDive(state.plannedAt));
  return ok(null);
}

// Installe les mocks réseau. `state.offline = true` fait échouer /api/**.
async function mockBackend(context, state) {
  await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|accounts\.google\.com|maps\.googleapis\.com)\//, (route) => {
    const css = route.request().url().includes('fonts.googleapis.com');
    return route.fulfill({ status: 200, contentType: css ? 'text/css' : 'application/javascript', body: '' });
  });
  // Prédicat (et non un glob **/api/**) : l'URL Maps contient aussi « /api/ ».
  const isAppApi = (url) => url.hostname === '127.0.0.1' && url.pathname.startsWith('/api/');
  await context.route(isAppApi, (route) => {
    if (state.offline) return route.abort('internetdisconnected');
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    state.calls.push(`${method} ${url.pathname}`);
    if (method === 'HEAD') return route.fulfill({ status: 200, body: '' });
    return route.fulfill(apiResponse(method, url.pathname, url.search, state));
  });
}

// Erreurs console + exceptions non rattrapées de la page.
function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

const isNetworkNoise = (msg) => /Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR_/i.test(msg);

async function openHome(page) {
  await page.goto('/');
  // Splash de bienvenue affiché à chaque connexion.
  const splash = page.locator('.splash-modal .btn.primary');
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();
}

const heading = (page) => page.locator('.main h1').first();
const nextBtn = (page) => page.locator('.footnav .btn.primary');

let state;
test.beforeEach(async ({ context }) => {
  state = { offline: false, calls: [], plannedAt: localNow() };
  await mockBackend(context, state);
});

test.describe('build local — parcours en ligne', () => {
  test('accueil puis création d\'une plongée (étapes 1 → 3, préparation)', async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);
    await expect(page.locator('.dive-card-row', { hasText: 'Lac de Test' })).toBeVisible();
    await expect(page.locator('.topbar')).toContainText('EN LIGNE');

    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await expect(heading(page)).toHaveText('Caractériser la plongée à venir');
    await expect.poll(() => state.calls.includes('POST /api/dives')).toBe(true);

    await nextBtn(page).click();
    await expect(heading(page)).toHaveText('Constituer les palanquées');

    await nextBtn(page).click();
    await expect(heading(page)).toHaveText('Avant l\'arrivée sur site');

    await expect(nextBtn(page)).toHaveText('Sauvegarder →');
    await nextBtn(page).click();
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('exécution d\'une plongée préparée (étapes 3 → 5, fiche incluse)', async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);

    await page.locator('.dive-card-row', { hasText: 'Lac de Test' }).getByRole('button', { name: /Démarrer/ }).click();
    await expect(heading(page)).toHaveText('Sur site — avant la mise à l\'eau');

    // Modale d'urgence accessible en mode exécution.
    await page.locator('.urgence-fab').click();
    await expect(page.locator('.modal')).toContainText('Déclenchement des secours');
    await expect(page.locator('.modal')).toContainText('Parking du lac');
    await page.locator('.modal-foot').getByRole('button', { name: 'Fermer' }).click();

    // Étape 4 : fiche de sécurité.
    await nextBtn(page).click();
    await expect(page.locator('.main h1').first()).toContainText('Fiche de sécurité');
    await expect(page.locator('.main')).toContainText('DURAND');

    // Étape 5 : confirmation puis écran d'archivage.
    await expect(nextBtn(page)).toBeEnabled();
    await nextBtn(page).click();
    await page.getByRole('button', { name: /Confirmer et archiver/ }).click();
    await expect(heading(page)).toHaveText('Archiver la plongée');

    expect(errors).toEqual([]);
  });
});

test.describe('build local — hors-ligne', () => {
  test('coupure réseau en cours d\'usage : pas d\'écran blanc', async ({ page, context }) => {
    const errors = trackErrors(page);
    await openHome(page);

    state.offline = true;
    await context.setOffline(true);
    await expect(page.locator('.topbar')).toContainText('HORS LIGNE');

    // Navigation hors-ligne : historique puis création d'une plongée (outbox).
    await page.locator('.topbar').getByRole('button', { name: 'Historique' }).click();
    await expect(page.locator('#root')).not.toBeEmpty();
    await page.locator('.topbar').getByRole('button', { name: /Accueil/ }).click();
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await expect(heading(page)).toHaveText('Caractériser la plongée à venir');
    await expect(page.locator('.topbar')).toContainText(/HORS LIGNE\s*\d+/);

    state.offline = false;
    await context.setOffline(false);
    await expect(page.locator('.topbar')).toContainText('EN LIGNE', { timeout: 15_000 });

    expect(errors.filter((e) => !isNetworkNoise(e))).toEqual([]);
  });

  test.describe('avec Service Worker', () => {
    test.use({ serviceWorkers: 'allow' });

    test('rechargement hors-ligne servi par le cache du SW', async ({ page, context }) => {
      const errors = trackErrors(page);
      await openHome(page);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });

      state.offline = true;
      await context.setOffline(true);
      await page.reload();

      // Session restaurée depuis le snapshot local (auth offline) : la home s'affiche.
      await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.topbar')).toContainText('HORS LIGNE');
      await expect(page.locator('#load-fallback')).toBeHidden();

      await context.setOffline(false);
      expect(errors.filter((e) => !isNetworkNoise(e))).toEqual([]);
    });
  });
});
