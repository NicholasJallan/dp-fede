# Composer Audit — DP Assistant

## Dépendances de production

Le backend **embarque des dépendances Composer en production**, installées sur
le Pi par `deploy/deploy-backend.sh` (`composer install --no-dev
--optimize-autoloader`, exécuté en `www-data` sous PHP 8.5). `composer.lock`
est versionné : la prod installe exactement les versions testées en CI.

| Paquet (direct)       | Rôle                                                                                     | Surface                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `firebase/php-jwt` ^7 | Vérification locale (RS256, JWKS Google) des ID tokens au login (`Auth::verifyJwtLocal`) | Parsing de JWT non fiables : à mettre à jour en priorité en cas d'avis de sécurité                                                                     |
| `mpdf/mpdf` ^8.3      | Génération des PDF fiche / check-list (`PdfRender`)                                      | Rendu HTML → PDF. Le HTML est produit à 100 % par les templates serveur (l'ancien mode « HTML fourni par le client » a été supprimé : risque SSRF/LFI) |

Dépendances transitives (via mPDF) : `setasign/fpdi`, `myclabs/deep-copy`,
`psr/log`, `psr/http-message`, `mpdf/psr-http-message-shim`,
`mpdf/psr-log-aware-trait`, `paragonie/random_compat`.

Dev uniquement (jamais installé sur le Pi) : `phpunit/phpunit` ^9.6 et
`doctrine/instantiator` ~2.0.0 (dépendance de PHPUnit épinglée : la 2.1 exige
PHP 8.4, la CI teste aussi 8.2).

`composer.json` exige `"php": ">=8.2"` et fixe `config.platform.php = 8.5.11`
(PHP du pool de production) : la résolution correspond à la production,
quelle que soit la version locale, et chaque paquet verrouillé accepte aussi
8.2 (CI 8.2 et 8.5). Au runtime, `vendor/composer/platform_check.php` refuse
de démarrer sous PHP < 8.2 (cf. [../deploy/php85.md](../deploy/php85.md)).
Régénérer le verrou : `composer update` (jamais `--ignore-platform-reqs`).

Sans `vendor/`, l'API démarre quand même : la vérification JWT retombe sur
l'endpoint `tokeninfo` de Google et la génération PDF échoue (500).

## Audit

- **CI** : `composer audit` à chaque push/PR (`.github/workflows/ci.yml`, job
  backend, PHP 8.2 et 8.5).
- **Local** :

  ```bash
  cd backend
  composer install
  composer audit            # avis de sécurité (dev + prod)
  composer audit --no-dev   # prod uniquement
  composer outdated --direct
  ```

- **Trimestriel** (avec [gcp-checklist.md](gcp-checklist.md)) : `composer
outdated --direct`, lecture des changelogs de php-jwt et mPDF, mise à jour
  si nécessaire, puis `composer test` et déploiement.

## Règles d'ajout d'une dépendance

1. Justifier le besoin (pas d'équivalent natif PHP raisonnable).
2. Vérifier la confiance : mainteneur, activité, historique d'avis de sécurité.
3. Évaluer la surface : parsing d'entrées non fiables, accès réseau/fichiers,
   exécution de processus (bloquée de toute façon par `disable_functions` dans
   le pool FPM, cf. `deploy/php-fpm-dp-fede.conf`).
4. Contrainte de version majeure explicite (`^X.Y`, jamais `*`).
5. Documenter l'ajout dans le tableau ci-dessus.

## Historique

- `lib/Smtp.php` a été supprimé du backend. Le script hors dépôt
  `pi-scripts/backup_report.php` l'inclut encore : le remplacer par
  `deploy/backup-notify-mail.sh` (sendmail/msmtp, sans PHP) — cf.
  [../deploy/README.md](../deploy/README.md).
- PHP 7.4 (fin de vie novembre 2022) → PHP 8.5 pour le backend, dans un pool
  FPM dédié de php8.5-fpm (partagé avec l'application « dive ») ;
  PrestaShop/WordPress restent en 7.4 sur le même Pi. L'autoloader restreint
  `lib/PdfAutoload.php` et `lib/psr-log-shim/` (contournement de la
  production sous 7.4) sont supprimés : `vendor/autoload.php` complet.

En cas de CVE corrigée par une mise à jour, documenter le correctif dans
`docs/security/incidents/AAAA-MM-JJ.md`.
