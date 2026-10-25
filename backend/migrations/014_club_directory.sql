-- Migration 014 — Annuaire des clubs : création, demandes d'adhésion,
-- unicité du nom et des identifiants.
--
-- 1. Un club actif (deleted_at NULL) ne partage ni son nom, ni son numéro de
--    club (FFESSM / agrément SCA / FPESSM), ni son SIRET (N° TAHITI en
--    Polynésie) avec un autre club actif. Valeurs vides : non contrôlées
--    (clubs personnels pas encore renseignés). Un club supprimé (conservation
--    légale) libère son nom et ses numéros.
--    Colonnes générées PERSISTENT + index UNIQUE : garde-fou contre deux
--    créations simultanées (le contrôle applicatif, Club::identityConflict,
--    donne le message). La collation utf8mb4_unicode_ci compare sans casse ni
--    accents (« Bulles » = « bulles » = « Bullés ») et ignore les espaces de
--    fin ; les espaces internes sont normalisés par l'API (Club::normalizeName).
-- 2. Normalisation des valeurs existantes, comme le fait désormais l'API :
--    nom sans espaces superflus ; numéros sans espaces, points, tirets ni
--    barres obliques, en majuscules (« 06 13 0045 » → « 06130045 »).
-- 3. club_join_requests : demande d'un utilisateur à rejoindre un club,
--    acceptée (avec un rôle) ou refusée par un responsable. Une seule
--    demande EN ATTENTE par (club, utilisateur) : pending_key vaut 1 en
--    attente, NULL sinon (plusieurs NULL autorisés par l'index UNIQUE).
--
-- Rejouable : UPDATE idempotents, ADD COLUMN / CREATE INDEX / CREATE TABLE
-- … IF NOT EXISTS. La production (25/10/2026) n'a aucun doublon de nom ni de
-- numéro parmi ses clubs actifs.

UPDATE clubs
   SET nom = TRIM(REGEXP_REPLACE(nom, '[[:space:]]+', ' ')), updated_at = updated_at
 WHERE nom <> TRIM(REGEXP_REPLACE(nom, '[[:space:]]+', ' '));

UPDATE clubs
   SET numero_ffessm = UPPER(REGEXP_REPLACE(numero_ffessm, '[[:space:]./-]+', '')), updated_at = updated_at
 WHERE numero_ffessm <> UPPER(REGEXP_REPLACE(numero_ffessm, '[[:space:]./-]+', ''));

UPDATE clubs
   SET siret = UPPER(REGEXP_REPLACE(siret, '[[:space:]./-]+', '')), updated_at = updated_at
 WHERE siret <> UPPER(REGEXP_REPLACE(siret, '[[:space:]./-]+', ''));

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS nom_unique VARCHAR(200)
    AS (IF(deleted_at IS NULL AND nom <> '', nom, NULL)) PERSISTENT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS numero_unique VARCHAR(50)
    AS (IF(deleted_at IS NULL AND numero_ffessm <> '', numero_ffessm, NULL)) PERSISTENT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS siret_unique VARCHAR(50)
    AS (IF(deleted_at IS NULL AND siret <> '', siret, NULL)) PERSISTENT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clubs_nom ON clubs (nom_unique);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clubs_numero ON clubs (numero_unique);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clubs_siret ON clubs (siret_unique);

CREATE TABLE IF NOT EXISTS club_join_requests (
    id          CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    club_id     CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    message     VARCHAR(500) NULL,
    status      ENUM('pending','accepted','refused','cancelled') NOT NULL DEFAULT 'pending',
    role        ENUM('responsable','dp','encadrant','lecture') NULL,
    decided_by  INT UNSIGNED NULL,
    decided_at  DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pending_key TINYINT      AS (IF(status = 'pending', 1, NULL)) PERSISTENT,
    PRIMARY KEY (id),
    UNIQUE KEY uq_club_join_pending (club_id, user_id, pending_key),
    INDEX idx_club_join_club (club_id, status),
    INDEX idx_club_join_user (user_id, status),
    CONSTRAINT fk_club_join_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE,
    CONSTRAINT fk_club_join_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_club_join_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
