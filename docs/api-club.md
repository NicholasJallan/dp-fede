# API « club » — contrat pour l'intégration frontend (phase 5)

Socle club **léger** : DP Assistant reste l'outil du DP (règles + hors-ligne).
Adhésions, inscriptions et cotisations restent dans VPDive ; la liste des
plongeurs en est importée (cf. [import-plongeurs.md](import-plongeurs.md)).

## Conventions communes

- Enveloppe inchangée : succès `{ "ok": true, "data": … }`, erreur
  `{ "ok": false, "error": "message en français", "code": "CODE_STABLE" }` —
  `code` est présent quand le client doit distinguer le cas sans dépendre du
  libellé (tous les `409`, cf. [Codes d'erreur stables](#codes-derreur-stables)).
- Toute écriture (`POST`, `PATCH`, `PUT`, `DELETE`) exige la session (cookie
  `dp_session`) **et** l'en-tête `X-CSRF-Token` (double-submit), et passe par
  la limite de 120 écritures/min/IP (`/api/dives`, `/api/divers`, `/api/sites`,
  `/api/account`, `/api/club`, `/api/pdf`).
- Erreurs génériques : `401` non authentifié · `403` CSRF invalide ou rôle
  insuffisant (`"Action non autorisée pour votre rôle dans le club"`) ·
  `404` ressource absente **ou appartenant à un autre club** (y compris un
  `id` client déjà utilisé ailleurs : pas d'oracle d'existence) · `409`
  conflit (toujours avec `code`) · `422` validation · `429` limite de débit.
- Dates : `AAAA-MM-JJ` pour les dates, `AAAA-MM-JJTHH:MM:SS` (heure du
  serveur) pour les horodatages.

## Club courant

Toutes les données métier (plongeurs, sites, plongées) appartiennent à un
**club** ; `user_id` n'indique plus que l'**auteur** d'une ligne (`null` si son
compte a été supprimé). Chaque requête authentifiée est résolue dans un club :

1. en-tête **`X-DP-Club: <club_id>`** s'il est présent (l'utilisateur doit en
   être membre, sinon `403 CLUB_NOT_MEMBER` ; en-tête mal formé : `400`). Le
   front l'envoie sur **toutes** les requêtes métier (`src/api/api.js`) et sur
   chaque écriture rejouée par l'outbox avec le club de sa mise en file : une
   écriture saisie pour le club A reste dans le club A même si l'utilisateur
   change de club avant la synchronisation. Exceptions : `/api/auth/*` et
   `GET /api/sync/state`, qui servent à **découvrir** le club courant ;
