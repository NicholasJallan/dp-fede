# Règles métier — DP Assistant

Règles réglementaires appliquées par l'outil, telles qu'elles sont codées.

**Source** : Code du sport, articles A322-71 à A322-101 et annexes III-14 a à III-18 c. Vérification faite sur le texte consolidé du **08/10/2026** (arrêtés des 17/10/2025 et 24/11/2025 inclus).

**Date de référence** : `REGLEMENTATION` (`src/domain/reglementation.js`), affichée sur la fiche et l'écran compte.

> **Outil d'aide à la décision.** Il ne remplace pas la responsabilité du directeur de plongée (A322-72).

## Où vivent les règles

| Élément                                                                    | Fichier                         |
| -------------------------------------------------------------------------- | ------------------------------- |
| Tableaux des annexes (données pures)                                       | `src/domain/cds-tables.js`      |
| Moteur de validation (`validatePal`)                                       | `src/domain/pal-rules.js`       |
| Aptitudes d'un plongeur, profondeurs, type de palanquée                    | `src/domain/aptitudes.js`       |
| Portage serveur (comportement identique)                                   | `backend/lib/Rules.php`         |
| **Cas réglementaires partagés JS + PHP** (95 cas, chacun avec son article) | `tests/fixtures/pal-rules.json` |

Toute modification de règle :

1. commence par un cas dans la fixture ;
2. doit passer `npm test` **et** `composer test`.

Chaque issue de validation porte :

- un `code` stable ;
- une référence `ref` au texte ;
- les `ids` des plongeurs concernés, mis en évidence dans l'interface.

---

## 1. Contexte d'une palanquée

### Mode : enseignement ou exploration (A322-75)

- L'exploration se définit comme la plongée « en dehors de toute action d'enseignement ».
- Le DP choisit le mode **par palanquée** dès qu'un enseignant y figure.
- Un **baptême relève toujours de l'enseignement** (III-16 a).
- Si le mode n'est pas précisé et qu'un enseignant est présent, la palanquée est traitée en enseignement, avec l'avertissement `MODE_IMPLICIT`.

### Milieu (A322-98)

- **Milieu naturel** : mer, lac, carrière.
- **Piscine ou fosse de plus de 6 m** : règles du milieu naturel.
- **Piscine ou fosse de 6 m au plus** : régime dérogatoire (§6).
- **Profondeur du bassin inconnue** :
  - une fosse est présumée de plus de 6 m ;
  - une piscine est présumée de 6 m au plus si la plongée l'est.

### Gaz

- Mélanges déclarés par palanquée : `Air`, `Nx ≤ 40%`, `Nx > 40%`, `Tx`.
- Le pourcentage d'O₂ du nitrox (`pal.o2`) sert au contrôle de la PpO₂.

---

## 2. Limites absolues (A322-73, A322-76, A322-92)

| Règle                                                                                                    | Code           |
| -------------------------------------------------------------------------------------------------------- | -------------- |
| Air et nitrox : 60 m maximum. Si de l'air figure avec du trimix, il limite aussi la palanquée (A322-73). | `AIR_60`       |
| Trimix encadré : 80 m maximum. Trimix autonome : 120 m maximum.                                          | `TX_DEPTH`     |
| Nitrox : PpO₂ ≤ 1,6 bar, soit une profondeur maximale d'utilisation de `⌊(1,6 / FO₂ − 1) × 10⌋` m.       | `PPO2_MAX`     |
| Nitrox : % d'O₂ non saisi → avertissement.                                                               | `O2_UNKNOWN`   |
| Au trimix, le nitrox déclaré est un gaz de décompression : pas de contrôle de PpO₂ au fond.              | —              |
| Une palanquée compte au moins deux plongeurs.                                                            | `PAL_SOLO`     |
| Profondeur maximale prévue non renseignée : bloquant (l'espace d'évolution ne peut pas être contrôlé).   | `PROF_MISSING` |
| Oxygène pur : recycleur ou décompression seulement, jamais gaz fond en circuit ouvert (A322-90).         | `O2_PUR_FOND`  |
| La profondeur est limitée par l'aptitude la plus restrictive. Le **panachage d'aptitudes est autorisé**. | `APT_DEPTH`    |

---

## 3. Aptitudes des plongeurs (III-14 a/b, A322-77)

| Brevet                  | Aptitudes                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| Débutant (aucun brevet) | Baptême, PE-12, PE-20 — uniquement en formation, ou en exploration de 0 à 6 m |
| N1                      | PE-20 (+ PA-12 / PA-20 si acquises)                                           |
| N2                      | PE-40, PA-20 (+ PA-40 si acquise)                                             |
| N3                      | PE-60, PA-60                                                                  |
| E1 (initiateur)         | aptitudes de son niveau plongeur : N2 par défaut, N3 si saisi                 |
| N4 / GP, E2 → E4        | aptitudes N3 + rôle d'encadrement                                             |

