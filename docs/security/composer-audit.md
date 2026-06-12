# Composer Audit — DP Assistant

## État actuel

Le backend PHP n'a **aucune dépendance Composer en production**. `backend/composer.json`
n'existe pas en runtime sur le Pi ; il a été ajouté en Sprint 2 uniquement
pour faire tourner PHPUnit en dev.

```text
backend/lib/
├── Auth.php          # Vérif JWT locale (RS256) — aucune dépendance externe
├── Config.php        # Charge /etc/dp-fede/config.php
├── Csrf.php          # Double-submit token, random_bytes natif
├── Db.php            # PDO MySQL natif
├── Json.php          # json_encode/decode natifs
├── Smtp.php          # PHPMailer absent — utilise mail() ou SMTP natif
├── SyncHelpers.php   # DateTimeImmutable + regex natifs
└── Validate.php      # filter_var natif
```

→ **Surface d'attaque externe : nulle** côté Composer.

## Audit dev (PHPUnit)

PHPUnit 9.x est la seule dépendance dev. Aucun composant runtime — donc
même une CVE sur PHPUnit ne touche pas la prod.

```bash
cd backend
composer install --dev
composer audit
```

À lancer trimestriellement (cf. [gcp-checklist.md](gcp-checklist.md)).

## Si Composer arrive en prod

Si un futur sprint introduit une dépendance Composer en prod (ex : firebase/php-jwt
pour remplacer notre vérif JWT locale, ou phpmailer/phpmailer pour Smtp.php),
il faudra :

1. Activer `composer audit` dans la CI.
2. Pinner les versions majeures (`^X.Y`, pas `*`).
3. Activer Dependabot ou un équivalent sur le repo GitHub.
4. Documenter chaque ajout ici avec :
   - Pourquoi cette dépendance
   - Maintainer trust (Github org, stars, dernier release)
   - Surface (RCE possible ? gestion stream/HTTP ?)

## PHP version

PHP 7.4 est **EOL** depuis novembre 2022. Migration PHP 8.2+ planifiée pour
Sprint 5+. Pas d'impact sécurité immédiat (le Pi est privé, pas exposé via
PHP brut), mais à terme :

- Pas de patchs de sécurité backportés.
- Certaines extensions tierces n'updateront plus.

## Logs Composer

À chaque update :

```bash
composer update --dry-run
composer outdated --direct
```

Documenter le diff dans `docs/security/incidents/` si une CVE patche un
package.
