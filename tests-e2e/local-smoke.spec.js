// @ts-check
// Smoke test local du build de production (dist/), sans backend réel.
//
// Lancement : npm run test:e2e:local (config playwright.local.config.js, qui
// construit dist/ puis le sert sur http://127.0.0.1:8765).
//
// Toutes les routes /api/** sont simulées par un petit backend en mémoire
// (tests-e2e/local-fixtures.js). Vérifie :
//   - parcours complet préparation → exécution → archivage confirmé par le serveur ;
//   - palanquée bloquée visible (encadré, résumé, plongeurs, référence CdS) ;
//   - verrou « décision finale du DP » avant la mise à l'eau ;
//   - refus serveur de l'archivage affiché avec son motif ;
//   - bascule Soleil / Nuit persistée ;
//   - contrôle d'accessibilité automatisé (axe-core, WCAG 2.x A/AA) ;
//   - hors-ligne sans écran blanc (avec et sans Service Worker) ;
//   - captures 320 / 768 / 1024 / 1440 px en Soleil et Nuit
//     → test-results/screens/<écran>-<largeur>-<thème>.png

const path = require('path');
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { newState, mockBackend } = require('./local-fixtures.js');

const SHOTS = path.join(__dirname, '..', 'test-results', 'screens');

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
  // Rappel des aptitudes affiché à chaque connexion.
  const splash = page.getByRole('dialog', { name: /Bonjour/ });
  await expect(splash).toBeVisible();
  await splash.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();
}

const heading = (page) => page.locator('.main h1').first();
const nextBtn = (page) => page.locator('.footnav-next');
const diveRow = (page, text) => page.locator('.dive-row', { hasText: text });

let state;
test.beforeEach(async ({ context }) => {
  state = newState();
  await mockBackend(context, state);
});

