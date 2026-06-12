# Sécurité — DP Assistant

Documentation et procédures sécurité du projet.

## Sommaire

- [gcp-checklist.md](gcp-checklist.md) — Audit trimestriel GCP (OAuth Consent
  Screen, OAuth Client, API Keys, Quotas).
- [composer-audit.md](composer-audit.md) — Audit des dépendances PHP (à venir
  quand on aura Composer sur le Pi).

## Architecture sécurité

```text
┌──────────────────────────────────────────────────────────────┐
│ Navigateur                                                   │
│  - CSP stricte (nonce sera Sprint 5+) + SRI sur tous CDN     │
│  - Cookie session HttpOnly + CSRF double-submit              │
│  - localStorage : snapshot user 7j, cache annuaire (read-only)│
│  - dp_driveToken : access_token Drive 55 min, en RAM         │
└──────────────────────────────────────────────────────────────┘
                          │ HTTPS only
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ nginx (Raspberry Pi)                                         │
│  - HSTS 1 an + preload                                       │
│  - X-Content-Type-Options nosniff, X-Frame-Options DENY      │
│  - Permissions-Policy : camera/mic/payment/usb DENY          │
│  - Cross-Origin-Opener-Policy : same-origin-allow-popups     │
│  - CSP report-uri → /api/csp/report                          │
└──────────────────────────────────────────────────────────────┘
                          │ proxy_pass /api/* → PHP-FPM
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ PHP backend (per-request)                                    │
│  - Auth::verifyGoogleToken : JWKS local (RS256) + fallback   │
│    tokeninfo. Audience + issuer + exp toujours revalidés.    │
│  - Rate-limit APCu : login 10/15min ; writes 120/min/IP.     │
│  - CSRF double-submit obligatoire sur POST/PATCH/PUT/DELETE  │
│  - Soft-delete avec idempotence client_uuid pour dives,      │
│    divers, sites.                                            │
└──────────────────────────────────────────────────────────────┘
                          │ PDO prepared statements
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ MariaDB                                                       │
│  - users.email UNIQUE — pas de doublons via Google OAuth     │
│  - sessions FK → users ON DELETE CASCADE                     │
│  - Tous les FK avec ON DELETE CASCADE → pas d'orphelins      │
└──────────────────────────────────────────────────────────────┘
```

## Surfaces d'attaque & mitigations

| Surface | Risque | Mitigation |
|---|---|---|
| Login OAuth | Token forgé | Vérif JWT locale RS256 via JWKS Google + revalidation aud/iss/exp |
| Session vol | Cookie capture | HttpOnly + Secure + SameSite=Lax + TTL 7j sliding |
| CSRF | State-changing CSRF | Double-submit cookie (`dp_csrf` SameSite=Strict, HttpOnly=false → JS lit) |
| Brute-force login | Rate-limit IP | 10 essais / 15 min / IP (APCu) |
| Brute-force écriture | Spam metadata | 120 mutations / min / IP (APCu) |
| Injection SQL | Param malicieux | PDO prepared statements partout |
| XSS | innerHTML | React = jamais innerHTML. Le seul dangerouslySetInnerHTML : aucun. |
| Drive escalation | Scope abusif | scope=`drive.file` UNIQUEMENT (accès aux fichiers créés par l'app) |
| Map API abuse | Quota drain | Restriction par référent HTTP côté GCP |
| Super-admin spoof | Promotion DB | `Auth::requireSuperAdmin` check email constant `nicholas.jallan@gmail.com` |
| Secret leak | Push public | `config.php` gitignored, vit dans `/etc/dp-fede/` |

## Outils

### Audit manuel

```bash
# Trouver les console.log en prod (devrait être 0 critique)
grep -rn "console.log" --include="*.jsx" --include="*.js" . | grep -v tests/

# Trouver les TODOs ouverts liés sécurité
grep -rn "TODO\|FIXME" --include="*.php" backend/

# Lister les permissions des fichiers config sur le Pi
ssh pi@bullesenvalais.ch "ls -la /etc/dp-fede/"
# → doit être : -rw-r----- 1 root www-data
```

### Audit automatique (en CI)

À venir Sprint 5+ :
- `composer audit` (PHP)
- `npm audit` (déjà à 0 deps prod, mais Playwright en dev)
- Snyk ou Dependabot pour les CDN versions

## Réponse incident

Voir [gcp-checklist.md §9](gcp-checklist.md#9-réponse-incident) pour la
procédure complète. Résumé :

1. Identifier l'incident (logs nginx + Auth tokeninfo failures + APCu rate-limit hits).
2. Couper l'accès : `DELETE FROM sessions;` (force re-login).
3. Rotater secrets compromis (DB password, OAuth client si besoin).
4. Patch + redéployer.
5. Post-mortem documenté ici dans `docs/security/incidents/YYYY-MM-DD.md`.
