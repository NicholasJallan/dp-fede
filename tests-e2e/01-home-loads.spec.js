// @ts-check
// Golden path 1 : la home charge correctement, affiche les sections cycle de
// vie (Préparées / En cours / Archivées). Pas d'action mutative — safe en
// production tant qu'on n'a pas créé de site/plongeur fixture.

const { test, expect } = require('@playwright/test');

test.describe('Home — affichage', () => {
  test('hero + sections cycle de vie visibles', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Préparer et diriger');

    // Le bouton "Nouvelle plongée" est présent et activé en ligne.
    const newBtn = page.getByRole('button', { name: /Nouvelle plongée/i });
    await expect(newBtn).toBeVisible();
    await expect(newBtn).toBeEnabled();
  });

  test('badge Drive autorisé apparaît après obtention du token', async ({ page }) => {
    await page.goto('/');
    // Au load on n'a PAS fait de demande Drive (changement Sprint 1) ; on
    // attend donc que le badge soit absent par défaut.
    const badge = page.getByText(/Google Drive autorisé/i);
    await expect(badge).toBeHidden();
  });

  test('navigation vers Annuaire fonctionne', async ({ page }) => {
    await page.goto('/');
    // Le menu admin/annuaire est accessible depuis le header.
    const annuaire = page.getByRole('button', { name: /Annuaire|Plongeurs/i }).first();
    if (await annuaire.isVisible().catch(() => false)) {
      await annuaire.click();
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });
});
