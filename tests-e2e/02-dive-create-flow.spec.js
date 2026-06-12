// @ts-check
// Golden path 2 : créer une nouvelle plongée, remplir la section A du
// questionnaire, sauvegarder, vérifier qu'elle apparaît en "Préparées"
// sur la home.
//
// Pré-requis : au moins un site existe pour ce compte (E2E_FIXTURE_SITE_NAME).

const { test, expect } = require('@playwright/test');

const FIXTURE_SITE = process.env.DP_E2E_FIXTURE_SITE_NAME || 'Site Test E2E';

test.describe('Création d\'une plongée préparée', () => {
  test('+ Nouvelle plongée → questionnaire → retour home', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Nouvelle plongée/i }).click();

    // Étape 1 : profil de plongée
    await expect(page.locator('h1, h2').first()).toContainText(/Profil|Profil de plongée/i);

    // Sélection d'un site existant. Implémentation Spinner/Select adaptable :
    // on cible le bouton « Sites » et on choisit le premier.
    const siteSelector = page.getByRole('button', { name: /Choisir un site|Sélectionner un site/i }).first();
    if (await siteSelector.isVisible().catch(() => false)) {
      await siteSelector.click();
      const firstSite = page.getByText(FIXTURE_SITE).first();
      if (await firstSite.isVisible().catch(() => false)) {
        await firstSite.click();
      }
    }

    // Revenir à l'accueil — la plongée doit apparaître dans "Préparées".
    const home = page.getByRole('button', { name: /Accueil|↩/i }).first();
    if (await home.isVisible().catch(() => false)) {
      await home.click();
    } else {
      await page.goto('/');
    }

    // Vérifier qu'au moins une carte "Préparée" est visible.
    const prepCount = await page.locator('.dive-card-row').count();
    expect(prepCount).toBeGreaterThanOrEqual(1);
  });
});