2. sinon le club courant `users.current_club_id` ;
3. sinon le plus ancien club de l'utilisateur (devient le club courant) ;
4. sinon un **club personnel** est créé (l'utilisateur en est responsable),
   à partir des anciens champs `users.club_*`. Un nouveau compte a donc
   toujours un club dès sa première requête.

**Changement de club** (switch, acceptation d'invitation, retrait) : le front
doit vider son cache local (plongeurs, sites, plongées) et ses curseurs
`?since=`, puis resynchroniser. `GET /api/sync/state` renvoie `club_id` pour
détecter le changement ; les listes `?since=` qui suivent sont lues avec
`X-DP-Club` de ce club.

**Club quitté ou retiré** (`403 CLUB_NOT_MEMBER` sur n'importe quelle
requête) : le front retire de l'outbox les actions « à revoir » de ce club
(elles ne pourront jamais être envoyées), oublie le club courant, relit
`GET /api/club` **sans** en-tête (le serveur choisit le club suivant), purge
les données locales de l'ancien club et affiche un bandeau proposant
« Supprimer les données de cet appareil ».

**Outbox sans club** : une écriture mise en file alors qu'aucun club n'est
connu sur l'appareil n'est **jamais** envoyée sans en-tête (elle irait au club
courant du serveur, peut-être un autre) : elle est créée « à revoir », puis
rattachée au club courant quand celui-ci est confirmé par le serveur
(connexion, bouton Réessayer).

## Rôles et permissions

| Action | responsable | dp | encadrant | lecture |
|---|:-:|:-:|:-:|:-:|
| Lire le club, ses membres (`club.read`, `members.read`) | ✔ | ✔ | ✔ | ✔ |
| Modifier / supprimer le club, gérer membres et invitations (`club.manage`) | ✔ | | | |
| Lire annuaire, sites, plongées (`divers.read`, `sites.read`, `dives.read`) | ✔ | ✔ | ✔ | ✔ |
| Écrire annuaire, sites, plongées (`divers.write`, `sites.write`, `dives.write`) | ✔ | ✔ | | |
| Importer l'annuaire (`divers.import`) | ✔ | ✔ | | |
| Télécharger / générer à la volée les PDF (`documents.read`) | ✔ | ✔ | ✔ | ✔ |
| Régénérer les PDF archivés (`documents.generate`) | ✔ | ✔ | | |
| Alertes CACI / licence / autorisations (`alerts.read`) | ✔ | ✔ | ✔ | |
| Statistiques (`stats.read`) | ✔ | ✔ | ✔ | ✔ |

Un club garde **toujours au moins un responsable**. Un `dp` peut modifier
toutes les plongées du club (pas seulement les siennes). Le super-administrateur
(`/api/users/*`) est inchangé et n'a pas d'accès implicite aux clubs.
La matrice est testée (`backend/tests-php/ClubTest.php`) ; `GET /api/club`
renvoie les permissions calculées pour l'utilisateur.

## Compatibilité avec le front actuel

| Endpoint | Changement |
|---|---|
| `GET /api/auth/me`, `POST /api/auth/google` | Mêmes champs qu'avant. `club_nom`, `club_numero`, `club_siret`, `structure_type`, `president_prenom`, `president_nom`, `president_tel`, `urgence_defaut` reflètent désormais le **club courant**. Ajouts : `club_id`, `club_role`, `club_count`. |
| `PATCH /api/auth/account` | `nom`, `prenom` : profil de l'utilisateur. Les anciens champs club modifient le **club courant** : réservé au responsable ; pour un autre rôle, des valeurs inchangées sont ignorées, une modification renvoie `403`. |
| `GET/POST/PUT/DELETE /api/divers`, `/api/sites`, `/api/dives` | Filtrage par club au lieu de l'utilisateur, permissions par rôle. `?since=`, soft-delete (`deleted_at`, `deleted`) inchangés. POST idempotents : voir ci-dessous. |
| `POST /api/divers`, `POST /api/sites` (`id` UUID client) | UPSERT **atomique limité au club** (`IF(club_id = VALUES(club_id), …)` sur chaque colonne, puis relecture `id` + club) : rejeu dans le même club → `201` (fiche mise à jour, réactivée si supprimée). `id` d'un **autre club** → ligne intacte et **`404`** (« Plongeur introuvable » / « Site introuvable », comme un id inexistant : plus de `409` « Identifiant déjà utilisé »). |
| `POST /api/dives` (`client_uuid`) | Recherche par **(club, client_uuid)** (index unique, migration 011) : plongée active du club courant → `200 { id, duplicate: true }` ; `client_uuid` porté par une plongée d'un **autre club** ou **supprimée** → `409 CLIENT_UUID_CONFLICT` (jamais confondu avec un rejeu). |
| `GET /api/sync/state` | Curseurs du club courant + `club_id`, `club_role`. |
| `POST /api/pdf/fiche` | Plongée cherchée dans le club courant ; en-tête de fiche = informations du club. |
| `GET /api/account/export` | Format `dp-assistant-export/2` (voir [rgpd.md](rgpd.md)). |
| `DELETE /api/account` | `409 LAST_RESPONSABLE` si l'utilisateur est le seul responsable d'un club comptant d'autres membres (`409 LAST_ADMIN` : seul administrateur). Les clubs dont il est l'unique membre sont supprimés avec conservation légale (cf. `DELETE /api/club`). Réponse : `{ "deleted": true, "retained": { "fiches": 3, "until": "2027-07-14", "clubs": 1 }, "message": "…" }`. |

### Plongeurs : nouveaux champs

Renvoyés par `GET /api/divers` (et `GET /api/divers/:id`) :

| Champ | Type | Écriture |
|---|---|---|
| `source` | `"manuel"` \| `"vpdive"` \| `"csv"` \| … | import uniquement |
| `external_id` | chaîne ≤ 64 ou `null` | import uniquement |
| `licence_fin` | `AAAA-MM-JJ` ou `null` | POST/PUT (si la clé est présente) |
| `representant_legal` | texte ≤ 200 ou `null` | POST/PUT (si la clé est présente) |
| `autorisation_parentale_saison` | `"2026-2027"` ou `null` | POST/PUT (si la clé est présente), format `AAAA-AAAA` sinon `422` |

Une clé **absente** du corps POST/PUT ne modifie pas la valeur stockée (un
client ancien n'efface donc pas une donnée importée) ; `null` ou `""` l'efface.

### Plongées : nouveaux champs

- `GET /api/dives` : `user_id`, `auteur_prenom`, `auteur_nom`, `documents_status`.
- `GET /api/dives/:id` : `club_id`, `documents_status`, `documents_updated_at`,
  `documents` (`[{ type, sha256, bytes, created_at }]`), `participants_at`.
- `PATCH /api/dives/:id` : la réponse contient `documents_status`.
- `POST /api/dives` : la réponse contient `documents_status` (`"pending"` si
  la plongée est créée directement en `archived`, sinon `null`).
- `:id` = id serveur ou `client_uuid` ; un id serveur prime sur un
  `client_uuid` identique (`ORDER BY (id = ?) DESC LIMIT 1`).
- **`closed_at` est posé par le serveur** (`NOW()`) au passage en `archived`
  (PATCH ou POST directement archivé) ; la valeur envoyée par le client est
  ignorée. C'est la date de référence de la conservation légale.

### Plongée archivée : fiche figée (A322-72)

| Requête sur une plongée `archived` | Réponse |
|---|---|
| `PATCH { drive_link }` | `200` (seul champ modifiable) |
| `PATCH { render_state }` **différent** de l'état stocké | `422 ARCHIVED_IMMUTABLE` |
| `PATCH { status: "archived", render_state }` **identique** (rejeu de l'archivage par l'outbox) | `200`, rien n'est écrit |
| `PATCH { answers, palanquees, … }` | ignorés (comportement historique) |
| `PATCH { status: "prepared" \| "in_progress" }` | `422 ARCHIVED_IMMUTABLE` |
| `DELETE` | `422 ARCHIVED_IMMUTABLE` |

L'écriture de `render_state` est conditionnée dans la même instruction SQL
(`… WHERE status <> 'archived'`) : un auto-save concurrent d'un archivage ne
peut pas modifier la fiche. Côté front, l'auto-save (différé **et** flush) ne
pousse plus rien dès que la plongée est figée (`plongeeFigee`).

---

## Endpoints club

### `GET /api/club` — club courant

Permission `club.read`.

```json
{
  "club": {
    "id": "0b9d2c8e-…", "nom": "Bulles en Valais", "numero_ffessm": "06123456",
    "siret": "", "structure_type": "club", "president_prenom": "Anne",
    "president_nom": "Martin", "president_tel": "0600000000", "urgence_defaut": "112",
    "created_at": "2026-10-20T09:00:00", "updated_at": "2026-10-20T09:00:00"
  },
  "role": "responsable",
  "permissions": { "club.read": true, "club.manage": true, "divers.write": true, "…": true },
  "counts": { "members": 3, "divers": 84, "sites": 12, "dives": 40, "dives_archived": 31 },
  "clubs_count": 1
}
```

### `PATCH /api/club` — informations du club

Permission `club.manage`. Corps : n'importe quel sous-ensemble de
`nom` (≤ 200), `numero_ffessm` (≤ 50), `siret` (≤ 50),
`structure_type` (`club` \| `sca` \| `csa` \| `autre`, autre valeur → `null`),
`president_prenom` (≤ 100), `president_nom` (≤ 100), `president_tel` (≤ 30),
`urgence_defaut` (≤ 20). Réponse : comme `GET /api/club`.
Erreurs : `422` (longueur, aucun champ).

### `DELETE /api/club` — supprimer le club

Permission `club.manage`. Corps `{ "confirm": "SUPPRIMER" }` (sinon `422`).

**Conservation légale (A322-72, exception au droit à l'effacement — RGPD
art. 17.3.b)** :

- les plongées **archivées** dont la date de référence (la plus tardive de
  `closed_at` et `created_at`, deux dates **serveur** ; `date_plongee`, saisie
  par le client, n'intervient pas) a moins de **365 jours**, leurs PDF
  archivés, participants et état d'exécution, ainsi que les plongeurs et sites
  qu'elles référencent, sont **conservés** : le club est marqué supprimé
  (`clubs.deleted_at`, `retention_until`), n'a plus aucun membre et ces données
  ne sont plus accessibles par l'API ;
- les plongeurs conservés sont **minimisés** : seuls restent les champs
  utiles à la fiche (nom, prénom, licence, niveaux, aptitudes,
  qualifications) ; date de naissance, CACI, fin de licence, représentant
  légal, autorisation parentale, notes et identifiant externe sont effacés
  (ainsi que les notes des sites conservés) ;
- **tout le reste est supprimé immédiatement** (plongées non archivées ou plus
  anciennes, autres plongeurs et sites, invitations, adhésions, PDF non
  conservés) ;
- `bin/purge.php` supprime définitivement le club et les données conservées
  (lignes et fichiers) le lendemain de `retention_until` ;
- sans fiche à conserver, le club est supprimé immédiatement.

Réponse :

```json
{
  "deleted": true,
  "club_id": "0b9d…",
  "retained": { "fiches": 3, "until": "2027-07-14" },
  "message": "3 fiches de sécurité archivées conservées jusqu'au 14/07/2027 (obligation légale de conservation d'un an, art. A322-72 du Code du sport), puis supprimées automatiquement. Les autres données ont été supprimées."
}
```

`retained.fiches` = nombre de plongées archivées conservées (`0` et
`until: null` s'il n'y en a aucune) ; `message` est prêt à afficher. Proposer
au responsable de télécharger les PDF avant la suppression.

### `GET /api/club/memberships` — mes clubs

Authentifié.

```json
{
  "current_club_id": "0b9d…",
  "clubs": [
    { "club_id": "0b9d…", "nom": "Bulles en Valais", "numero_ffessm": "06123456",
      "role": "responsable", "joined_at": "2026-10-20T09:00:00", "members_count": 3, "current": true }
  ]
}
```

### `POST /api/club/switch` — changer de club courant

Corps `{ "club_id": "uuid" }`. `422` si mal formé, `403` si non membre.
Réponse : comme `GET /api/club` pour le nouveau club. Vider ensuite le cache
local (cf. « Club courant »).

### `GET /api/club/members`

Permission `members.read`.

```json
{
  "members": [
    { "user_id": 3, "role": "responsable", "nom": "Martin", "prenom": "Anne",
      "email": "anne@example.com", "avatar_url": "…", "joined_at": "2026-10-20T09:00:00",
      "last_seen_at": "2026-10-20T09:00:00", "is_me": true }
  ],
  "invitations": [ /* invitations en attente, responsable uniquement, cf. ci-dessous */ ]
}
```

`email` et `last_seen_at` ne sont renseignés que pour le responsable (et
`email` pour soi-même) ; `null` sinon.

### `PATCH /api/club/members/:userId` — changer un rôle

Permission `club.manage`. Corps `{ "role": "responsable" | "dp" | "encadrant" | "lecture" }`.
Réponse `{ "user_id": 7, "role": "dp" }`.
Erreurs : `422` rôle invalide · `404 MEMBER_NOT_FOUND` non membre ·
`409 LAST_RESPONSABLE` dernier responsable. Contrôle et écriture dans une
transaction, adhésions du club verrouillées (`SELECT … FOR UPDATE`) : deux
rétrogradations simultanées ne peuvent pas laisser le club sans responsable.

### `DELETE /api/club/members/:userId` — retirer un membre / quitter

Permission `club.manage`, ou `:userId` = soi-même (quitter le club). Les
données saisies par le membre restent au club. Réponse
`{ "user_id": 7, "removed": true }`.
Erreurs : `404 MEMBER_NOT_FOUND` non membre · `409 LAST_RESPONSABLE`
dernier responsable (pour soi-même : « confiez ce rôle à un autre membre ou
supprimez le club »). Même verrouillage que le changement de rôle.

### Invitations

Lien à **usage unique**, valable **7 jours**. Pas d'envoi d'e-mail : le
responsable copie le lien et le transmet. Le jeton est dans le **fragment**
(`#invitation=…`) : il n'est ni envoyé au serveur par le navigateur ni
journalisé ; seul son SHA-256 est stocké. L'invité se connecte avec Google
puis le front appelle `accept` ; **l'e-mail du compte Google doit être celui
de l'invitation** (insensible à la casse).

Objet invitation :

```json
{ "id": "uuid", "email": "dp@example.com", "role": "dp", "status": "pending",
  "expires_at": "2026-10-27T10:00:00", "created_at": "2026-10-20T10:00:00",
  "accepted_at": null, "invited_by": 3 }
```

`status` : `pending` · `accepted` · `revoked` · `expired`.

#### `GET /api/club/invitations`

Permission `club.manage`. Invitations en attente (non expirées).

#### `POST /api/club/invitations`

Permission `club.manage`. Corps `{ "email": "dp@example.com", "role": "dp" }`
(`role` par défaut `dp`). Une invitation en attente pour le même e-mail est
annulée et remplacée. Réponse `201` : objet invitation **+**
`token` (64 caractères hexadécimaux) **+**
`url` (`https://dp-fede.bullesenvalais.ch/#invitation=<token>`).
**Seule occurrence du jeton** : l'afficher avec un bouton « copier ».
Erreurs : `422` e-mail / rôle invalide · `409 ALREADY_MEMBER` déjà membre ·
`429` plus de 50 invitations en attente.

#### `DELETE /api/club/invitations/:id`

Permission `club.manage`. Réponse `{ "id": "…", "revoked": true }` ;
`404` si introuvable ou déjà utilisée.

#### `POST /api/club/invitations/preview`

Authentifié (aucun rôle requis). Corps `{ "token": "…" }`. Réponse :

```json
{ "club_id": "…", "club_nom": "Bulles en Valais", "role": "dp", "email": "dp@example.com",
  "status": "pending", "expires_at": "2026-10-27T10:00:00",
  "email_matches": true, "already_member": false }
```

`404` si jeton inconnu. Limite : 20 appels (preview + accept) / 15 min / compte.

#### `POST /api/club/invitations/accept`

Authentifié. Corps `{ "token": "…" }`. Effets : adhésion avec le rôle de
l'invitation (un membre existant **garde** son rôle), le club devient le club
courant, et le club personnel **vide** créé automatiquement à la première
connexion est supprimé. Réponse : comme `GET /api/club` +
`removed_empty_clubs: ["uuid", …]`.
Erreurs : `404` jeton inconnu · `403` autre e-mail · `410` déjà utilisée,
annulée ou expirée.

Parcours conseillé : ouvrir le lien → si non connecté, connexion Google en
conservant le fragment → `preview` → confirmation (« Rejoindre Bulles en Valais
en tant que DP ? », avertir si `email_matches` est faux) → `accept` → vider le
cache local et resynchroniser.

### `GET /api/club/alerts?days=30`

Permission `alerts.read`. `days` entre 1 et 120 (défaut 30, sinon `422`).

```json
{
  "season": "2026-2027",
  "days": 30,
  "counts": { "caci_expire": 2, "licence_expire_bientot": 1, "autorisation_parentale_manquante": 1 },
  "items": [
    { "diver_id": "…", "nom": "Dupont", "prenom": "Jean", "type": "caci_expire",
      "severity": "error", "date": "2026-10-01", "days": -19 },
    { "diver_id": "…", "nom": "Petit", "prenom": "Léa", "type": "autorisation_parentale_manquante",
      "severity": "error", "date": null, "days": null, "season": "2026-2027", "age": 14 }
  ]
}
```

| `type` | `severity` | Règle |
|---|---|---|
| `caci_expire` | error | CACI émis il y a un an ou plus (fin de validité ≤ aujourd'hui) |
| `caci_expire_bientot` | warn | fin de validité dans les `days` jours |
| `caci_absent` | warn | date de CACI non renseignée |
| `licence_expiree` | error | `licence_fin` < aujourd'hui |
| `licence_expire_bientot` | warn | `licence_fin` dans les `days` jours |
| `autorisation_parentale_manquante` | error | moins de 18 ans et `autorisation_parentale_saison` ≠ saison courante |

`date` = date d'échéance ; `days` = jours restants (négatif si dépassé).
Tri : erreurs puis avertissements, par échéance.

**Hypothèses à valider** : CACI valable 1 an à compter de sa date (comme le
contrôle des palanquées côté front) ; saison FFESSM du **15/09 au 14/09** ;
mineur = moins de 18 ans à la date du jour ; sans date de naissance, pas
d'alerte « mineur ».

### `GET /api/club/stats?from=AAAA-MM-JJ&to=AAAA-MM-JJ[&format=csv]`

Permission `stats.read`. Sans `from`/`to` : saison FFESSM courante. Période
≤ 5 ans ; erreurs `422`. Plongées **archivées** (non supprimées) dont la date
est dans la période. Limite : **30 appels / 10 min / compte** (`429`).
Les participants des plongées archivées avant la phase 5 sont calculés **une
seule fois** (`dives.participants_at`, posé même à zéro participant).

```json
{
  "from": "2026-09-15", "to": "2027-09-14",
  "plongees": 31,
  "palanquees": 88,
  "palanquees_par_type": { "exploration": 40, "guidee": 21, "formation": 22, "bapteme": 5 },
  "plongees_par_type":   { "exploration": 25, "guidee": 15, "formation": 14, "bapteme": 4 },
  "plongeurs_distincts": 57,
  "baptemes": 9,
  "participations": 260,
  "heures_cumulees": 198.5,
  "par_plongeur": [
    { "diver_id": "…", "nom": "Dupont", "prenom": "Jean", "licence": "A-123",
      "plongees": 12, "dp": 3, "heures": 9.5 }
  ]
}
```

- `plongees_par_type` : plongées comportant au moins une palanquée du type.
- `heures_cumulees` / `heures` : somme des durées réalisées par participant
  (« heures-plongeur »), en heures décimales ; durée = `realises[pal].duree`,
  à défaut écart heure de début / heure de fin.
- `dp` : plongées dirigées. `plongeurs_distincts` exclut les baptêmes (hors
  annuaire) et les DP qui n'ont pas plongé.

`format=csv` : fichier `statistiques-<from>-<to>.csv` (UTF-8 avec BOM,
séparateur `;`, décimales à virgule), bloc d'indicateurs puis tableau par
plongeur ; cellules neutralisées contre l'injection de formules.

---

## Import de l'annuaire

### `POST /api/divers/import[?dry_run=1]`

Permission `divers.import`. Limite : 30 imports / heure / compte.
Format et règles : [import-plongeurs.md](import-plongeurs.md).

Corps (au choix) :

- `multipart/form-data` : champ `file` (CSV ≤ 1 Mo), champs optionnels
  `dry_run`, `profile` (`auto` \| `vpdive`), `source` ;
- JSON `{ "csv": "<contenu du fichier>", "dry_run": true, "profile": "vpdive", "source": "vpdive" }` ;
- JSON `{ "rows": [ { "nom": "Dupont", "prenom": "Jean", … } ], … }` (clés
  reconnues avec les mêmes alias que les en-têtes CSV).

`source` par défaut : `vpdive` avec le profil `vpdive`, sinon `csv`
(`manuel` est réservé). Parcours conseillé : appel `dry_run=1` → afficher le
rapport → confirmation → même appel sans `dry_run`.

Réponse (identique en simulation et en application) :

```json
{
  "profile": "auto", "source": "csv", "format": "csv", "encoding": "UTF-8 (BOM)", "separator": ";",
  "columns": { "recognized": { "Nom": "nom", "N° licence": "licence", "CACI": "caci" }, "ignored": ["Email"] },
  "dry_run": true,
  "total": 120, "created": 15, "updated": 30, "unchanged": 72,
  "errors":   [ { "line": 14, "message": "Date invalide pour caci : « 31/02/2026 »" } ],
  "warnings": [ { "line": 22, "message": "Qualification trimix : PN-C ajouté (prérequis)" } ],
  "items": [
    { "line": 2, "action": "update", "diver_id": "…", "nom": "Dupont", "prenom": "Jean",
      "changes": ["medical", "external_id", "source"] }
  ]
}
```

`line` = numéro de ligne dans le fichier (1 = en-tête) ou rang dans `rows`
(à partir de 1). Les lignes en erreur sont ignorées ; les autres sont
appliquées dans **une transaction**. Erreurs globales : `422` (fichier vide,
colonne `nom` absente, profil / source invalides, corps non reconnu) ·
`413` (> 1 Mo ou > 2000 lignes).

---

## Archivage serveur des fiches (A322-72)

Au passage d'une plongée en `archived` (`PATCH` ou `POST` directement
archivé) :

0. `closed_at` = heure du serveur ;
1. `dive_participants` est rempli (statistiques), `participants_at` posé ;
2. `documents_status` passe à `pending` ; fiche et check-list PDF sont
   générées **après l'envoi de la réponse** (l'archivage n'attend pas mPDF) ;
3. succès → fichiers hors web root, empreinte SHA-256 en base,
   `documents_status = "ok"` ; échec → journalisé, `documents_status = "error"`.

L'archivage de la plongée n'échoue jamais à cause des PDF ; le front affiche
l'état et propose la régénération **uniquement** si `error` ou si un document
manque. Un document **intègre** (fichier présent, SHA-256 conforme) n'est
jamais remplacé, y compris par `bin/documents.php` ; le remplacement d'un
document altéré est journalisé (`dive.document_replaced`, ancienne et
nouvelle empreintes). Une plongée restée `pending`
plus de 15 min est reprise par la tâche `bin/documents.php --retry`.
L'export Google Drive existant est inchangé (complémentaire).

### `GET /api/dives/:id/documents`

Permission `documents.read`. `:id` = id ou `client_uuid`.

```json
{ "dive_id": "…", "status": "ok", "updated_at": "2026-10-20T10:01:12",
  "documents": [ { "type": "checklist", "sha256": "…", "bytes": 48211, "created_at": "2026-10-20T10:01:12" },
                 { "type": "fiche", "sha256": "…", "bytes": 61002, "created_at": "2026-10-20T10:01:11" } ] }
```

`status` : `null` (non archivée, ou archivée avant la phase 5 et pas encore
rattrapée) · `pending` · `ok` · `error`.

### `GET /api/dives/:id/documents/:type`

`type` = `fiche` \| `checklist`. Permission `documents.read`. Réponse
`application/pdf` en pièce jointe (`<date>-<type>-<site>.pdf`). L'empreinte
SHA-256 est vérifiée à chaque téléchargement.
Erreurs : `404` plongée ou document absent (message avec le statut) ·
`500` fichier manquant ou altéré (journalisé ; régénérer).

### `POST /api/dives/:id/documents`

Permission `documents.generate`. Autorisé **seulement** si
`documents_status = "error"` ou si un document est manquant / altéré
(fichier absent, empreinte invalide) ; régénère alors, **de façon
synchrone** (quelques secondes sur le Raspberry Pi), les seuls documents non
intègres et recalcule les participants. Chaque régénération est journalisée
(`dive.documents_regenerated` : statut et empreintes SHA-256 précédents).
Réponse `{ "dive_id": "…", "status": "ok", "documents": [ … ] }`.
Erreurs : `409 DIVE_NOT_ARCHIVED` plongée non archivée ·
`409 DOCUMENTS_COMPLETE` documents complets et intègres ·
`409 DOCUMENTS_PENDING` génération en cours (moins de 15 min) ·
`500` échec (journalisé).

---

## Codes d'erreur stables

Champ `code` de la réponse d'erreur. Le client teste le code, jamais le
libellé.

| HTTP | `code` | Cas |
|---|---|---|
| 403 | `CSRF_INVALID` | jeton CSRF absent ou invalide (transitoire : nouvel essai) |
| 403 | `ORIGIN_FORBIDDEN` | origine de la requête refusée (transitoire) |
| 403 | `CLUB_ROLE_FORBIDDEN` | rôle insuffisant dans le club |
| 403 | `CLUB_NOT_MEMBER` | `X-DP-Club` désigne un club dont l'utilisateur n'est pas (plus) membre → resynchroniser le club courant |
| 404 | `MEMBER_NOT_FOUND` | membre du club introuvable |
| 409 | `CLIENT_UUID_CONFLICT` | `client_uuid` d'une plongée d'un autre club ou supprimée |
| 409 | `EMPTY_OVERWRITE_REFUSED` | PATCH qui viderait une plongée existante (answers et palanquees vides) |
| 409 | `LAST_RESPONSABLE` | le club doit garder un responsable (rôle, retrait, suppression de compte) |
| 409 | `LAST_ADMIN` | seul administrateur de l'application |
| 409 | `ALREADY_MEMBER` | invitation d'une personne déjà membre |
| 409 | `DIVE_NOT_ARCHIVED` | documents demandés pour une plongée non archivée |
| 409 | `DOCUMENTS_COMPLETE` | régénération refusée : documents complets et intègres |
| 409 | `DOCUMENTS_PENDING` | régénération refusée : génération en cours |
| 422 | `ARCHIVED_IMMUTABLE` | modification d'une plongée archivée (render_state, statut, suppression) |
| 410 | `WORKSPACES_REPLACED` | ancienne route `/api/workspaces*` (structures de la production, remplacées par les clubs ; rejoindre un club = invitation du responsable) |

**Outbox hors-ligne** (`src/offline/sync.js`) : un `409` n'est compté comme
succès (rejeu idempotent) que si la réponse porte `duplicate: true` ou le code
d'idempotence réservé `ALREADY_APPLIED` ; tout autre `409` met l'action
« à revoir » avec le message du serveur. `404`, `422` et `403` (hors CSRF /
origine) : « à revoir » également ; `403 CLUB_NOT_MEMBER` déclenche en plus la
resynchronisation du club courant.
