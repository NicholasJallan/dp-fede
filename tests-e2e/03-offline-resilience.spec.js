// @ts-check
// Golden path 3 : résilience offline.
// Charger la home, couper le réseau, naviguer entre écrans, vérifier qu'on
// ne plante pas (SW + outbox doivent tout absorber).

const { test, expect } = require('@playwright/test');

test.describe('Mode offline', () => {
  test('navigation reste fonctionnelle après coupure réseau', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Préparer et diriger');

    // Simule la perte de connexion. Le SW + lib/net.js doivent prendre le relai.
    await context.setOffline(true);

    // Recharger l'accueil → doit toujours afficher la home depuis le SW cache.
    await page.reload();
    await expect(page.locator('h1')).toContainText('Préparer et diriger', { timeout: 15_000 });

    // Le bouton "Nouvelle plongée" reste cliquable (même offline) — l'archive
    // sera mise en outbox.
    const newBtn = page.getByRole('button', { name: /Nouvelle plongée/i });
    await expect(newBtn).toBeVisible();

    await context.setOffline(false);
  });

  test('reconnexion déclenche un sync (event dp:netchange)', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);

    // On observe que le hook useOnline réagit : pas de log d'erreur ici, on
    // se limite à un smoke test (pas d'erreur JS console non-attendue).
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});
