# Règles métier — DP Assistant

Synthèse exhaustive des règles métier appliquées par l'outil. Source : Code du Sport (Art. A322-71 à A322-101), MFT FFESSM et règles internes du club.

> **Avertissement** : outil d'aide à la décision. Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée.

---

## Sommaire

1. [Niveaux et aptitudes](#1-niveaux-et-aptitudes)
2. [Directeur de Plongée — qualifications acceptées](#2-directeur-de-plongée--qualifications-acceptées)
3. [Profondeurs maximales par DP](#3-profondeurs-maximales-par-dp)
4. [Mélanges respiratoires — qualifications DP requises](#4-mélanges-respiratoires--qualifications-dp-requises)
5. [Composition des palanquées](#5-composition-des-palanquées)
6. [Code couleur fiche de sécurité](#6-code-couleur-fiche-de-sécurité)
7. [Check-list conditionnelle](#7-check-list-conditionnelle)
8. [Articles Code du Sport référencés](#8-articles-code-du-sport-référencés)

---

## 1. Niveaux et aptitudes

### Niveaux plongeur (autonomes / encadrés)

| Niveau | Aptitudes encadrées (PE) | Aptitudes autonomes (PA) | Rôle encadrement |
|---|---|---|---|
| **Débutant** (aucun brevet) | PE20 (en formation) ou Baptême | — | — |
| **N1** | PE20 | PA12, PA20 (optionnelles) | — |
| **N2** | PE20, PE40 | PA12, PA20 ; PA40 optionnelle | — |
| **N3** | PE20, PE40, PE60 | PA12, PA20, PA40, **PA60** | — |
| **N4** (GP) | PE20, PE40, PE60 | PA12, PA20, PA40, PA60 | GP (guide de palanquée) |
| **N5** (DP plongeur) | PE20, PE40, PE60 | PA12, PA20, PA40, PA60 | DP exploration seulement |

> **Licencié débutant** : un plongeur enregistré dans l'annuaire **sans aucun niveau** (ni plongeur, ni encadrant) est considéré comme totalement débutant. Il peut uniquement faire un Baptême (≤ 6 m) ou être PE20 (≤ 20 m), exclusivement dans une palanquée de **formation** (présence obligatoire d'un enseignant E1→E4).

### Niveaux encadrant fédéraux

| Niveau | Description | Enseignement max (air) | Exploration max (air) | Peut être DP ? |
|---|---|---|---|---|
| **E1** | Initiateur club | 6 m | — | Non (par défaut) |
| **E2** | Initiateur / MF1 stagiaire | 20 m | — | Non (par défaut) |
| **E3** | MF1 | 40 m | 60 m | **Oui** |
| **E4** | MF2 / BEES2 / DES-JEPS | 60 m | 60 m | **Oui** |

> Les encadrants héritent de toutes les aptitudes plongeur N3 (PE20→60, PA12→60) + rôle d'enseignant et de GP.

### Aptitudes complémentaires

| Aptitude | Condition / pré-requis | Profondeur max |
|---|---|---|
| **PN** | Plongeur Nitrox | dépend du mélange ≤40 % O₂ |
| **PN-C** | Nitrox Confirmé (>40 % O₂) | dépend du mélange |
| **PTH-70** | **PN-C + niveau N3 (ou encadrant)** | 70 m |
| **PTH-120** | **PN-C + niveau N3 (ou encadrant)** | 120 m |
| **CCR / SCR** | Recycleur (modèle déclaré) | selon constructeur |

> **Règle stricte Trimix** : un plongeur ne peut détenir PTH-70 ou PTH-120 qu'à condition d'être PN-C **et** d'avoir le niveau N3 (ou être encadrant E1→E4 / N4 / N5, qui héritent des aptitudes N3). L'application verrouille ces cases tant que les pré-requis ne sont pas réunis et nettoie automatiquement les qualifications devenues invalides si l'on retire PN-C ou si l'on change le niveau.

> **Plongée trimix interdite aux N1 et N2** : aucun plongeur N1, N2, débutant ou baptême ne peut être membre d'une palanquée utilisant le mélange Tx, **même en formation vers le N3**. La palanquée doit être composée exclusivement de N3 et/ou d'encadrants, tous détenteurs de PTH-70 ou PTH-120.

---

## 2. Directeur de Plongée — qualifications acceptées

Le DP doit être de l'un des niveaux suivants :

- **E3** ou **E4** : peut diriger toutes activités (exploration et enseignement).
- **N5** : peut diriger l'exploration uniquement.
- **E1, E2** : exclus du `DPPicker` (interface) sauf cas particuliers club. L'outil les bloque par défaut.

### Restrictions sites selon DP

| DP | Sites autorisés |
|---|---|
| **E1** | Piscine ≤ 6 m |
| **E2** | Piscine ou fosse ≤ 20 m |
| **E3, E4, N5** | Tous milieux (mer, lac, carrière, piscine, fosse) |

---

## 3. Profondeurs maximales par DP

### À l'air (mélange par défaut)

| DP | Formation | Exploration |
|---|---|---|
| E1 | 6 m | — |
| E2 | 20 m | — |
| E3 | 40 m | 60 m |
| E4 | 60 m | 60 m |
| N5 | — | 60 m |

### En Trimix (DP **PTH-120 obligatoire**, E3 ou E4 uniquement)

| DP | Formation Trimix | Exploration Trimix |
|---|---|---|
| **E1, E2** | **Interdit** | **Interdit** |
| E3 + PTH-120 | 40 m | 70 m |
| E4 + PTH-120 | **80 m** | **120 m** |

> ⚠ Un DP PTH-70 seul **ne suffit pas** pour diriger une plongée trimix. PTH-70 reste utile en tant qu'aptitude individuelle de plongeur.

---

## 4. Mélanges respiratoires — qualifications DP requises

Le sélecteur de mélanges par palanquée filtre automatiquement les options selon les qualifications du DP. Les mélanges interdits apparaissent grisés.

| Mélange | DP requis | Article CdS |
|---|---|---|
| **Air** | aucun | — |
| **Nx ≤ 40 % (Nitrox)** | DP **PN-C** | A322-89 |
| **Nx > 40 % (Nitrox confirmé)** | DP **PN-C** | A322-89 |
| **Tx (Trimix / Héliox)** | DP **PTH-120** ET (E3 ou E4) | A322-91 |

> Règle interne stricte : tout mélange suroxygéné (même ≤ 40 %) impose un DP PN-C. C'est plus strict que la règle CdS minimale (PN suffit pour Nx ≤ 40 %).

### Qualifications individuelles requises (exploration & guidée)

En **plongée d'exploration** ou **plongée guidée**, chaque plongeur doit individuellement détenir la qualification correspondant au mélange respiré :

| Mélange dans la palanquée | Qualification individuelle requise |
|---|---|
| **Nx ≤ 40 %** | PN (ou PN-C) |
| **Nx > 40 %** | PN-C |
| **Tx** | PTH-70 (ou PTH-120) |

> Un plongeur ne peut pas faire plus que ce qu'il est déclaré savoir faire (aptitudes, niveau, PN/PNC, PTH-70/120). En **formation** (palanquée avec un E1→E4), cette règle est levée : l'élève peut apprendre un mélange qu'il ne maîtrise pas encore, sous la responsabilité de l'enseignant.

### Trimix interdit en plongée guidée

Une palanquée dont la composition comporte un **GP** (palanquée guidée, ou toute palanquée incluant un guide) ne peut **jamais** mobiliser le mélange **Tx**, même si tous les autres pré-requis sont remplis. Le trimix n'est autorisé qu'en exploration autonome ou en formation dirigée par un E3/E4 PTH-120.

### Comportement de l'outil

- Cases mélanges interdites au niveau DP = grisées + tooltip explicatif.
- Si le DP change et qu'une palanquée avait un mélange devenu interdit → nettoyage automatique (fallback sur Air).
- Validation bloquante au moment de l'enregistrement si :
  - une palanquée a un mélange incompatible avec le DP,
  - une palanquée Trimix contient un membre N1, N2, débutant ou baptême (même en formation vers N3),
  - une palanquée avec GP contient le mélange Tx,
  - en exploration ou guidée, un membre n'a pas la qualification nitrox/trimix requise par le mélange sélectionné.

---

## 5. Composition des palanquées

### Tailles maximales par type

| Type | Composition | Taille max |
|---|---|---|
| **Exploration autonome** | PA uniquement (PA12, PA20, PA40, PA60), tous de même aptitude | **3** |
| **Exploration guidée — 1 GP** | 1 GP + 4 PE (PE20 ou PE40, tous de même aptitude) | **5** |
| **Exploration guidée — 2 GP** | 2 GP (dont serre-file en queue) + jusqu'à 4 PE | **6** |
| **Formation** | ≥ 1 encadrant E1→E4 + élèves PE (même aptitude), plusieurs encadrants possibles | **5** |
| **Baptême** | ≥ 1 encadrant E1→E4 + baptisé(s) | 6 (max 2 baptisés pour E1) |

> Toute palanquée doit comporter au minimum 2 personnes (binôme).

### Règles d'encadrement

- **GP** : ne peut encadrer que des PE20 ou PE40 (pas de PE60, pas de PA, pas d'enseignant). Pas de panachage PE20/PE40 dans une même palanquée. Max 4 encadrés par GP.
- **Serre-file** (6e personne) : doit être GP, E3 ou E4. Palanquée à 6 → 2 encadrants minimum.
- **E1** : enseignement et baptême en piscine uniquement, max 6 m, max 2 baptisés.
- **E2** : enseignement piscine ou fosse, max 20 m.
- **E3** : tous environnements, formation max 40 m. Ne peut pas encadrer un PE60 (réservé E4).
- **E4** : tous environnements, formation max 60 m (80 m en trimix).
- **PE sans encadrement** : interdit. Un PE doit toujours être accompagné d'un GP ou d'un E.
- **PA autonomes** : palanquée 100 % PA, max 3, pas de panachage PA12/PA20/PA40/PA60.
- **Baptême en milieu naturel** : E3 ou E4 obligatoire (E1/E2 limités à la piscine).

### Profondeur ≤ aptitude

La profondeur prévue de la palanquée est comparée à la profondeur max de chaque aptitude (`aptitudeMaxDepth`). Tout dépassement → erreur bloquante.

### Certificat médical

Chaque plongeur (hors baptême) doit avoir un certificat médical en cours de validité à la date prévue de la plongée. Sinon → erreur bloquante.

---

## 6. Code couleur fiche de sécurité

Les palanquées sont colorées selon leur type (déterminé automatiquement par `getPalType`) sur l'écran de constitution ET sur la fiche de sécurité imprimée.

| Type | Couleur | Détection |
|---|---|---|
| **Exploration autonome** | 🟢 Vert clair | PA only |
| **Exploration guidée** | 🔵 Bleu clair | GP + PE |
| **Formation** | 🟠 Saumon clair | au moins un E1→E4 + PE |
| **Baptême** | 🔴 Corail saturé | au moins un Baptême |

> Les couleurs sont conservées à l'impression PDF (`print-color-adjust: exact`).

---

## 7. Check-list conditionnelle

La check-list est générée dynamiquement selon les réponses du profil (`answers`). Chaque item a une condition `when` qui détermine sa visibilité.

### Phase 1 — Préparation (avant l'arrivée sur site)

Météo, marée, dates de réépreuve TIV / requalification blocs, gonflage, analyse Nitrox (PN-C si > 40 %), analyse Trimix, blocs relais, check-list constructeur recycleur, O₂ secours, trousse, documents plongeurs, autorisations parentales mineurs, évaluation E3 brevets étrangers, VHF, carburant, shot-line, coordonnées secours, fiche pré-remplie.

### Phase 2 — Sur site (avant la mise à l'eau)

Appel nominatif, briefing, rappels sécurité (moyen de rappel, perte palanquée), composition palanquée, sécurité surface, fiche accessible, pavillon Alpha, échelle, shot-line, signature analyse Nitrox, aptitudes recycleur, planifs déco Trimix, points d'entrée/sortie, décision finale DP (`go / no-go`).

---

## 8. Articles Code du Sport référencés

| Article | Sujet | URL Légifrance |
|---|---|---|
| **A322-72** | Directeur de plongée — responsabilités | [LEGIARTI000025393876](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393876) |
| **A322-77** | Information des pratiquants | [LEGIARTI000025705105](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025705105) |
| **A322-78** | Matériel de secours et d'assistance | [LEGIARTI000025393863](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393863) |
| **A322-86** | Espaces d'évolution — profondeurs | [LEGIARTI000025393833](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393833) |
| **A322-89** | Plongée au Nitrox | [LEGIARTI000025393827](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393827) |
| **A322-91** | Plongée Trimix / Héliox | [LEGIARTI000025393819](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393819) |
| **A322-94** | Plongée en recycleur (CCR / SCR) | [LEGIARTI000025393813](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025393813) |

---

## Fraîcheur des données

Les annuaires plongeurs et sites sont rafraîchis automatiquement depuis le backend à chaque démarrage d'une plongée :
- création d'une nouvelle plongée (« Nouvelle plongée » depuis l'accueil),
- reprise d'un brouillon,
- clonage d'une archive.

Une évolution de niveau ou d'aptitude saisie depuis un autre poste, ou par un autre utilisateur, est donc immédiatement visible sans redémarrer l'application.

---

## Validations bloquantes vs alertes

L'outil distingue trois niveaux dans `validatePal` :

| Niveau | Effet UI | Exemples |
|---|---|---|
| **OK** ✅ | Composition conforme | Palanquée valide |
| **ALERTE** ⚠ | Avertissement, n'empêche pas l'enregistrement | Palanquée vide, aucun mélange sélectionné, membres sans aptitude |
| **BLOQUANT** ❌ | Erreur, doit être corrigée | Taille hors limites, profondeur > aptitude, mélange incompatible DP, certificat médical expiré, encadrement manquant |

---

## Référence rapide — qualifications minimales DP par scénario

| Scénario | DP minimum |
|---|---|
| Baptême piscine | E1 |
| Baptême mer/lac | E3 |
| Formation N1 piscine (6 m) | E1 |
| Formation N2 piscine/fosse (20 m) | E2 |
| Exploration jusqu'à 60 m air | E3, E4 ou N5 |
| Formation PE40 / PA40 (40 m) | E3 |
| Formation PE60 (60 m) | E4 |
| Plongée Nitrox (toute concentration) | E3, E4 ou N5 **avec PN-C** |
| Exploration Trimix 70 m | E3 ou E4 **avec PTH-120** |
| Formation Trimix 80 m | E4 **avec PTH-120** |
| Exploration Trimix 120 m | E4 **avec PTH-120** |
