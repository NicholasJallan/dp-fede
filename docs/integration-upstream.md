# Intégration de la branche de production (`origin/main`, juin → 5 septembre 2026)

`origin/main` contient 9 commits poussés en production pendant la refonte
(`60399fe..origin/main`, ≈ 2 700 lignes, 52 fichiers), absents de
`feat/integration-prod`. Fusion : commit `merge: intègre origin/main`. Le
front ayant été déplacé dans `src/` et redessiné, **aucun ancien fichier
racine n'a été recopié** : chaque intention est soit ré-implémentée dans la
nouvelle architecture, soit déjà couverte (justification ci-dessous).

## Inventaire commit par commit

### 3a9a3ae — feat(workspaces) : structures partagées entre moniteurs

| Intention | Où elle est réalisée maintenant |
|---|---|
| Plusieurs moniteurs partagent annuaire, sites et fiches | **Clubs** (socle club : rôles responsable / dp / encadrant / lecture, `docs/api-club.md`). |
| Données d'une structure portées par un compte technique (`users.kind='workspace'`) | Migration `007_clubs.sql` : un club par structure, ses lignes rattachées, membres repris (owner → responsable, member → dp), club courant selon la dernière session. Détail et résultat attendu : [deploy/php85.md](deploy/php85.md#reprise-des-structures). |
| `002_workspaces.sql` (appliquée en production) | Conservée **à l'identique** (empreinte vérifiée par `MigratorTest`) ; nos migrations renumérotées **003 → 011**. Tables `workspaces*`, `sessions.workspace_id`, colonnes `created_by` conservées (pas de DROP). |
| Compte-structure jamais connectable | `Auth::current` le refuse toujours (`LegacyWorkspaces::isTechnicalAccount`, test `AuthSessionTest`) ; exclu de `/api/users*`, de la purge des inactifs et des actions super-admin ; aucun club personnel. |
| Rejoindre par code d'invitation, bascule de scope, quitter | Invitations nominatives à usage unique, `POST /api/club/switch`, `DELETE /api/club/members/:id`. **Décision** : `/api/workspaces*` renvoie `410 WORKSPACES_REPLACED` (message « rechargez l'application ») ; pas de compatibilité `join {code}` : le code partagé contournait le responsable, le stage est terminé et ses 7 membres sont repris automatiquement. |
| Fiche à l'en-tête de la structure (A322-72) | En-tête = club courant (`DivePdf::clubProfile`, `user.club_*` dans `/api/auth/me`). |
| Purge des caches locaux à chaque bascule, bascule refusée si l'outbox n'est pas vide | `bindLocalDataToClub` (purge de l'ancien club) ; l'outbox n'a plus besoin d'être vide : chaque écriture porte le club de sa mise en file (`X-DP-Club`). Au premier rattachement d'un appareil de l'ancienne version, seules les lignes non envoyées sont gardées. |
| `logout()` purge les caches | Déjà couvert : `purgeLocalData` (données liées au compte, `meta.owner`). |
| `window.React` réexposé pour `lib/net.js` | Sans objet : plus de script hors bundle, `useOnline` est un module. |
| Super-admin : section « Structures » | Sans objet (les clubs se créent et se gèrent par leurs responsables). |
| `WorkspaceScopeTest` | Remplacé par `LegacyWorkspacesTest` et les tests club (`ClubTest`, `ClubDbTest`…). |

### 7a1b291 — fix(sync) : cache API du SW, synchro terrain

| Intention | Statut |
|---|---|
| SW sans cache `/api/*` | Déjà couvert (`public/sw.js` network-only pour `/api/*`, anciens caches `-api` purgés). |
| Listes réconciliées (lignes en attente visibles, supprimées ailleurs purgées, tri serveur) | Porté : `listWithFallback` (`src/offline/offline-api.js`) + suppressions en file masquées. |
| `recoverInflight()` au démarrage, `nextWakeMs` sans réveil à vide | Porté (`src/offline/outbox.js`, `sync.start()`). |
| Coalescing de l'auto-save | Déjà couvert (`outbox.coalesce`, jamais entre clubs). |
| Pull périodique 60 s si l'onglet est visible | Porté (`PULL_INTERVAL_MS`, `src/offline/sync.js`). |
| Pull des fiches par fusion | Déjà couvert. |
| `_pending` conservé si un PATCH attend encore | Porté (handler `dive.update`). |
| `cursorTs` (table vide ≠ an 2000) | Déjà couvert (`ts()`). |
| Tests (+23) | Portés : `tests/sync-terrain.test.js`. |

### 04ca14e — popup PA/PE/E, sauvegarde compte 500, CSP bouton secours

| Intention | Statut |
|---|---|
| Popup « Commencer » hors écran | Déjà couvert (Dialog : corps défilant, pied fixe, Échap) ; test e2e à 400 × 650. |
| `PATCH /api/auth/account` en 500 (`Validate::str` défaut non nullable) | Correctif fusionné tel quel + test `ValidateTest::testStrAcceptsANullDefault` ; notre route ne passait déjà plus de `null`. |
| `onclick` inline bloqué par la CSP | Déjà couvert (`public/inline-boot.js`, `addEventListener`). |

### 1b1198c — fix(pdf) : mPDF, fiche en crash, archivage sans Drive (BEPPA)

| Intention | Statut |
|---|---|
| `useEffect` non importé (étape 4 en page blanche) | Déjà couvert (corrigé dans `c08ab44`, `ErrorBoundary`). |
| mPDF introuvable (pas d'autoload) → `PdfAutoload.php` + `psr-log-shim/` | **Supprimés**. `index.php` et `cli-bootstrap.php` chargent `vendor/autoload.php` s'il est présent ; sous PHP 8.5 avec `composer install --no-dev` (verrou résolu pour 8.5.11), le `platform_check` passe. Le contournement visait PHP 7.4 ; la copie figée de psr/log v1 entrerait en conflit avec psr/log v3 de `vendor/`. |
| `mixed` dans `checklist.php` | Sans objet (PHP ≥ 8.2). |
| `sec_surface` non défini | Porté (`!empty`, test de rendu du template). |
| Archivage PDF seul pour BEPPA (slug codé en dur), `drive_synced` forcé | **Généralisé** : l'archivage ne dépend jamais de Drive (le serveur archive les PDF, A322-72) ; copie Drive facultative, préférence de l'appareil (`src/api/drive-preference.js`) ; désactivée, ni demande Google ni « copie à faire ». `drive_synced` n'a plus à être forcé (affichage conditionné par la préférence). |

### 4833a2a — code couleur palanquées / popup, formation en jaune

| Intention | Statut |
|---|---|
| Formation ≠ rouge | App : déjà le cas (cartes neutres, rouge réservé au bloquant : `.pal.is-blocked`). PDF : formation jaune clair `#fefce8`, **baptême violet clair `#f5f3ff`** (au lieu du rose : rouge réservé au bloquant), type écrit sous P1, P2… (lisible en noir et blanc). |
| Popup PA/PE/GP aux couleurs des palanquées | Sans objet : les palanquées n'ont plus de teinte par type dans le nouveau design (type affiché en texte), la popup reste neutre. |

### 19d36ad — saisie rapide des paramètres de sortie + paliers de déco

Porté : `StepperField` (− / +, appui long, flèches) dans la modale de
sortie ; paliers 9 / 6 / 3 m et palier de confort dans
`render_state.realises[palId]` ; affichés sur le cadran, la fiche
imprimable et le PDF serveur (colonne DTR réalisée) ; résumé identique
front / PHP (`tests/fixtures/paliers.json`).

### f031a58 / 3d14988 — grille 3 colonnes, annuaire compact, tablette portrait

Porté autrement : requêtes de conteneur — annuaire à côté des palanquées
dès 600 px de contenu (tablette portrait), trois colonnes avec la synthèse
sur portable ; cartes compactées selon leur largeur.

### 4aa3807 — crash PDF sur champ numérique (`distance_cote`)

Déjà couvert : `PdfRender::h()` accepte tout scalaire (`PdfRenderTest`) ;
le test de rendu de `fiche.php` passe un `distance_cote` entier.

## PHP 8.5

`composer.json` : `php >= 8.2`, `config.platform.php = 8.5.11`
(`doctrine/instantiator` dev épinglé `~2.0.0` pour rester installable en
8.2) ; CI 8.2 et 8.5 ; pool `[dp-fede]` de php8.5-fpm à côté du pool
« dive » (jamais modifié, plus de réglage global) ; APCu partagé entre
pools → clés préfixées et cache JWKS signé. Voir [deploy/php85.md](deploy/php85.md).

## Vérifications

- `npm run lint` (0 erreur), `npm test` (391), `npm run build`,
  `npm run test:e2e:local` (42), `composer test` (407, PHP 8.5.11).
- Migration 003 → 011 rejouée sur **MariaDB 13.0** jetable
  (`deploy/recette-migration-clubs.php`) : volumes de production,
  `updated_at` et runtime state intacts, plan (`LegacyWorkspaces`) = SQL,
  reprise après coupure à chacune des 22 instructions de données de 007,
  idempotence, cas limites (structure archivée, sans owner, conflit
  `client_uuid` avec une plongée personnelle ou entre deux structures).
  `workspaces-plan.php --save` sort en erreur sur un cas bloquant (compte-
  structure sans structure) avant toute migration. `bin/migrate.php` testé aussi sur base neuve (préparations
  natives : `SHOW TABLES LIKE ?` remplacé, il échouait sous MariaDB).

## Risques pour la bascule de production

1. **Migration non additive** (007) : l'ancien code ne voit plus les lignes
   du stage après la reprise → écritures en maintenance (503) pendant la
   bascule ; `deploy-backend.sh` vérifie le plan avant de basculer le code.
2. **MariaDB du Pi** (10.x / 11.x) : la recette a tourné sur 13.0 ; la
   syntaxe utilisée (`IF NOT EXISTS`, UPDATE multi-tables avec auto-jointure,
   `DROP INDEX IF EXISTS`) existe depuis 10.3. Rejouer la recette sur un
   MariaDB de même version, ou une restauration de la base de production
   (`deploy/restore.md` §3) avant la bascule, lève le doute.
3. **Écritures hors ligne de l'ancienne version** : rattachées au club
   courant du membre (structure si sa dernière session y était, sinon club
   personnel). Une écriture du stage sur un appareil dont le membre a pour
   club courant son club personnel y partirait → vider les tiroirs de
   synchronisation des tablettes avant la bascule.
4. **Ancien front en cache** quelques minutes : `/api/workspaces*` → 410 ;
   déployer le frontend juste après le backend.
5. **Auteurs inconnus** : les lignes du stage sans `created_by` (ou dont
   l'auteur a été supprimé) ont `user_id = NULL` (« auteur inconnu »).
6. **APCu partagé** avec l'application dive : rate-limit et cache SHOM
   lisibles / modifiables par l'autre pool (sans enjeu de sécurité) ; les
   clés Google sont signées.

## Reste manuel

- Sur le Pi : extensions php8.5-*, pool, Composer, bascule nginx,
  maintenance des écritures, déploiements (php85.md §1 → §8), cron en
  php8.5, `/var/lib/dp-fede` (créé par le script s'il manque).
- Désigner un responsable si `workspaces-plan.php` signale un club sans
  responsable (aucun en production).
- Recette fonctionnelle après bascule (connexion, club BEPPA ↔ personnel,
  plongée du stage, PDF, archivage, copie Drive).
- Plus tard : migration de nettoyage (`workspaces*`, `sessions.workspace_id`,
  `created_by`, compte-structure) après la conservation des fiches du stage.
