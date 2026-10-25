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
//   - socle club : écran Club (invitation + copie du lien), changement de
//     club, acceptation d'invitation (et e-mail différent), import CSV en
//     simulation puis confirmation, alertes sur l'accueil, PDF archivés,
//     statistiques, export du compte, suppression (409 puis succès),
//     en-tête X-DP-Club sur les écritures de l'outbox et les lectures ;
//     club retiré (403 CLUB_NOT_MEMBER) et session expirée : proposition de
//     supprimer les données de l'appareil ; régénération des PDF archivés
//     proposée seulement en erreur ; captures 375 / 1440 des écrans Club et
//     Import, audit axe-core.

const path = require('path');
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const {
  newState,
  mockBackend,
  CLUB_ID,
  OTHER_CLUB_ID,
  INVITATION_TOKEN,
  MISMATCH_TOKEN,
} = require('./local-fixtures.js');

const SHOTS = path.join(__dirname, '..', 'test-results', 'screens');

// Erreurs console + exceptions non rattrapées de la page.
function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
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
    await page
      .getByRole('dialog', { name: /Première mise à l'eau/ })
      .getByRole('button', { name: "Confirmer l'entrée" })
      .click();
    await expect(cadran.locator('.cadran-state')).toContainText("À l'eau");
    await expect(nextBtn(page)).toBeDisabled();
    await cadran.getByRole('button', { name: 'SORTIE' }).click();
    const fin = page.getByRole('dialog', { name: /Sortie de l'eau/ });
    await fin.getByRole('textbox', { name: 'Durée réelle' }).fill('1');
    // Saisie rapide : − / + et paliers réalisés (fiche A322-72).
    const palier3 = fin.getByRole('group', { name: 'Palier à 3 m' });
    await palier3.getByRole('button', { name: 'Augmenter' }).click();
    await palier3.getByRole('button', { name: 'Augmenter' }).click();
    await palier3.getByRole('button', { name: 'Augmenter' }).click();
    await expect(fin.getByRole('textbox', { name: 'Palier à 3 m' })).toHaveValue('3');
    await fin.getByRole('checkbox', { name: /Palier de confort/ }).check();
    await fin.getByRole('textbox', { name: 'Palier de confort, Durée' }).fill('2');
    expect(
      await new AxeBuilder({ page })
        .include('.dialog')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
        .then((r) => r.violations),
    ).toEqual([]);
    await fin.getByRole('button', { name: 'Valider la sortie' }).click();
    await expect(cadran.locator('.cadran-state')).toContainText('Sortie');
    await expect(cadran.locator('.cadran-paliers')).toHaveText('Paliers : 3 m 3 min · confort 3 m 2 min');
    await cadran.getByLabel('Pression de sortie de Léa DURAND (bar)').fill('80');

    // ── Archivage : jamais bloqué par Google (indisponible en test) — le
    // serveur archive les PDF, la copie Drive échoue sans gravité.
    await nextBtn(page).click();
    await page
      .getByRole('dialog', { name: /Figer et archiver/ })
      .getByRole('button', { name: 'Figer et archiver' })
      .click();
    await expect(heading(page)).toHaveText('Archiver la plongée');
    await expect(page.locator('.notice.ok')).toContainText('confirmée par le serveur', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Documents archivés' })).toBeVisible();
    await expect(page.locator('.notice', { hasText: 'Copie Google Drive non effectuée' })).toContainText(
      'Connexion Google indisponible',
    );
    const archived = state.dives.find((d) => d.site_nom === 'Carrière du Test' && d.status === 'archived');
    expect(archived).toBeTruthy();
    // Paliers réalisés transmis au serveur (render_state → fiche PDF).
    const realised = Object.values(archived.render_state.realises)[0];
    expect(realised.paliers).toEqual({ 9: '', 6: '', 3: '3' });
    expect(realised.confort).toMatchObject({ on: true, duree: '2' });

    // « Terminé » : retour à l'accueil, sans ouvrir de nouvelle plongée.
    await nextBtn(page).click();
    await expect(page.locator('.footnav')).toHaveCount(0);
    await expect(diveRow(page, 'Carrière du Test')).toBeVisible();
    await expect(page.getByText("Cet écran n'a pas pu s'afficher")).toHaveCount(0);

    expect(errors.filter((e) => !isNetworkNoise(e))).toEqual([]);
  });

  test("exécution d'une plongée préparée : URGENCE et fiche", async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);
    await diveRow(page, 'Lac de Test')
      .getByRole('button', { name: /Démarrer/ })
      .click();
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
    await diveRow(page, 'Lac de Test')
      .getByRole('button', { name: /Démarrer/ })
      .click();
    await page.getByRole('checkbox', { name: /Décision finale du DP/ }).click();
    await nextBtn(page).click();
    await nextBtn(page).click();
    await page.getByRole('button', { name: 'Figer et archiver' }).click();
    const notice = page.locator('.notice.err');
    await expect(notice).toContainText('Archivage refusé par le serveur', { timeout: 15_000 });
    await expect(notice).toContainText('heure de sortie manquante');
    await expect(page.locator('.sync-pill')).toHaveClass(/is-review/);
    await expect(page.locator('.notice.ok')).toHaveCount(0);

    state.rejectArchive = false;
    await notice.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.notice.ok')).toContainText('confirmée par le serveur', { timeout: 15_000 });
  });

  test('archivage sans Google Drive : aucune demande Google, PDF archivés par le serveur', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => localStorage.setItem('dp-drive-export', 'off'));
    const google = [];
    page.on('request', (r) => {
      if (/google(apis)?\.com/.test(r.url())) google.push(r.url());
    });
    await openHome(page);
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await expect(heading(page)).toHaveText('Caractériser la plongée à venir');
    await page.locator('.topbar-home').click();
    await diveRow(page, 'Lac de Test')
      .getByRole('button', { name: /Démarrer/ })
      .click();
    await page.getByRole('checkbox', { name: /Décision finale du DP/ }).click();
    await nextBtn(page).click();
    await nextBtn(page).click();
    await page.getByRole('button', { name: 'Figer et archiver' }).click();
    await expect(page.locator('.notice.ok')).toContainText('confirmée par le serveur', { timeout: 15_000 });
    await expect(page.getByRole('checkbox', { name: /copie dans mon Google Drive/ })).not.toBeChecked();
    await expect(page.locator('.notice', { hasText: 'Copie Google Drive' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Documents archivés' })).toBeVisible();
    await expect(page.locator('.doc-status').first()).toContainText('PDF archivés par le club');
    await shot(page, 'archive-sans-drive');

    await page.locator('.topbar-home').click();
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();
    await expect(page.locator('.notice', { hasText: 'sans copie Google Drive' })).toHaveCount(0);
    await expect(page.getByText('Copie Drive à faire')).toHaveCount(0);
    // Le script GIS (connexion) est chargé de toute façon : aucune demande de
    // jeton OAuth ni appel Drive.
    expect(google.filter((u) => /oauth2|googleapis\.com\/(upload\/)?drive/.test(u))).toEqual([]);
  });

  test("copie Drive en attente : bandeau d'information, « Ne plus proposer » le retire", async ({ page }) => {
    await openHome(page);
    await diveRow(page, 'Lac de Test')
      .getByRole('button', { name: /Démarrer/ })
      .click();
    await page.getByRole('checkbox', { name: /Décision finale du DP/ }).click();
    await nextBtn(page).click();
    await nextBtn(page).click();
    await page.getByRole('button', { name: 'Figer et archiver' }).click();
    await expect(page.locator('.notice.ok')).toContainText('confirmée par le serveur', { timeout: 15_000 });
    await page.locator('.topbar-home').click();
    const banner = page.locator('.notice', { hasText: 'sans copie Google Drive' });
    await expect(banner).toBeVisible();
    await expect(banner).not.toHaveClass(/\bwarn\b|\berr\b/);
    await banner.getByRole('button', { name: 'Ne plus proposer sur cet appareil' }).click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('dp-drive-export'))).toBe('off');
  });

  test('rappel PA / PE / GP accessible sur petit écran (400 × 650)', async ({ page }) => {
    // Production 04/09/2026 : le bouton « Commencer » sortait de l'écran.
    await page.setViewportSize({ width: 400, height: 650 });
    await page.goto('/');
    const splash = page.getByRole('dialog', { name: /Bonjour/ });
    const start = splash.getByRole('button', { name: 'Commencer' });
    await expect(start).toBeInViewport();
    await start.click();
    await expect(splash).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();
  });

  test('date de naissance manquante : saisie rapide dès l’ajout en palanquée', async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await page.getByLabel('Directeur de Plongée').selectOption('d-dp');
    await page.getByLabel('Site de plongée').selectOption('s-2');
    await nextBtn(page).click();

    // Plongeur avec date : pas de popup.
    await page.getByLabel('Ajouter Hugo BERNARD à une palanquée').selectOption('__new__');
    await expect(page.locator('.pal')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Plongeur sans date : popup immédiate, focus sur le champ.
    await page.getByLabel('Ajouter Zoé PETIT à une palanquée').selectOption({ index: 1 });
    const dlg = page.getByRole('dialog', { name: 'Date de naissance manquante' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Zoé PETIT');
    const input = dlg.getByLabel('Né(e) le');
    await expect(input).toBeFocused();
    expect(
      await new AxeBuilder({ page })
        .include('.dialog')
        .analyze()
        .then((r) => r.violations),
    ).toEqual([]);

    await input.pressSequentially('1203199');
    await expect(dlg.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await input.pressSequentially('0');
    await expect(input).toHaveValue('12/03/1990');
    await expect(dlg).toContainText('ans');
    await input.press('Enter');
    await expect(dlg).toBeHidden();

    // Fiche complète renvoyée (PUT réécrit la fiche) avec la date ISO.
    await expect.poll(() => state.diverUpdates.length).toBe(1);
    expect(state.diverUpdates[0]).toMatchObject({
      id: 'd-n1',
      nom: 'PETIT',
      date_naissance: '1990-03-12',
      medical: '2026-09-01',
    });
    expect(errors).toEqual([]);
  });

  test('date de naissance manquante : « Plus tard » ferme sans rien enregistrer', async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await nextBtn(page).click();
    await page.getByLabel('Ajouter Zoé PETIT à une palanquée').selectOption('__new__');
    const dlg = page.getByRole('dialog', { name: 'Date de naissance manquante' });
    await dlg.getByRole('button', { name: 'Plus tard' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.locator('.pal')).toHaveCount(1);
    expect(state.diverUpdates).toEqual([]);
  });

  test('bascule Soleil / Nuit mémorisée', async ({ page }) => {
    await openHome(page);
    const toggle = page.locator('.theme-toggle');
    // Le libellé reflète le thème effectif (choix mémorisé ou thème système).
    const initial = await toggle.locator('.label').textContent();
    await toggle.click();
    const expected = initial === 'Nuit' ? 'light' : 'dark';
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
        const summary = res.violations.map(
          (v) =>
            `${label} — ${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        );
        expect(summary).toEqual([]);
      };
      await audit('accueil');
      await diveRow(page, 'groupe technique').getByRole('button', { name: 'Modifier' }).click();
      await nextBtn(page).click();
      await expect(page.locator('.pal.is-blocked')).toBeVisible();
      await audit('palanquées');
      await page.locator('.topbar-home').click();
      await page
        .locator('.resume-card')
        .getByRole('button', { name: /Reprendre/ })
        .click();
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
    await page
      .locator('.topbar')
      .getByRole('button', { name: /Accueil/ })
      .click();
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

// Pleine page : la barre basse fixe et la barre haute collante sont replacées
// dans le flux pour ne pas masquer le contenu sur la capture.
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    fullPage: true,
    style: '.footnav, .topbar { position: static !important; }',
  });
}

async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('build local — captures', () => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`captures ${width}px ${theme}`, async ({ page }) => {
        state.realFonts = true;
        await page.setViewportSize({ width, height: width < 768 ? 720 : 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        // Rappel PA / PE / GP aux couleurs des palanquées.
        await page.goto('/');
        const splash = page.getByRole('dialog', { name: /Bonjour/ });
        await expect(splash.locator('.splash-legend')).toBeVisible();
        await shot(page, `rappel-${width}-${theme}`);
        await splash.getByRole('button', { name: 'Commencer' }).click();
        await expect(page.locator('.dive-row').first()).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `accueil-${width}-${theme}`);

        await diveRow(page, 'groupe technique').getByRole('button', { name: 'Modifier' }).click();
        await nextBtn(page).click();
        await expect(page.locator('.pal.is-blocked')).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `palanquees-${width}-${theme}`);

        await page.locator('.topbar-home').click();
        await page
          .locator('.resume-card')
          .getByRole('button', { name: /Reprendre/ })
          .click();
        await expect(page.locator('.cadran').nth(1)).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `fiche-${width}-${theme}`);

        // Modale de sortie : saisie « − / + » et paliers réalisés.
        await page.getByRole('button', { name: 'SORTIE' }).first().click();
        const fin = page.getByRole('dialog', { name: /Sortie de l'eau/ });
        await fin.getByRole('checkbox', { name: /Palier de confort/ }).check();
        const body = fin.locator('.dialog-body');
        expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(SHOTS, `fin-${width}-${theme}.png`) });
        await page.keyboard.press('Escape');
      });
    }
  }
});

// ── Socle club ───────────────────────────────────────────────────────────

const IMPORT_CSV = [
  'Nom;Prénom;N° licence;CACI;Email',
  'Dupont;Jean;A-123456;2026-02-01;jean@example.org',
  'Leroy;Inès;A-29-d-n3;2026-03-01;',
  'Faux;Max;A-1;31/02/2026;',
  'Petit;Zoé;A-29-d-n1;2026-09-01;',
].join('\n');

async function openTopbar(page, name) {
  await page.locator('.topbar-nav').getByRole('button', { name }).click();
}

async function openImport(page) {
  await openTopbar(page, 'Annuaire');
  await page.getByRole('button', { name: 'Importer un fichier' }).click();
  await expect(heading(page)).toHaveText('Importer des plongeurs');
}

async function simulateImport(page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'export-vpdive.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(IMPORT_CSV, 'utf-8'),
  });
  await expect(page.locator('.dropzone')).toContainText('export-vpdive.csv');
  await page.getByRole('button', { name: "Simuler l'import" }).click();
  await expect(page.getByRole('heading', { name: 'Rapport de simulation' })).toBeVisible();
}

async function axeViolations(page, label) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return res.violations.map(
    (v) =>
      `${label} — ${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
}

test.describe('build local — socle club', () => {
  test('écran Club : membres, invitation et copie du lien', async ({ page, context }) => {
    const errors = trackErrors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHome(page);
    await openTopbar(page, 'Club');
    await expect(heading(page)).toHaveText('Club Test');
    await expect(page.locator('.club-role')).toContainText('Responsable');
    await expect(page.getByRole('combobox', { name: 'Rôle de Paul Martin' })).toHaveValue('dp');
    await expect(page.locator('.diver-admin-row', { hasText: 'invite.attente@example.org' })).toBeVisible();

    await page.getByLabel('E-mail du compte Google invité').fill('nouveau.dp@example.org');
    await page.getByLabel('Rôle', { exact: true }).selectOption('encadrant');
    await page.getByRole('button', { name: 'Créer le lien' }).click();
    const link = page.getByLabel("Lien d'invitation");
    await expect(link).toHaveValue(/#invitation=c{64}$/);
    await page.getByRole('button', { name: 'Copier le lien' }).click();
    await expect(page.getByRole('button', { name: 'Copié' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await link.inputValue());
    expect(state.invitations[0]).toMatchObject({ email: 'nouveau.dp@example.org', role: 'encadrant' });

    // Annulation d'une invitation en attente.
    await page.getByRole('button', { name: "Annuler l'invitation de invite.attente@example.org" }).click();
    await page
      .getByRole('dialog', { name: "Annuler l'invitation ?" })
      .getByRole('button', { name: "Annuler l'invitation" })
      .click();
    await expect(page.locator('.diver-admin-row', { hasText: 'invite.attente@example.org' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("changement de club : données locales de l'ancien club purgées", async ({ page }) => {
    await openHome(page);
    await openTopbar(page, 'Club');
    const row = page.locator('.club-switch-row', { hasText: 'Bulles du Lac' });
    await row.getByRole('button', { name: 'Passer sur ce club' }).click();
    await page
      .getByRole('dialog', { name: /Passer sur Bulles du Lac/ })
      .getByRole('button', { name: 'Changer de club' })
      .click();
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();
    await expect(page.locator('.topbar-club')).toHaveText('Bulles du Lac');
    expect(state.currentClub).toBe(OTHER_CLUB_ID);
    const localClub = await page.evaluate(() => localStorage.getItem('dp-club-id'));
    expect(localClub).toBe(OTHER_CLUB_ID);
  });

  test("acceptation d'une invitation après connexion", async ({ page }) => {
    await page.goto(`/#invitation=${INVITATION_TOKEN}`);
    await page
      .getByRole('dialog', { name: /Bonjour/ })
      .getByRole('button', { name: 'Commencer' })
      .click();
    const dlg = page.getByRole('dialog', { name: 'Rejoindre Bulles du Lac ?' });
    await expect(dlg).toContainText('dp.test@example.org');
    await expect(page).toHaveURL(/\/$/); // jeton retiré de la barre d'adresse
    await dlg.getByRole('button', { name: 'Rejoindre en tant que DP' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.locator('.toast')).toContainText('Bulles du Lac');
    expect(state.accepted).toBe(true);
  });

  test('invitation destinée à un autre e-mail : acceptation impossible', async ({ page }) => {
    await page.goto(`/#invitation=${MISMATCH_TOKEN}`);
    await page
      .getByRole('dialog', { name: /Bonjour/ })
      .getByRole('button', { name: 'Commencer' })
      .click();
    const dlg = page.getByRole('dialog', { name: 'Rejoindre Bulles du Lac ?' });
    await expect(dlg.locator('.alert.err')).toContainText('autre.personne@example.org');
    await expect(dlg.getByRole('button', { name: /Rejoindre en tant que/ })).toHaveCount(0);
    await expect(dlg.getByRole('button', { name: 'Changer de compte Google' })).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Supprimer les données de cet appareil' })).toBeVisible();
    await dlg.getByRole('button', { name: "Ignorer l'invitation" }).click();
    await expect(dlg).toBeHidden();
    expect(state.accepted).toBe(false);
  });

  test("import de l'annuaire : simulation puis confirmation", async ({ page }) => {
    const errors = trackErrors(page);
    await openHome(page);
    await openImport(page);
    await simulateImport(page);
    const table = page.locator('.data-table');
    await expect(table.locator('tbody tr')).toHaveCount(4);
    await expect(table.locator('tr.is-error')).toContainText('31/02/2026');
    await expect(table.locator('tr.is-error td').first()).toHaveText('4');
    await expect(table).toContainText('PN-C ajouté');
    await page.getByRole('radio', { name: /Erreurs/ }).click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    expect(state.imports).toEqual(['dry_run']);

    await page.getByRole('button', { name: "Confirmer l'import (2 fiches)" }).click();
    await expect(page.getByRole('heading', { name: 'Import terminé' })).toBeVisible();
    await expect(page.locator('.alert.ok')).toContainText('1 fiche créée, 1 mise à jour');
    expect(state.imports).toEqual(['dry_run', 'apply']);
    await page.getByRole('button', { name: "Voir l'annuaire" }).click();
    await expect(heading(page)).toHaveText('Annuaire des plongeurs');
    expect(errors).toEqual([]);
  });

  test("alertes sur l'accueil puis détail dans l'annuaire", async ({ page }) => {
    await openHome(page);
    const banner = page.locator('.alerts-banner');
    await expect(banner).toContainText("4 alertes sur l'annuaire, 3 plongeurs");
    await expect(banner).toContainText('2 CACI expirés');
    await expect(banner).toHaveClass(/err/);
    await banner.getByRole('button', { name: 'Voir les alertes' }).click();
    const panel = page.locator('#annuaire-alertes');
    await expect(panel).toContainText('Hugo BERNARD');
    await expect(panel).toContainText('Autorisation parentale manquante');
    await panel.getByRole('button', { name: 'Mettre à jour la fiche de Zoé PETIT' }).click();
    const dlg = page.getByRole('dialog', { name: /Modifier Zoé PETIT/ });
    await expect(dlg.getByLabel('Fin de licence')).toBeVisible();
  });

  test('historique : PDF archivés par le club', async ({ page }) => {
    await openHome(page);
    await openTopbar(page, 'Historique');
    const row = page.locator('.archive-row', { hasText: 'sortie club' });
    await expect(row).toContainText('PDF archivés');
    await row.click();
    await expect(page.locator('.doc-status')).toContainText('PDF archivés par le club');
    const download = page.waitForEvent('download');
    await page
      .locator('.doc-row', { hasText: 'Fiche de sécurité' })
      .getByRole('button', { name: 'Télécharger' })
      .click();
    expect((await download).suggestedFilename()).toBe('2026-10-19-fiche-carriere.pdf');
    expect(state.downloads).toEqual(['srv-4/fiche']);
    // Documents complets : une fiche archivée ne se régénère pas.
    await expect(page.getByRole('button', { name: 'Régénérer les PDF' })).toHaveCount(0);
  });

  test('historique : régénération proposée seulement après un échec de génération', async ({ page }) => {
    state.dives.find((d) => d.id === 'srv-4').documents_status = 'error';
    await openHome(page);
    await openTopbar(page, 'Historique');
    await page.locator('.archive-row', { hasText: 'sortie club' }).click();
    await expect(page.locator('.doc-status')).toContainText('Échec de la génération');
    await page.getByRole('button', { name: 'Régénérer les PDF' }).click();
    await expect(page.locator('.doc-status')).toContainText('PDF archivés par le club');
    await expect(page.getByRole('button', { name: 'Régénérer les PDF' })).toHaveCount(0);
    expect(state.regenerations).toEqual(['srv-4']);
  });

  test('statistiques et export CSV', async ({ page }) => {
    await openHome(page);
    await openTopbar(page, 'Club');
    await page.getByRole('button', { name: 'Statistiques du club' }).click();
    await expect(heading(page)).toHaveText('Statistiques du club');
    await expect(page.locator('.kpi', { hasText: 'Plongeurs distincts' })).toContainText('57');
    await expect(page.locator('.kpi', { hasText: 'Heures-plongeur' })).toContainText('198,5');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter en CSV' }).click();
    expect((await download).suggestedFilename()).toBe('statistiques-2026-09-15-2027-09-14.csv');
  });

  test('mon compte : export des données', async ({ page }) => {
    await openHome(page);
    await openTopbar(page, 'Test');
    await expect(heading(page)).toHaveText('Mon compte');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger mes données' }).click();
    expect((await download).suggestedFilename()).toMatch(/^dp-assistant-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(state.calls).toContain('GET /api/account/export');
  });

  test('suppression du compte : 409 actionnable puis succès et purge locale', async ({ page }) => {
    state.deleteConflict = true;
    await openHome(page);
    await openTopbar(page, 'Test');
    await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
    const dlg = page.getByRole('dialog', { name: 'Supprimer votre compte ?' });
    const confirm = dlg.getByRole('button', { name: 'Supprimer mon compte' });
    await expect(confirm).toBeDisabled();
    await dlg.getByLabel(/Pour confirmer, saisissez/).fill('SUPPRIMER');
    await confirm.click();
    await expect(dlg.locator('.alert.err')).toContainText('seul responsable du club');
    await expect(dlg.getByRole('button', { name: "Ouvrir l'écran Club" })).toBeVisible();

    state.deleteConflict = false;
    await confirm.click();
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect(page.locator('.login-card .notice')).toContainText('3 fiches de sécurité archivées conservées');
    await expect(page.locator('.login-card .kv-list')).toContainText('14 juil. 2027');
    const local = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('dp-offline');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const count = (name) =>
        new Promise((res) => {
          const q = db.transaction(name, 'readonly').objectStore(name).count();
          q.onsuccess = () => res(q.result);
        });
      return {
        lastUser: localStorage.getItem('dp-last-user'),
        clubId: localStorage.getItem('dp-club-id'),
        dives: await count('dives'),
        meta: await count('meta'),
      };
    });
    expect(local).toEqual({ lastUser: null, clubId: null, dives: 0, meta: 0 });
  });

  test("écritures de l'outbox envoyées avec l'en-tête X-DP-Club", async ({ page }) => {
    await openHome(page);
    await page.getByRole('button', { name: /Nouvelle plongée/ }).click();
    await expect.poll(() => state.calls.includes('POST /api/dives')).toBe(true);
    expect(state.clubHeaders).toContainEqual({ call: 'POST /api/dives', club: CLUB_ID });
  });

  test("lectures API aussi envoyées avec l'en-tête X-DP-Club du club courant", async ({ page }) => {
    await openHome(page);
    await expect.poll(() => state.clubHeaders.some((h) => h.call === 'GET /api/club')).toBe(true);
    expect(state.clubHeaders).toContainEqual({ call: 'GET /api/club', club: CLUB_ID });
    expect(state.clubHeaders.some((h) => h.call.startsWith('GET /api/auth/'))).toBe(false);
  });

  test('club retiré (403 CLUB_NOT_MEMBER) : resynchronisation et suppression des données proposée', async ({
    page,
  }) => {
    await openHome(page);
    // Retiré du club par son responsable : le serveur choisit un autre club courant.
    state.revokedClubs = [CLUB_ID];
    state.currentClub = OTHER_CLUB_ID;
    await openTopbar(page, 'Club');
    const banner = page.locator('.banner', { hasText: "Vous n'êtes plus membre" });
    await expect(banner).toBeVisible();
    await expect(page.locator('.topbar-club')).toHaveText('Bulles du Lac');
    expect(await page.evaluate(() => localStorage.getItem('dp-club-id'))).toBe(OTHER_CLUB_ID);

    await banner.getByRole('button', { name: 'Supprimer les données de cet appareil' }).click();
    const dlg = page.getByRole('dialog', { name: 'Supprimer les données de cet appareil ?' });
    await expect(dlg).toContainText('ne sont pas touchées');
    await dlg.getByRole('button', { name: 'Supprimer' }).click();
    // Page rechargée : session toujours valide → club courant resynchronisé.
    await expect(page.getByRole('dialog', { name: /Bonjour/ })).toBeVisible();
  });

  test("session expirée : reconnexion ou suppression des données de l'appareil", async ({ page }) => {
    await openHome(page);
    state.unauthorized = true;
    await openTopbar(page, 'Club');
    const banner = page.locator('.banner', { hasText: 'Session expirée' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Se reconnecter' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Supprimer les données de cet appareil' })).toBeVisible();
  });

  test('401 reçu avant la connexion : pas de bandeau « Session expirée » une fois connecté', async ({ page }) => {
    // Déconnecté : /api/auth/me → null, la synchro démarrée au boot reçoit 401.
    state.deleted = true;
    state.unauthorized = true;
    // Google Identity Services simulé : on garde le callback de connexion.
    await page.addInitScript(() => {
      window.google = {
        accounts: { id: { initialize: (o) => (window.__gsiCallback = o.callback), renderButton() {}, prompt() {} } },
      };
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect.poll(() => state.calls.includes('GET /api/sync/state')).toBe(true);

    state.deleted = false;
    state.unauthorized = false;
    await page.waitForFunction(() => typeof window.__gsiCallback === 'function');
    await page.evaluate(() => window.__gsiCallback({ credential: 'jeton-de-test' }));
    await page
      .getByRole('dialog', { name: /Bonjour/ })
      .getByRole('button', { name: 'Commencer' })
      .click();
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toBeVisible();
    await expect(page.locator('.banner', { hasText: 'Session expirée' })).toHaveCount(0);
  });

  test("rôle « lecture » : actions d'écriture masquées, pas d'alertes", async ({ page }) => {
    state.role = 'lecture';
    await page.goto('/');
    await page
      .getByRole('dialog', { name: /Bonjour/ })
      .getByRole('button', { name: 'Commencer' })
      .click();
    await expect(page.locator('.home-console')).toContainText('Rôle Lecture : consultation des plongées');
    await expect(page.locator('.dive-row').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Nouvelle plongée/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Démarrer/ })).toHaveCount(0);
    await expect(page.locator('.alerts-banner')).toHaveCount(0);
    await openTopbar(page, 'Annuaire');
    await expect(page.getByRole('button', { name: 'Nouveau plongeur' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Importer un fichier' })).toHaveCount(0);
    await openTopbar(page, 'Club');
    await expect(page.getByRole('button', { name: 'Créer le lien' })).toHaveCount(0);
    await expect(page.getByLabel('Nom du club ou de la structure')).toHaveCount(0);
    await expect(page.locator('.kv-rows')).toContainText('06123456');
  });

  for (const scheme of ['light', 'dark']) {
    test(`club, import, statistiques et compte sans violation WCAG A/AA (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openHome(page);
      const found = [];
      await openTopbar(page, 'Club');
      await expect(page.locator('.diver-admin-row').first()).toBeVisible();
      await page.getByLabel('E-mail du compte Google invité').fill('a11y@example.org');
      await page.getByRole('button', { name: 'Créer le lien' }).click();
      await expect(page.getByLabel("Lien d'invitation")).toBeVisible();
      found.push(...(await axeViolations(page, 'club')));
      await page.getByRole('button', { name: 'Statistiques du club' }).click();
      await expect(page.locator('.kpi').first()).toBeVisible();
      found.push(...(await axeViolations(page, 'statistiques')));
      await openImport(page);
      await simulateImport(page);
      found.push(...(await axeViolations(page, 'import')));
      await openTopbar(page, 'Test');
      await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
      found.push(...(await axeViolations(page, 'suppression du compte')));
      expect(found).toEqual([]);
    });
  }

  for (const theme of THEMES) {
    for (const width of [375, 1440]) {
      test(`captures club et import ${width}px ${theme}`, async ({ page }) => {
        state.realFonts = true;
        await page.setViewportSize({ width, height: width < 768 ? 720 : 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await openHome(page);
        const nav = async (name) => {
          if (width >= 1024) return openTopbar(page, name);
          await page.locator('.topbar-menu > button').click();
          return page.locator('.menu-pop').getByRole('button', { name }).click();
        };
        await nav('Club');
        await expect(page.locator('.diver-admin-row').first()).toBeVisible();
        await page.getByLabel('E-mail du compte Google invité').fill('nouveau.dp@example.org');
        await page.getByRole('button', { name: 'Créer le lien' }).click();
        await expect(page.getByLabel("Lien d'invitation")).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, `club-${width}-${theme}`);

        await nav('Annuaire');
        await page.getByRole('button', { name: 'Importer un fichier' }).click();
        await simulateImport(page);
        await noHorizontalOverflow(page);
        await shot(page, `import-${width}-${theme}`);
      });
    }
  }

  for (const width of [375, 1440]) {
    test(`création d'un plongeur en réglementation PF ${width}px`, async ({ page }) => {
      state.clubs[CLUB_ID].jurisdiction = 'PF';
      state.realFonts = true;
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openHome(page);

      const nav = async (name) => {
        if (width >= 1024) return openTopbar(page, name);
        await page.locator('.topbar-menu > button').click();
        return page.locator('.menu-pop').getByRole('button', { name }).click();
      };

      await nav('Annuaire');
      await expect(page.locator('.diver-admin-row').first()).toBeVisible();
      await page.getByRole('button', { name: 'Nouveau plongeur' }).click();

      const dlg = page.getByRole('dialog', { name: 'Nouveau plongeur' });
      await expect(dlg).toBeVisible();

      // Section « Polynésie française (arrêté n° 199 CM) » ouverte
      const pfDetails = dlg.locator('details.field', { hasText: 'Polynésie française (arrêté n° 199 CM)' });
      await expect(pfDetails).toHaveJSProperty('open', true);

      // Certificat médical non obligatoire en PF (pas de span .req)
      const medField = dlg.locator('.field', { hasText: 'Certificat médical' });
      await expect(medField.locator('.req')).toHaveCount(0);

      // Saisie nom / prénom
      await dlg.getByLabel(/^Nom/).fill('Teheiura');
      await dlg.getByLabel('Prénom').fill('Moana');

      // Cocher une aptitude (ex: PE-40)
      await dlg.getByRole('checkbox', { name: 'PE-40', exact: true }).check();

      await noHorizontalOverflow(page);
      await shot(page, `plongeur-pf-${width}-light`);

      // Enregistrer sans certificat médical
      await dlg.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(dlg).toHaveCount(0);

      // Le corps POST porte pf.aptitudes
      expect(state.diverCreations).toBeDefined();
      expect(state.diverCreations.length).toBe(1);
      const created = state.diverCreations[0];
      expect(created.nom).toBe('Teheiura');
      expect(created.prenom).toBe('Moana');
      expect(created.medical).toBe('');
      expect(created.pf?.aptitudes).toContain('PE-40');
    });
  }
});
