# RGPD — registre simplifié des traitements

Registre de travail de DP Assistant (`dp-fede.bullesenvalais.ch`), au sens de
l'article 30 du RGPD. Hébergement en Suisse (Valais) : la nLPD suisse
s'applique aussi ; pour des structures FFESSM françaises, le RGPD s'applique
aux données de leurs plongeurs. Ce document décrit l'implémentation technique ;
il ne remplace pas une revue juridique.

## Rôles

| Données | Responsable de traitement | Rôle de l'exploitant de DP Assistant |
|---------|---------------------------|--------------------------------------|
| Comptes utilisateurs (DP) | Exploitant de DP Assistant | Responsable |
| Club (informations de la structure), annuaire des plongeurs, sites, plongées, fiches archivées | La structure (club, SCA…) pour laquelle les DP organisent les plongées | Sous-traitant (hébergement, outil) |

Depuis la phase 5, les données appartiennent à un **club** : chaque requête
est limitée au club courant de l'utilisateur (`club_id` contrôlé sur toutes
les requêtes) et à ce que son **rôle** autorise (responsable, dp, encadrant,
lecture — matrice dans [api-club.md](api-club.md#rôles-et-permissions)).
Aucun partage entre clubs. `user_id` n'indique plus que l'auteur d'une ligne.
Le responsable du club gère les membres et les invitations : c'est lui qui
représente le responsable de traitement dans l'outil.

La gestion des adhésions, inscriptions et cotisations reste dans le logiciel
de gestion du club (VPDive) ; DP Assistant n'en reçoit que l'annuaire utile
aux palanquées, par import de fichier (pas de connexion entre les deux
logiciels).

## Traitements

### 1. Comptes utilisateurs

- **Finalité** : authentification (Google), personnalisation des fiches (club,
  président, numéro d'urgence).
- **Données** : e-mail, nom, prénom, photo (URL Google), identifiant Google
  (`google_sub`), rôle applicatif, dates de création, de dernière connexion et
  de dernière activité ; adhésions aux clubs (`club_members` : club, rôle,
  date) et club courant. Les anciennes colonnes `users.club_*` (nom, numéro,
  SIRET, type, président) ont été reprises dans `clubs` (migration 007) et ne
  sont plus modifiées.
- **Base légale** : exécution du service demandé par l'utilisateur (art. 6.1.b).
- **Durée** : tant que le compte est utilisé. Suppression immédiate à la demande
  (`DELETE /api/account`). Purge des comptes inactifs : optionnelle, à partir de
  2 ans sans activité (`users.last_seen_at`), hors administrateurs et hors
  comptes ayant une plongée de moins d'un an.

### 1 bis. Clubs et invitations

- **Finalité** : organiser l'accès partagé des DP et encadrants d'une même
  structure ; en-tête des fiches de sécurité.
- **Données du club** (`clubs`) : nom, numéro FFESSM, SIRET, type de
  structure, président (nom, prénom, téléphone), numéro d'urgence par défaut.
- **Invitations** (`club_invitations`) : e-mail de l'invité, rôle proposé,
  auteur, dates (création, expiration à 7 jours, acceptation, annulation),
  empreinte SHA-256 du jeton (le jeton lui-même n'est jamais stocké ni
  journalisé). Pas d'envoi d'e-mail par le serveur.
- **Base légale** : intérêt légitime de la structure (6.1.f).
- **Durée** : club : jusqu'à sa suppression par le responsable
  (`DELETE /api/club`) ou la suppression du compte de son dernier membre, sous
  réserve de la conservation légale des fiches (voir « Suppression d'un club »
  ci-dessous). Invitations : purgées **30 jours** après leur
  utilisation, annulation ou expiration (`bin/purge.php`).

### 2. Annuaire des plongeurs (saisi par les DP du club ou importé)

- **Finalité** : constituer les palanquées et contrôler les prérogatives
  (Code du sport, art. A322-71 et suivants).
- **Données** : nom, prénom, n° de licence, niveaux plongeur/encadrant,
  qualifications (nitrox, trimix, recycleur, RIFAP, TIV, diplôme pro),
  aptitudes, date de naissance (facultative : âge minimal en autonomie,
  A322-73 / A322-89), date de fin de licence, provenance de la fiche
  (`source` : saisie manuelle, import CSV, VPDive) et identifiant dans le
  logiciel source (`external_id`), notes libres.
- **Mineurs** : représentant légal (texte libre, 200 caractères) et saison
  couverte par l'autorisation parentale (`2026-2027`) — alerte si absente pour
  la saison FFESSM courante (15/09 → 14/09, hypothèse à confirmer).
- **Import** (`POST /api/divers/import`) : le fichier n'est pas conservé ; seules
  les fiches créées / mises à jour le sont, avec l'auteur de l'import.
- **Donnée relative à la santé** : **uniquement la date du certificat médical**
  (CACI), y compris à l'import. Ni le contenu, ni les contre-indications, ni le
  médecin ne sont collectés. Les alertes (CACI expiré / expirant sous 30 jours)
  sont calculées à la volée et ne sont pas stockées ; elles ne sont pas
  visibles du rôle « lecture ». Les notes libres ne doivent pas contenir d'information médicale
  (à rappeler dans l'interface).
- **Base légale** : obligation légale de la structure (Code du sport, art.
  6.1.c) et intérêt légitime pour l'organisation de la plongée (6.1.f).
- **Durée** : tant que le plongeur figure dans l'annuaire du club. Une
  suppression est d'abord logique (propagation aux appareils hors-ligne), puis
  **définitive après 180 jours** (`bin/purge.php`, paramétrable).

### 3. Plongées et fiches de sécurité

- **Finalité** : établir, exécuter et archiver la fiche de sécurité et la
  check-list (Code du sport, art. A322-72).
- **Données** : site, date, DP, composition des palanquées (identité, aptitudes,
  mélanges), paramètres prévus et réalisés (profondeur, durée, paliers,
  pressions, heures), observations, plan de secours, état de la check-list.
- **Fiches archivées sur le serveur** (phase 5) : à l'archivage d'une plongée,
  la fiche de sécurité et la check-list PDF sont générées et stockées hors web
  root (`/var/lib/dp-fede/documents/<club>/<année>/`, `www-data`, mode 640),
  référencées dans `dive_documents` avec leur empreinte SHA-256 (vérifiée à
  chaque téléchargement). Téléchargeables par les membres du club uniquement.
- **Participants** (`dive_participants`) : pour chaque plongée archivée,
  plongeur (identifiant), palanquée, rôle, aptitude, profondeurs prévue et
  réalisée, durée — base des statistiques du club (assemblée générale).
- **Base légale** : obligation légale (6.1.c).
- **Intégrité** : une plongée archivée est figée — son état d'exécution
  (`render_state`) n'est plus modifiable (`422 ARCHIVED_IMMUTABLE`), seul le
  lien Google Drive peut être ajouté ; un PDF archivé intègre n'est jamais
  remplacé, et toute régénération (après échec ou document manquant /
  altéré) est journalisée avec l'empreinte SHA-256 précédente.
- **Durée** : **1 an minimum** après l'archivage (A322-72 : conservation de la
  fiche de sécurité par l'établissement). La date de référence est
  **calculée par le serveur** : la plus tardive de `closed_at` (heure du
  serveur au passage en `archived`, la valeur envoyée par le client est
  ignorée) et `created_at`. La date de plongée saisie par le client
  n'intervient pas : un client ne peut pas raccourcir la conservation. Au-delà : purge optionnelle des
  plongées archivées de plus de N années (N ≥ 1). Recommandation : N = 5 si la
  structure veut couvrir la prescription civile de droit commun (5 ans) en cas
  d'accident ; à décider par le responsable de traitement. La purge supprime
  aussi les participants, les lignes `dive_documents` **et les fichiers PDF**.
  Les PDF ne figurent pas dans la sauvegarde MariaDB : les inclure dans la
  sauvegarde distante (cf. [deploy/club-socle.md](deploy/club-socle.md)).
- Les PDF archivés sur le **Google Drive de l'utilisateur** (scope
  `drive.file`) sont hors de ce serveur : leur conservation relève de
  l'utilisateur ; la suppression du compte ne les efface pas.

### 3 bis. Suppression d'un club et conservation légale (A322-72)

La conservation d'un an de la fiche de sécurité est une **obligation légale
de l'établissement** : exception au droit à l'effacement (RGPD art. 17.3.b).
À la suppression d'un club (directe, ou par la suppression du compte de son
unique membre) :

| Données | Sort |
|---|---|
| Plongées archivées de moins de 365 jours (référence serveur : la plus tardive de `closed_at` / `created_at`), leurs PDF, participants et état d'exécution | **Conservées** jusqu'à `clubs.retention_until` (fin de conservation la plus tardive) |
| Plongeurs référencés par ces plongées (palanquées, DP, sécurité surface) | **Conservés, minimisés** : nom, prénom, licence, niveaux, aptitudes et qualifications (ce qu'affiche la fiche) ; date de naissance, date du CACI, fin de licence, représentant légal, autorisation parentale, notes et identifiant externe **effacés** (art. 5.1.c) |
| Sites référencés par ces plongées | **Conservés**, notes libres effacées |
| Informations du club (nom, président : en-tête des fiches) | **Conservées** avec elles |
| Tout le reste (autres plongées, plongeurs, sites, invitations, adhésions, PDF non conservés) | Supprimé immédiatement |

Le club est marqué supprimé (`clubs.deleted_at`) et n'a plus aucun membre :
les données conservées ne sont accessibles par aucun écran ni aucun appel
d'API ; seul l'exploitant peut y accéder en base (réquisition, accident). Elles
sont supprimées définitivement (lignes et fichiers PDF) par `bin/purge.php` le
lendemain de `retention_until`. Elles sont exclues de la purge des
soft-deletes à 180 jours. L'API indique à l'utilisateur combien de fiches
sont conservées et jusqu'à quelle date.

### 4. Sites de plongée

Nom, milieu, coordonnées GPS, accès secours, caisson de référence, notes. Pas
de donnée personnelle sauf saisie libre dans les notes. Même règle de
suppression que l'annuaire (soft-delete puis purge à 180 jours).

### 5. Sécurité et exploitation

| Données | Finalité | Durée |
|---------|----------|-------|
| Sessions (`sessions` : IP, user-agent, expiration) | Authentification | 7 jours glissants ; purge quotidienne des sessions expirées |
| Compteurs anti-abus (`rate_limits` : IP ou id) | Limitation de débit | ≤ 2 heures |
| Journal d'actions `/var/log/dp-fede.log` (id utilisateur, IP, chemin, identifiants d'objets — jamais le contenu des plongées) | Sécurité, traçabilité | 12 semaines (logrotate) |
| Rapports CSP, erreurs PHP | Sécurité | 12 semaines |
| Sauvegardes MariaDB | Continuité | `RETENTION_DAYS` (14 jours par défaut) en local ; durée du stockage distant à aligner |

**Base légale** : intérêt légitime (sécurité du service, 6.1.f).

Conséquence à connaître : une donnée effacée subsiste dans les sauvegardes
jusqu'à leur expiration (14 jours en local + rétention distante). Une
restauration doit donc être suivie de la ré-application des demandes
d'effacement reçues depuis la date de la sauvegarde.

## Destinataires et services tiers

| Service | Données transmises | Remarque |
|---------|--------------------|----------|
| Google Identity Services | Connexion (jeton d'identité) | Transfert hors UE/Suisse (Data Privacy Framework) |
| Google Drive (`drive.file`) | PDF des fiches, à l'initiative de l'utilisateur | Compte Google de l'utilisateur |
| Google Maps / Places | Recherche de sites, carte | Pas de donnée de plongeur |
| SHOM (proxy serveur) | Coordonnées du site + date | Pas de donnée personnelle |
| Open-Meteo | Coordonnées du site | Appel direct du navigateur |

Aucune donnée n'est vendue ni utilisée à des fins publicitaires ; pas de
traceur tiers d'audience.

## Exercice des droits

| Droit | Mise en œuvre |
|-------|---------------|
| Accès, portabilité | `GET /api/account/export` (format `dp-assistant-export/2`) : compte, clubs (adhésion, rôle, informations du club), invitations envoyées (sans empreinte du jeton), plongeurs / sites / plongées **dont l'utilisateur est l'auteur** (+ état d'exécution et métadonnées des PDF archivés), sessions sans leur identifiant. `?download=1` pour un fichier. Limité à 10 exports / heure. Les données du club saisies par d'autres membres relèvent du club. |
| Rectification | Écrans Compte, Plongeurs, Sites. |
| Effacement | `DELETE /api/account` avec le corps `{ "confirm": "SUPPRIMER" }`, en une transaction : suppression **immédiate** du compte (`users` : e-mail, nom, identifiant Google…), de ses adhésions, sessions et invitations en attente ; les **clubs dont il est l'unique membre** sont supprimés avec conservation légale (§ 3 bis : seules les fiches de moins d'un an et les données qu'elles référencent restent, sans lien avec le compte supprimé). La réponse indique le nombre de fiches conservées et la date de fin de conservation. Ses contributions aux clubs **partagés** y restent, sans auteur (`user_id` remis à NULL). Refusée pour le dernier administrateur, et pour le **seul responsable d'un club partagé** (confier le rôle à un autre membre ou supprimer le club d'abord). |
| Plongeurs (personnes saisies dans l'annuaire d'un club) | Demande adressée à la structure, qui supprime la fiche du plongeur ; effacement définitif sous 180 jours (purge) ou via la suppression du club (immédiat, sauf s'il figure sur une fiche en conservation légale : § 3 bis). Les fiches de sécurité archivées où il figure suivent la durée de conservation des plongées (A322-72). Si le plongeur est de nouveau importé depuis VPDive, sa fiche est réactivée : le supprimer aussi dans VPDive. |

Les données hors-ligne de l'application (IndexedDB / localStorage de
l'appareil) sont effacées par le client lors de la déconnexion et de la
suppression du compte. Quand elles sont volontairement conservées (session
expirée : reconnexion « en gardant mes saisies » ; changement de compte
Google depuis une invitation) ou qu'un club a été quitté / retiré (`403
CLUB_NOT_MEMBER`), l'application propose **« Supprimer les données de cet
appareil »** (bandeau, invitation, écran de connexion) : plongées, annuaire,
sites, actions en attente, caches et instantané de session sont effacés. Les
actions « à revoir » destinées à un club quitté sont retirées automatiquement
(elles ne peuvent plus être envoyées).

## Purges automatiques (`backend/bin/purge.php`, cron quotidien)

| Purge | Par défaut | Paramètre (config `retention` / option CLI) |
|-------|-----------|----------------------------------------------|
| Sessions expirées, compteurs anti-abus | Toujours | — |
| Clubs supprimés dont la conservation légale est échue (fiches, PDF, plongeurs et sites conservés) | Toujours | — |
| Invitations utilisées, annulées ou expirées depuis plus de 30 jours | Toujours | — |
| Plongeurs, sites, plongées supprimés (soft-delete) | 180 jours | `soft_deleted_days` / `--soft-deleted-days=N` (0 = jamais) |
| Plongées archivées anciennes (+ participants, PDF archivés) — âge calculé sur les dates serveur (`closed_at`, `created_at`) | **Désactivée** | `archived_dives_years` / `--archived-dives-years=N` (N ≥ 1) |
| Comptes inactifs (hors seul responsable d'un club partagé) | **Désactivée** | `inactive_accounts_years` / `--inactive-accounts-years=N` (N ≥ 2) |

Toujours tester un changement avec `--dry-run` :

```bash
sudo -u www-data php8.2 /var/www/dp-fede-api/bin/purge.php --dry-run --archived-dives-years=5
```

## Mesures de sécurité (résumé)

HTTPS + HSTS, CSP stricte, cookie de session HttpOnly/Secure/SameSite=Lax,
CSRF double-submit, e-mail Google vérifié exigé, requêtes SQL préparées,
contrôle d'appartenance au club (`club_id`) et du rôle sur chaque requête,
invitations à usage unique (jeton haché, 7 jours, e-mail vérifié à
l'acceptation), PDF archivés hors web root avec empreinte SHA-256, limitation de débit,
configuration et secrets hors du dépôt et hors web root, pool PHP isolé
(`open_basedir`, fonctions d'exécution désactivées), sauvegardes vérifiées,
procédure de restauration documentée et exercée (deploy/restore.md). Détails : [security/README.md](security/README.md).

## Révision

Revoir ce registre à chaque nouveau champ collecté, nouveau service tiers ou
changement de durée de conservation.