test.describe('build local — parcours en ligne', () => {
  test("accueil puis création d'une plongée (étapes 1 → 3, préparation)", async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);
    await expect(diveRow(page, 'Lac de Test').first()).toBeVisible();
    await expect(page.locator('.sync-pill')).toContainText('En ligne');

    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await expect(heading(page)).toHaveText('Caractériser la plongée à venir');
    await expect.poll(() => state.calls.includes('POST /api/dives')).toBe(true);

    await nextBtn(page).click();
    await expect(heading(page)).toHaveText('Constituer les palanquées');
    await nextBtn(page).click();
    await expect(heading(page)).toHaveText("Avant l'arrivée sur site");
    await expect(nextBtn(page)).toHaveText('Enregistrer la préparation');
    await nextBtn(page).click();
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('parcours complet : préparation → exécution → archivage confirmé', async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);

    // ── Préparation : profil
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await page.getByLabel('Directeur de Plongée').selectOption('d-dp');
    await page.getByLabel('Site de plongée').selectOption('s-2');
    await expect(page.locator('.info-box', { hasText: 'Carrière du Test' })).toBeVisible();
    await nextBtn(page).click();

    // ── Palanquées : un plongeur seul → palanquée bloquée, visible
    await expect(heading(page)).toHaveText('Constituer les palanquées');
    await page.getByLabel('Ajouter Léa DURAND à une palanquée').selectOption('__new__');
    const pal = page.locator('.pal').first();
    await expect(pal).toHaveClass(/is-blocked/);
    await expect(pal.locator('.pal-alarm')).toContainText('Palanquée bloquée');
    await expect(pal.locator('.issue.err').first()).toContainText('Code du sport');
    await pal.getByLabel('Aptitude de Léa DURAND').selectOption('GP');
    await page.getByLabel('Ajouter Hugo BERNARD à une palanquée').selectOption({ index: 1 });
    await pal.getByLabel('Aptitude de Hugo BERNARD').selectOption('PE40');
    await expect(pal).not.toHaveClass(/is-blocked/);
    await expect(pal.locator('.issue.ok')).toContainText('Composition conforme');
    await pal.getByLabel('DTR prévue').fill('3');
    await nextBtn(page).click();

    // ── Check-list de préparation puis retour accueil
    await expect(heading(page)).toHaveText("Avant l'arrivée sur site");
    await nextBtn(page).click();
    const row = diveRow(page, 'Carrière du Test').filter({ has: page.getByRole('button', { name: /Démarrer/ }) });
    await expect(row).toBeVisible();

    // ── Exécution : check-list sur site, verrou de décision finale
    await row.getByRole('button', { name: /Démarrer/ }).click();
    await expect(heading(page)).toHaveText("Sur site, avant la mise à l'eau");
    await expect(nextBtn(page)).toBeDisabled();
    await expect(page.locator('.footnav-hint')).toContainText('décision finale');
    await page.getByRole('checkbox', { name: /Décision finale du DP/ }).click();
    await expect(nextBtn(page)).toBeEnabled();
    await nextBtn(page).click();

    // ── Fiche : ENTRÉE (confirmation du 1er départ) puis SORTIE
    await expect(heading(page)).toContainText('Fiche de sécurité');
    const cadran = page.locator('.cadran').first();
    await cadran.getByRole('button', { name: 'ENTRÉE' }).click();
    await page.getByRole('dialog', { name: /Première mise à l'eau/ }).getByRole('button', { name: "Confirmer l'entrée" }).click();
    await expect(cadran.locator('.cadran-state')).toContainText("À l'eau");
    await expect(nextBtn(page)).toBeDisabled();
    await cadran.getByRole('button', { name: 'SORTIE' }).click();
    const fin = page.getByRole('dialog', { name: /Sortie de l'eau/ });
    await fin.getByLabel('Durée réelle').fill('1');
    await fin.getByRole('button', { name: 'Valider la sortie' }).click();
    await expect(cadran.locator('.cadran-state')).toContainText('Sortie');
    await cadran.getByLabel('Pression de sortie de Léa DURAND (bar)').fill('80');

    // ── Archivage : Google indisponible en test → archivage sans Drive, confirmé par le serveur
    await nextBtn(page).click();
    await page.getByRole('dialog', { name: /Figer et archiver/ }).getByRole('button', { name: 'Figer et archiver' }).click();
    await expect(heading(page)).toHaveText('Archiver la plongée');
    await page.getByRole('button', { name: 'Archiver sans Drive' }).click();
    await expect(page.locator('.notice.ok')).toContainText('confirmée par le serveur', { timeout: 15_000 });
    expect(state.dives.find(d => d.site_nom === 'Carrière du Test' && d.status === 'archived')).toBeTruthy();

    expect(errors.filter(e => !isNetworkNoise(e))).toEqual([]);
  });

  test("exécution d'une plongée préparée : URGENCE et fiche", async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);
    await diveRow(page, 'Lac de Test').getByRole('button', { name: /Démarrer/ }).click();
    await expect(heading(page)).toHaveText("Sur site, avant la mise à l'eau");

    // URGENCE intégré à la barre basse en mode exécution.
    await page.locator('.footnav-urgence').click();
    const urg = page.getByRole('dialog', { name: 'Déclenchement des secours' });
    await expect(urg).toContainText('Parking du lac');
    await expect(urg.getByRole('link', { name: /Appeler le 144/ })).toBeVisible();
    await urg.getByRole('button', { name: 'Fermer' }).first().click();
    await expect(urg).toBeHidden();

    await page.getByRole('checkbox', { name: /Décision finale du DP/ }).click();
    await nextBtn(page).click();
    await expect(page.locator('.main')).toContainText('DURAND');
    await expect(nextBtn(page)).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("refus serveur de l'archivage : motif affiché et Réessayer", async ({ page }) => {
    state.rejectArchive = true;
    await openHome(page);
    await diveRow(page, 'Lac de Test').getByRole('button', { name: /Démarrer/ }).click();
    await page.getByRole('checkbox', { name: /Décision finale du DP/ }).click();
    await nextBtn(page).click();
    await nextBtn(page).click();
    await page.getByRole('button', { name: 'Figer et archiver' }).click();
    await page.getByRole('button', { name: 'Archiver sans Drive' }).click();
    const notice = page.locator('.notice.err');
    await expect(notice).toContainText('Archivage refusé par le serveur', { timeout: 15_000 });
    await expect(notice).toContainText('heure de sortie manquante');
    await expect(page.locator('.sync-pill')).toHaveClass(/is-review/);
    await expect(page.locator('.notice.ok')).toHaveCount(0);

    state.rejectArchive = false;
    await notice.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.notice.ok')).toContainText('confirmée par le serveur', { timeout: 15_000 });
  });

  test('bascule Soleil / Nuit mémorisée', async ({ page }) => {
    await openHome(page);
    const toggle = page.locator('.theme-toggle');
    const initial = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    const expected = initial === 'true' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
  });
});

test.describe('build local — accessibilité (axe-core)', () => {
  for (const scheme of ['light', 'dark']) {
    test(`accueil, palanquées et fiche sans violation WCAG A/AA (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openHome(page);
      const audit = async (label) => {
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const summary = res.violations.map(v => `${label} — ${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`);
        expect(summary).toEqual([]);
      };
      await audit('accueil');
      await diveRow(page, 'groupe technique').getByRole('button', { name: 'Modifier' }).click();
      await nextBtn(page).click();
      await expect(page.locator('.pal.is-blocked')).toBeVisible();
      await audit('palanquées');
      await page.locator('.topbar-home').click();
      await page.locator('.resume-card').getByRole('button', { name: /Reprendre/ }).click();
      await expect(page.locator('.cadran').first()).toBeVisible();
      await audit('fiche');
    });
  }
});

test.describe('build local — hors-ligne', () => {
  test("coupure réseau en cours d'usage : pas d'écran blanc", async ({ page, context }) => {
    const errors = trackErrors(page);
    await openHome(page);

    state.offline = true;
    await context.setOffline(true);
    await expect(page.locator('.sync-pill')).toContainText('Hors ligne');

    await page.locator('.topbar').getByRole('button', { name: 'Historique' }).click();
    await expect(page.locator('#root')).not.toBeEmpty();
    await page.locator('.topbar').getByRole('button', { name: /Accueil/ }).click();
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await expect(heading(page)).toHaveText('Caractériser la plongée à venir');
    await expect(page.locator('.sync-pill .count')).toHaveText(/\d+/);

    state.offline = false;
    await context.setOffline(false);
    await expect(page.locator('.sync-pill')).toContainText(/En ligne|Envoi/, { timeout: 15_000 });

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
      await expect(page.locator('.sync-pill')).toContainText('Hors ligne');
      await expect(page.locator('#load-fallback')).toBeHidden();

      await context.setOffline(false);
      expect(errors.filter((e) => !isNetworkNoise(e))).toEqual([]);
    });
  });
});

// ── Captures d'écran : 4 largeurs × 2 thèmes × 3 écrans ──────────────────
const WIDTHS = [320, 768, 1024, 1440];
const THEMES = ['light', 'dark'];

// Pleine page : la barre basse fixe est replacée en fin de page pour ne pas
// masquer le contenu sur la capture.
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`), fullPage: true, style: '.footnav { position: static !important; }',
  });
}

async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('build local — captures', () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`captures ${width}px ${theme}`, async ({ page }) => {
        state.realFonts = true;
        await page.setViewportSize({ width, height: width < 768 ? 720 : 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await openHome(page);
        await expect(page.locator('.dive-row').first()).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `accueil-${width}-${theme}`);

        await diveRow(page, 'groupe technique').getByRole('button', { name: 'Modifier' }).click();
        await nextBtn(page).click();
        await expect(page.locator('.pal.is-blocked')).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `palanquees-${width}-${theme}`);

        await page.locator('.topbar-home').click();
        await page.locator('.resume-card').getByRole('button', { name: /Reprendre/ }).click();
        await expect(page.locator('.cadran').nth(1)).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `fiche-${width}-${theme}`);
      });
    }
  }
});
