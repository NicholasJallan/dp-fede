# Tests E2E — Playwright

Tests bout-en-bout contre `dp-fede.bullesenvalais.ch` (prod par défaut) ou
une URL de staging.

## Pré-requis

- Node 20+
- `npm install` (installe `@playwright/test`)
- `npx playwright install chromium webkit` (binaries navigateurs)

## Configuration

Les tests ont besoin d'une session valide. Comme on ne peut pas automatiser
Google OAuth, on injecte un cookie `dp_session` + `dp_csrf` obtenus une fois
manuellement.

### Obtenir les cookies (une seule fois)

1. Ouvrir `https://dp-fede.bullesenvalais.ch` dans Chrome
2. Se connecter avec Google
3. DevTools → Application → Cookies → copier les valeurs de `dp_session`
   et `dp_csrf`
4. Exporter :

```bash
export DP_E2E_SESSION_COOKIE='<valeur>'
export DP_E2E_CSRF_COOKIE='<valeur>'
```

5. (Optionnel) fixture site :

```bash
export DP_E2E_FIXTURE_SITE_NAME='Site Test E2E'
```

### Cibler staging ou local

```bash
export PLAYWRIGHT_BASE_URL='http://localhost:8080'
```

## Lancer

```bash
npm run test:e2e         # headless
npm run test:e2e:ui      # UI mode (debug)
```

Rapport HTML : `tests-e2e-report/index.html` après une exécution.

## Scénarios couverts

| Fichier | Couvre |
|---|---|
| `01-home-loads.spec.js` | Hero, sections cycle de vie, badge Drive |
| `02-dive-create-flow.spec.js` | + Nouvelle plongée → profil → retour home |
| `03-offline-resilience.spec.js` | Coupure réseau, navigation, reconnexion |

## CI

Les cookies E2E doivent être stockés en `GitHub Actions secrets` (ou
équivalent) sous les mêmes noms. La session ayant une TTL de 7 jours, le
secret doit être renouvelé hebdomadairement OU on prévoit un compte de
service E2E avec session longue.

## Limites

- Aucun test ne crée/supprime des données en production : ils sont read-only
  ou utilisent une fixture pré-créée.
- Le scénario d'archivage Drive n'est pas automatisé (popup OAuth Google).