- **E-2 = initiateur ET guide de palanquée** (III-15 b) : rôle GP de droit. C'est vrai pour le GIP FFESSM. Les équivalents CMAS et FSGT de la ligne E-2 ne sont pas distingués (application orientée FFESSM).
- **Bonus de formation, uniquement en enseignement à l'air** (III-16 a, « en cours de formation vers… ») :
  - un N1 peut viser PE-40 avec un E3 ou un E4 ;
  - un N2 peut viser PE-60 avec un E4 ;
  - même chose pour PA-40 et PA-60, s'il détient déjà PA-20 ou PA-40.
- **Pas de bonus au nitrox ni au trimix** : l'élève y justifie déjà l'aptitude PE de l'espace (III-17 b, III-18 b).
- Une aptitude choisie qui n'est pas justifiée par les brevets est bloquante : `APT_NOT_JUSTIFIED` (A322-77).
- La **compétence d'encadrement est celle de la personne** (brevet détenu), pas seulement du rôle choisi (III-16 b « E3 ou GP ou P4 »).

---

## 4. Air en milieu naturel

### Enseignement (III-16 a)

| Espace | Élèves                             | Encadrant minimal | Effectif (encadrant non compris) |
| ------ | ---------------------------------- | ----------------- | -------------------------------- |
| 0-6 m  | baptême                            | E1                | **1** (*)                        |
| 0-6 m  | débutants                          | E1                | 4 (*)                            |
| 0-12 m | débutants → PE-12 / PA-12          | E2                | 4 (*)                            |
| 0-20 m | débutants ou PE-12 → PE-20 / PA-20 | E2                | 4 (*)                            |
| 0-40 m | PE-20 ou PA-20 → PE-40 / PA-40     | E3                | 4 (*)                            |
| 0-60 m | PE-40 ou PA-40 → PE-60 / PA-60     | E4                | 4                                |

**(\*) Plongeur supplémentaire** : un plongeur de plus, au minimum GP ou P4, est admis.

- Un second encadrant E2, E3 ou E4 compte comme ce plongeur supplémentaire.
- Un GP ou P4 inscrit avec une aptitude PE aussi.
- Au-delà : `EXTRA_TOO_MANY`. Dans un espace sans (\*) : `EXTRA_NOT_ALLOWED`.

Codes : `ENS_NO_ENSEIGNANT`, `ENS_LEVEL`, `EFFECTIF_BAPTEME`, `EFFECTIF_ENCADRES`, `EXTRA_NOT_GP`.

### Exploration encadrée (III-16 b)

| Espace | Encadrés  | Encadrant minimal | Effectif |
| ------ | --------- | ----------------- | -------- |
| 0-6 m  | débutants | E1, GP ou P4      | 4 (*)    |
| 0-12 m | PE-12     | E2, GP ou P4      | 4 (*)    |
| 0-20 m | PE-20     | E2, GP ou P4      | 4 (*)    |
| 0-40 m | PE-40     | E3, GP ou P4      | 4 (*)    |
| 0-60 m | PE-60     | **E4**            | 4        |

Codes :

- `EXPLO_COMPETENCE` ;
- `DEBUTANT_EXPLO` (débutants au-delà de 6 m ou au nitrox) ;
- `EFFECTIF_ENCADRES`.

### Autonomie (III-16 b, A322-73, A322-89)

- 3 plongeurs maximum (`AUTO_EFFECTIF`).
- Aptitudes PA uniquement :
  - un plongeur PE sans encadrant est bloquant (`AUTO_PE`) ;
  - un baptême ou un débutant sans encadrant est bloquant (`AUTO_ENCADREMENT`).
- Âge minimal :

  | Autonomie    | Âge minimal        |
  | ------------ | ------------------ |
  | PA-12, PA-20 | 16 ans             |
  | PA-40        | 17 ans             |
  | PA-60        | 18 ans             |
  | Trimix       | majeurs uniquement |

  Âge insuffisant → `AGE_AUTONOMIE`. Date de naissance absente → avertissement `AGE_UNKNOWN`.

---

## 5. Mélanges

### Nitrox (A322-95, III-17 a/b/c)

- **Exploration et autonomie** : chaque plongeur justifie PN (`NX_PN`).
- **Enseignement** :

  | Espace         | Élèves                                                              | PN exigé |
  | -------------- | ------------------------------------------------------------------- | -------- |
  | 0-6 m          | débutants admis                                                     | non      |
  | 0-12 m, 0-20 m | PE-12 / PE-20 en formation PN ; débutants interdits (`NX_DEBUTANT`) | non      |
  | 0-40 m, 0-60 m | PE-40 / PE-60                                                       | **oui**  |

