# Import de l'annuaire des plongeurs (CSV / VPDive)

Endpoint : `POST /api/divers/import` (cf. [api-club.md](api-club.md#import-de-lannuaire)).
Toujours lancer d'abord une **simulation** (`dry_run=1`) : elle renvoie le
rapport complet (créations, mises à jour, inchangés, erreurs par ligne) sans
rien écrire.

## Fichier

- CSV, 1 Mo et 2000 lignes au maximum, **première ligne = en-têtes**.
- Encodage : UTF-8, avec ou sans BOM. Un fichier qui n'est pas de l'UTF-8
  valide est lu comme Windows-1252 (export Excel français) ; le rapport indique
  l'encodage retenu.
- Séparateur détecté automatiquement sur la ligne d'en-tête : `;`, `,` ou
  tabulation (à égalité ou en l'absence de séparateur : `;`).
- Champs entre guillemets autorisés (`"Dupont; Jr"`, guillemets doublés
  `""`, retours à la ligne dans un champ). Lignes vides ignorées.
- Colonnes inconnues ignorées (listées dans `columns.ignored`). Si deux
  colonnes désignent le même champ, la première l'emporte.

## Colonnes reconnues

Les en-têtes sont comparés sans casse, sans accents ni ponctuation
(« N° de licence » → `n_de_licence`).

| Champ                  | En-têtes acceptés                                                         | Valeur                                                                   |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **nom** (obligatoire)  | Nom, Nom de famille, last_name                                            | ≤ 100 caractères                                                         |
| prénom                 | Prénom, Prénoms, first_name                                               | ≤ 100                                                                    |
| licence                | Licence, N° licence, N° de licence, Numéro de licence, Licence FFESSM     | ≤ 50 ; normalisée en majuscules sans espaces                             |
| date de naissance      | Date de naissance, Naissance, Né(e) le, DDN                               | date (voir formats)                                                      |
| niveau                 | Niveau, Niveau plongeur, Brevet, Niveau technique                         | voir « Niveaux »                                                         |
| niveau encadrant       | Niveau encadrant, Encadrant, Niveau d'encadrement, Monitorat              | voir « Niveaux »                                                         |
| nitrox                 | Nitrox, Qualification nitrox                                              | voir « Qualifications »                                                  |
| trimix                 | Trimix, Qualification trimix                                              | voir « Qualifications »                                                  |
| CACI                   | CACI, Date CACI, Certificat médical, Date certificat médical, CM, Médical | date d'émission du certificat — **seule donnée de santé**                |
| fin de licence         | Fin de licence, Date fin licence, Validité licence, Expiration licence    | date                                                                     |
| identifiant externe    | Identifiant externe, Id externe, external_id, Identifiant                 | ≤ 64 caractères                                                          |
| source                 | Source                                                                    | `[a-z0-9_-]`, ≤ 20 ; sinon la source de l'import                         |
| représentant légal     | Représentant légal, Responsable légal                                     | ≤ 200 (mineurs)                                                          |
| autorisation parentale | Autorisation parentale, Autorisation parentale saison                     | `2026-2027`, `2026/27`, `26-27` ; `oui` = saison courante ; `non` = rien |

**Cellule vide = pas de modification** : l'import ne vide jamais un champ
existant. Pour effacer une valeur, passer par l'écran plongeur.

Formats de date : `AAAA-MM-JJ` (avec ou sans heure), `JJ/MM/AAAA`,
`JJ-MM-AAAA`, `JJ.MM.AAAA`, `JJ/MM/AA`, `AAAA/MM/JJ`, numéro de série Excel.
Année sur deux chiffres : `20AA` (date de naissance : `19AA` si AA est
supérieur à l'année en cours). Date de naissance ou CACI dans le futur : erreur.

## Niveaux

Une cellule peut contenir plusieurs niveaux séparés par `/ , ; + |` ou « et »
(« N4 / Initiateur ») ; le plus élevé de chaque catégorie est retenu. Les
colonnes « niveau » et « niveau encadrant » sont combinées.

| Saisie (exemples)                              | niveau_plongeur                | niveau_encadrant |
| ---------------------------------------------- | ------------------------------ | ---------------- |
| N1, P1, Niveau 1, Plongeur N1, 1               | N1                             | —                |
| N2 / P2 / Niveau 2 … · N3 …                    | N2 · N3                        | —                |
| N4, P4, GP, Guide de palanquée                 | N3                             | N4               |
| N5, DP, Directeur de plongée                   | N3                             | N5               |
| E1 … E4                                        | N3 (E1 : N2, ou N3 si indiqué) | E1 … E4          |
| Initiateur / Initiatrice **sans** GP           | N2 (N3 si indiqué)             | E1               |
| Initiateur **avec** N4/GP (même ligne)         | N3                             | E2               |
| MF1, Moniteur fédéral 1er degré, BEES1, DEJEPS | N3                             | E3               |
| MF2, Moniteur fédéral 2e degré, BEES2, DESJEPS | N3                             | E4               |
| Débutant, Aucun, Baptême, vide, N/A            | —                              | —                |

- Le niveau plongeur d'un encadrant suit la règle du formulaire (E1 : N2 par
  défaut, N3 si le fichier l'indique ; autres encadrants : N3).
- Un seul niveau encadrant est stocké : en cas de cumul, ordre retenu
  E4 > E3 > N5 > E2 > N4 > E1 (ex. « N5 + Initiateur » → N5, avec un
  avertissement).
- Aptitude au lieu d'un brevet (« PA40 », « PE20 ») : ignorée, avertissement.
- Toute autre valeur : **erreur**, la ligne est ignorée.

## Qualifications

| Colonne | Saisie                                 | Résultat                            |
| ------- | -------------------------------------- | ----------------------------------- |
| nitrox  | PN, Nitrox, Plongeur nitrox, oui, x, 1 | `PN`                                |
| nitrox  | PN-C, Nitrox confirmé, Moniteur nitrox | `PN` + `PN-C`                       |
| nitrox  | non, 0, vide                           | aucune                              |
| trimix  | PTH-40, PTH40, Trimix 40               | `PTH-40`                            |
| trimix  | PTH-70 · PTH-120                       | `PTH-40` + `PTH-70` (· + `PTH-120`) |
| trimix  | non, 0, vide                           | aucune                              |

« Trimix » sans profondeur ou « oui » : erreur (préciser PTH-40/70/120). Une
qualification trimix ajoute `PN-C` (prérequis), avec un avertissement.

## Rapprochement (idempotence)

Pour chaque ligne, dans cet ordre :

1. **(source, identifiant externe)** — y compris une fiche supprimée, qui est
   alors réactivée ;
2. **n° de licence** (normalisé) parmi les fiches actives ; si la fiche porte
   déjà un autre identifiant externe de la même source : erreur ;
3. **nom + prénom** (sans casse ni accents) parmi les fiches actives, si une
   seule fiche correspond et que la ligne n'a ni identifiant ni licence, ou si
   les deux dates de naissance sont connues et égales.

Sans correspondance : création (auteur = utilisateur qui importe). Deux
lignes du fichier qui visent le même identifiant, la même licence ou la même
fiche : la seconde est en erreur. Réimporter le même fichier ne modifie rien
(`unchanged`).

Une fiche saisie à la main puis retrouvée par sa licence reçoit la source et
l'identifiant externe de l'import : les imports suivants la retrouvent
directement.

Les champs ajoutés ou modifiés pour chaque ligne figurent dans
`items[].changes` du rapport.

## Profil « VPDive » — HYPOTHÈSE À VALIDER

VPDive ne publie pas le format de ses exports. Le profil `vpdive`
(`profile=vpdive`) ajoute des alias **supposés** et utilise la source
`vpdive` par défaut :

| Champ               | En-têtes supposés (profil vpdive)                                                |
| ------------------- | -------------------------------------------------------------------------------- |
| identifiant externe | Id, Id adhérent, Code adhérent, N° adhérent, Numéro adhérent, Référence adhérent |
| niveau              | Niveau fédé, Niveau fédéral, Niveau FFESSM, Brevet FFESSM                        |
| niveau encadrant    | Niveau moniteur, Qualification moniteur, Niveau enseignement                     |
| CACI                | Date certif médical, Date certificat méd, Certif médical, Date visite médicale   |
| fin de licence      | Date validité licence, Licence valable jusqu'au, Fin validité licence            |

À faire avec un **vrai export VPDive** : vérifier les intitulés de colonnes,
l'encodage et le séparateur, le format des dates et des niveaux, et
l'identifiant stable d'un adhérent (indispensable à l'idempotence). Adapter
ensuite `VPDIVE_ALIASES` dans `backend/lib/DiverImport.php` et les tests
`backend/tests-php/DiverImportTest.php`.

## Exemple

```csv
Nom;Prénom;N° licence;Date de naissance;Niveau;Niveau encadrant;Nitrox;CACI;Fin de licence;Identifiant externe
Dupont;Jean;A-123456;12/03/1985;N3;MF1;PN-C;2026-02-01;14/09/2027;1042
Petit;Léa;A-654321;05/06/2012;N1;;;15/09/2026;14/09/2027;1043
```
