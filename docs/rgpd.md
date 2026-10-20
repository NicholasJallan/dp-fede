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
| Annuaire des plongeurs, sites, plongées saisis par un DP | La structure (club, SCA…) pour laquelle le DP organise la plongée | Sous-traitant (hébergement, outil) |

Chaque compte ne voit que ses propres données (`user_id` contrôlé sur toutes
les requêtes) ; aucun partage entre comptes.

## Traitements

### 1. Comptes utilisateurs

- **Finalité** : authentification (Google), personnalisation des fiches (club,
  président, numéro d'urgence).
- **Données** : e-mail, nom, prénom, photo (URL Google), identifiant Google
  (`google_sub`), rôle, club (nom, numéro, SIRET, type), président (nom, prénom,
  téléphone), dates de création, de dernière connexion et de dernière activité.
- **Base légale** : exécution du service demandé par l'utilisateur (art. 6.1.b).
- **Durée** : tant que le compte est utilisé. Suppression immédiate à la demande
  (`DELETE /api/account`). Purge des comptes inactifs : optionnelle, à partir de
  2 ans sans activité (`users.last_seen_at`), hors administrateurs et hors
  comptes ayant une plongée de moins d'un an.

### 2. Annuaire des plongeurs (saisi par le DP)

- **Finalité** : constituer les palanquées et contrôler les prérogatives
  (Code du sport, art. A322-71 et suivants).
- **Données** : nom, prénom, n° de licence, niveaux plongeur/encadrant,
  qualifications (nitrox, trimix, recycleur, RIFAP, TIV, diplôme pro),
  aptitudes, date de naissance (facultative : âge minimal en autonomie,
  A322-73 / A322-89), notes libres.
- **Donnée relative à la santé** : **uniquement la date du certificat médical**
  (CACI). Ni le contenu, ni les contre-indications, ni le médecin ne sont
  collectés. Les notes libres ne doivent pas contenir d'information médicale
  (à rappeler dans l'interface).
- **Base légale** : obligation légale de la structure (Code du sport, art.
  6.1.c) et intérêt légitime pour l'organisation de la plongée (6.1.f).
- **Durée** : tant que le plongeur figure dans l'annuaire du DP. Une
  suppression est d'abord logique (propagation aux appareils hors-ligne), puis
  **définitive après 180 jours** (`bin/purge.php`, paramétrable).

### 3. Plongées et fiches de sécurité

- **Finalité** : établir, exécuter et archiver la fiche de sécurité et la
  check-list (Code du sport, art. A322-72).
- **Données** : site, date, DP, composition des palanquées (identité, aptitudes,
  mélanges), paramètres prévus et réalisés (profondeur, durée, paliers,
  pressions, heures), observations, plan de secours, état de la check-list.
- **Base légale** : obligation légale (6.1.c).
- **Durée** : **1 an minimum** après la plongée (A322-72 : conservation de la
  fiche de sécurité par l'établissement). Au-delà : purge optionnelle des
  plongées archivées de plus de N années (N ≥ 1). Recommandation : N = 5 si la
  structure veut couvrir la prescription civile de droit commun (5 ans) en cas
  d'accident ; à décider par le responsable de traitement.
- Les PDF archivés sur le **Google Drive de l'utilisateur** (scope
  `drive.file`) sont hors de ce serveur : leur conservation relève de
  l'utilisateur ; la suppression du compte ne les efface pas.

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
| Accès, portabilité | `GET /api/account/export` : JSON complet (compte, plongeurs, sites, plongées + état d'exécution, sessions sans leur identifiant). `?download=1` pour un fichier. Limité à 10 exports / heure. |
| Rectification | Écrans Compte, Plongeurs, Sites. |
| Effacement | `DELETE /api/account` avec le corps `{ "confirm": "SUPPRIMER" }` : suppression immédiate et définitive (transaction) du compte, des plongeurs, sites, plongées et sessions. Le dernier administrateur ne peut pas se supprimer (promouvoir d'abord un autre administrateur). |
| Plongeurs (personnes saisies par un DP) | Demande adressée à la structure / au DP, qui supprime la fiche du plongeur ; effacement définitif sous 180 jours (purge) ou immédiat via suppression du compte. |

Les données hors-ligne de l'application (IndexedDB / localStorage de
l'appareil) doivent être effacées par le client lors de la déconnexion et de la
suppression du compte.

## Purges automatiques (`backend/bin/purge.php`, cron quotidien)

| Purge | Par défaut | Paramètre (config `retention` / option CLI) |
|-------|-----------|----------------------------------------------|
| Sessions expirées, compteurs anti-abus | Toujours | — |
| Plongeurs, sites, plongées supprimés (soft-delete) | 180 jours | `soft_deleted_days` / `--soft-deleted-days=N` (0 = jamais) |
| Plongées archivées anciennes | **Désactivée** | `archived_dives_years` / `--archived-dives-years=N` (N ≥ 1) |
| Comptes inactifs | **Désactivée** | `inactive_accounts_years` / `--inactive-accounts-years=N` (N ≥ 2) |

Toujours tester un changement avec `--dry-run` :

```bash
sudo -u www-data php8.2 /var/www/dp-fede-api/bin/purge.php --dry-run --archived-dives-years=5
```

## Mesures de sécurité (résumé)

HTTPS + HSTS, CSP stricte, cookie de session HttpOnly/Secure/SameSite=Lax,
CSRF double-submit, e-mail Google vérifié exigé, requêtes SQL préparées,
contrôle d'appartenance systématique (`user_id`), limitation de débit,
configuration et secrets hors du dépôt et hors web root, pool PHP isolé
(`open_basedir`, fonctions d'exécution désactivées), sauvegardes vérifiées,
procédure de restauration documentée et exercée (deploy/restore.md). Détails : [security/README.md](security/README.md).

## Révision

Revoir ce registre à chaque nouveau champ collecté, nouveau service tiers ou
changement de durée de conservation.