- **Encadrant** : PN-C (`NX_ENCADRANT`) ; en enseignement, E2 minimum même de 0 à 6 m.
- **Plongeur supplémentaire** : GP ou P4 + PN-C (`EXTRA_NX`). Un GP inscrit avec une aptitude PE ne tient ce rôle (hors effectif) que s'il justifie PN-C.
- **Nx > 40 % d'O₂** : PN-C requis (`NX_PNC`).
  - Pour un élève **déjà PN** en formation PN-C : simple avertissement.
  - Sinon : bloquant.
- **Exploration à 0-6 m** : III-17 c n'a pas de ligne pour cet espace, donc le minimum est PE-12 + PN.

### Trimix / héliox (A322-96, III-18 a/b/c)

Qualifications, de la moins à la plus étendue : PN-C ⊂ PTH-40 ⊂ PTH-70 ⊂ PTH-120.

| Espace   | Enseignement : élèves / encadrant | Exploration encadrée : plongeurs / encadrant | Autonomie       |
| -------- | --------------------------------- | -------------------------------------------- | --------------- |
| 0-40 m   | PE-40 + PN-C / E3 + PTH-70        | PE-40 + PTH-40 / E3 + PTH-40                 | PA-40 + PTH-40  |
| 0-70 m   | PE-60 + PTH-40 / E4 + PTH-120     | PE-60 + PTH-70 / E4 + PTH-70                 | PA-60 + PTH-70  |
| 0-80 m   | PE-60 + PTH-70 / E4 + PTH-120     | PE-60 + PTH-120 / E4 + PTH-120               | PA-60 + PTH-120 |
| 80-120 m | —                                 | —                                            | PA-60 + PTH-120 |

- Effectif : 4 encadrés, ou 3 en autonomie.
- Pas de plongeur supplémentaire.
- Un GP ne peut pas encadrer.
- Baptêmes et débutants interdits.

Codes : `TX_GP`, `TX_ENCADRANT`, `TX_ENCADRANT_QUAL`, `TX_AIR`, `TX_QUAL`, `TX_PUBLIC`, `TX_ROLE_NO_GAS`.

---

## 6. Piscine ou fosse de 6 m au plus (A322-98)

- **DP** : enseignant **E1 minimum**. Lecture littérale : un N5 / DPE n'est pas un niveau d'enseignement, il est donc refusé.
- **Autonomie** : les PE-12 et au-delà peuvent plonger en autonomie.
- **Baptêmes** : ils peuvent être effectués par un GP ou un P4.
- **Débutants** : jamais autonomes ; en enseignement, un enseignant est requis (`BASSIN_DEBUTANT`).
- **Fiche de sécurité** : facultative (bandeau informatif).
- **Effectif** : au-delà de 4 plongeurs par encadrant, simple avertissement (`BASSIN_EFFECTIF`), car les tableaux du milieu naturel ne s'appliquent pas.

---

## 7. Directeur de plongée (A322-72, III-15 a, A322-98)

| Qualification    | Milieu naturel | Bassin ≤ 6 m | Enseignement                | Trimix                                   |
| ---------------- | -------------- | ------------ | --------------------------- | ---------------------------------------- |
| N5 (P5 / DPE)    | oui            | non          | **non** (exploration seule) | non                                      |
| E1, E2           | non            | oui          | oui                         | non                                      |
| E3 (MF1)         | oui            | oui          | oui, **≤ 40 m**             | enseignement ≤ 40 m, exploration ≤ 70 m  |
| E4 (MF2 / BEPPA) | oui            | oui          | oui                         | enseignement ≤ 80 m, exploration ≤ 120 m |

À l'air ou au nitrox, un DP E3 dirige l'exploration jusqu'à 60 m et
l'enseignement jusqu'à 40 m (`DP_DEPTH`) ; un DP E4 dirige l'enseignement
jusqu'à 60 m.

Diplômes d'État de III-15 a et III-15 b dans leur rédaction de l'arrêté du
24 novembre 2025 (en vigueur le 17/01/2026, copie dans `doc/`) : DP E3 =
BEES 1, DEJEPS « activités de plongée subaquatique » ; DP E4 = BEES 2, DEJEPS
« plongée subaquatique » (ancien intitulé), CC « plongée profonde et tutorat »,
DESJEPS. Le BPJEPS figure en GP, E1 et E2 de III-15 b, jamais en III-15 a.

Le DP doit en outre justifier PN-C au nitrox et PTH-120 au trimix (A322-72).

**Niveau retenu selon le cadre** (`src/domain/encadrement.js`). Le niveau
encadrant de l'annuaire porte les prérogatives fédérales (MF1 = E3, MF2 /
BEPPA = E4), valables en club associatif. Le diplôme d'État (III-15 b) donne
son propre niveau : BPJEPS = E2 (enseignement 0–20 m, exploration 0–40 m,
DP seulement en piscine ou fosse ≤ 6 m : annexe II-1, A322-98) ; BEES1 / DEJEPS = E3 ; BEES2 / DESJEPS / DEJEPS complété
du certificat complémentaire (délivré à la demande par équivalence avec le
MF2) ou obtenu avant la réforme = E4.

- **Club associatif** : le plus élevé des deux.
- **Structure commerciale (SCA)** : le niveau du diplôme d'État seul ; sans
  diplôme d'État qualifiant, le niveau fédéral (l'app ne sait pas si
  l'encadrant est rémunéré).

Exemple : MF1 + BEPPA + DEJEPS sans CC → E4 en club, E3 en SCA. Ce niveau
s'applique au DP comme aux encadrants des palanquées.

**DP en SCA** : seul le titulaire d'un diplôme d'État peut être DP (L212-1),
ni un P5 / DPE (N5), ni un enseignant fédéral (E1 → E4) sans diplôme pro ;
ceux-ci sont grisés dans le choix du DP et la plongée est bloquée
(`DP_DIPLOME_PRO`). « Autre » ne compte pas (prérogatives invérifiables). Un
BPJEPS (E2) n'est DP qu'en piscine ou fosse ≤ 6 m. En club, N5 et E1 → E4
dirigent selon le tableau ci-dessus.

DP désigné sans qualification de l'annexe III-15 a : bloquant (`DP_NOT_QUALIFIED`) ;
DP non désigné : avertissement (`DP_MISSING`). Le choix du site pour un DP E1 ou
E2 ne propose que les piscines et fosses de 6 m au plus.

Codes : `DP_QUAL_MILIEU`, `DP_MODE`, `DP_GAS`, `DP_DEPTH`, `DP_MISSING`, `DP_NOT_QUALIFIED`, `DP_DIPLOME_PRO`.

---

## 8. Fiche de sécurité et durées

- **Fiche (A322-72)** :
  - contenu : noms, prénoms, aptitudes et fonctions des plongeurs, paramètres **prévus et réalisés** ;
  - conservation : **un an** par l'établissement.
- **DTR** : **saisie par le DP**, jamais calculée par l'outil. Le Code du sport ne fixe aucune formule ; une valeur calculée affichée comme certaine sur la fiche serait trompeuse.
- **Certificat médical** :
  - expiré à la date de la plongée (émission + 1 an) → `MEDICAL_EXPIRED` ;
  - absent → avertissement `MEDICAL_MISSING` ;
  - non exigé pour un baptême.

---

## 9. Check-list

Items conditionnels de `CHECKLIST_RULES` (`src/domain/checklist.js`).

**Phase 1 — préparation**

- Secours (A322-78) :
  - plan de secours écrit et à jour ;
  - oxygénothérapie normobare ;
  - BAVU avec 3 masques et masque à haute concentration ;
  - couverture isothermique et eau douce ;
  - fiches d'évacuation (annexe III-19) ;
  - bouteille d'air de secours avec détendeur ;
  - tablette immergeable ;
  - tables de décompression (milieu naturel, y compris piscine ou fosse de plus de 6 m) ;
  - VHF en mer au départ d'une embarcation.
- Identification des blocs nitrox (A322-93).
- TIV et requalification des blocs.

**Phase 2 — sur site**

- Équipement des plongeurs et des encadrants (A322-80).
- **Un parachute de palier par palanquée** en milieu naturel (A322-80).
- Ces trois items suivent `reglesMilieuNaturel` (A322-98) : ils s'affichent aussi
  pour une piscine ou une fosse de plus de 6 m. La météo et la bouée restent
  masquées en bassin.
- Moyen de rappel depuis l'embarcation.
- Trimix (A322-97) : ligne lestée, copie des planifications, embarcation avec pilote.
- Recycleurs (A322-94).

---

## 10. Limites connues

- **Mélanges déclarés par palanquée** : l'app ne sait pas quel plongeur respire quel gaz, donc les exigences PN s'appliquent à tous les membres.
- **Stagiaires DEJEPS / DESJEPS** : E-3 au sens de III-15 b, mais absents de III-15 a comme DP. L'app ne distingue pas les stagiaires.
- **PpO₂ minimale (0,16 bar)** des mélanges hypoxiques : non contrôlée, car le % d'O₂ du trimix n'est pas saisi.
- **Hors Code du sport** : règles enfants du Manuel de formation technique FFESSM (8-14 ans), plongée de nuit, altitude.
