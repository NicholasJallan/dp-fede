-- Migration 007 — Socle « club » (phase 5).
--
-- Pourquoi : les données (annuaire, sites, plongées) appartiennent à la
-- structure (club, SCA…), pas au compte d'un DP. Un club regroupe plusieurs
-- comptes avec un rôle chacun ; toutes les requêtes filtrent désormais par
-- club courant (club_id) au lieu de user_id. user_id est conservé comme
-- « auteur » de la ligne (NULL si le compte auteur a été supprimé).
--
-- Reprise des données : un club par utilisateur existant, construit depuis
-- users.club_* (colonnes conservées, désormais obsolètes) ; l'utilisateur en
-- devient « responsable » et toutes ses lignes y sont rattachées.
--
-- Idempotent (rejouable après un échec partiel) :
--   - CREATE TABLE / ADD COLUMN / CREATE INDEX … IF NOT EXISTS ;
--   - clubs.auto_created_for est UNIQUE : un seul club « personnel » créé
--     automatiquement par utilisateur (reprise + création paresseuse côté PHP) ;
--   - FK ajoutées / remplacées via une garde information_schema (cf. 005).

-- ── 1. Tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubs (
    id               CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    nom              VARCHAR(200) NOT NULL DEFAULT '',
    numero_ffessm    VARCHAR(50)  NOT NULL DEFAULT '',
    siret            VARCHAR(50)  NOT NULL DEFAULT '',
    structure_type   VARCHAR(20)  NULL,
    president_prenom VARCHAR(100) NULL,
    president_nom    VARCHAR(100) NULL,
    president_tel    VARCHAR(30)  NULL,
    urgence_defaut   VARCHAR(20)  NULL,
    -- Club créé automatiquement pour cet utilisateur (reprise 007 ou premier
    -- accès d'un nouveau compte). Pas de FK : la suppression du compte ne
    -- doit pas emporter un club partagé.
    auto_created_for INT UNSIGNED NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_clubs_auto_created_for (auto_created_for)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS club_members (
    club_id    CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    role       ENUM('responsable','dp','encadrant','lecture') NOT NULL DEFAULT 'lecture',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (club_id, user_id),
    INDEX idx_club_members_user (user_id),
    CONSTRAINT fk_club_members_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE,
    CONSTRAINT fk_club_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invitations : lien à usage unique. Seul le SHA-256 du jeton est stocké.
CREATE TABLE IF NOT EXISTS club_invitations (
    id          CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    club_id     CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    email       VARCHAR(255) NOT NULL,
    role        ENUM('responsable','dp','encadrant','lecture') NOT NULL DEFAULT 'lecture',
    token_hash  CHAR(64)     NOT NULL,
    invited_by  INT UNSIGNED NULL,
    expires_at  DATETIME     NOT NULL,
    accepted_at DATETIME     NULL,
    accepted_by INT UNSIGNED NULL,
    revoked_at  DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_club_invitations_token (token_hash),
    INDEX idx_club_invitations_club (club_id, accepted_at, revoked_at),
    CONSTRAINT fk_club_invitations_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE,
    CONSTRAINT fk_club_invitations_inviter FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_club_invitations_accepter FOREIGN KEY (accepted_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Reprise : un club par utilisateur existant ───────────────────────────
-- UUID() est évalué ligne par ligne. INSERT IGNORE + clé unique
-- auto_created_for : rejouable sans doublon.
INSERT IGNORE INTO clubs
    (id, nom, numero_ffessm, siret, structure_type,
     president_prenom, president_nom, president_tel, urgence_defaut,
     auto_created_for, created_at)
SELECT UUID(),
       COALESCE(u.club_nom, ''), COALESCE(u.club_numero, ''), COALESCE(u.club_siret, ''),
       u.structure_type, u.president_prenom, u.president_nom, u.president_tel, u.urgence_defaut,
       u.id, COALESCE(u.created_at, NOW())
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM club_members m WHERE m.user_id = u.id);

INSERT IGNORE INTO club_members (club_id, user_id, role, created_at)
SELECT c.id, c.auto_created_for, 'responsable', c.created_at
  FROM clubs c
  JOIN users u ON u.id = c.auto_created_for
 WHERE NOT EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id);

-- ── 3. Club courant de chaque utilisateur ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

UPDATE users u
  JOIN clubs c ON c.auto_created_for = u.id
   SET u.current_club_id = c.id
 WHERE u.current_club_id IS NULL;

SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                       AND COLUMN_NAME = 'current_club_id' AND REFERENCED_TABLE_NAME = 'clubs');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE users ADD CONSTRAINT fk_users_current_club FOREIGN KEY (current_club_id) REFERENCES clubs (id) ON DELETE SET NULL',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- ── 4. club_id sur divers / sites / dives ───────────────────────────────────
-- « updated_at = updated_at » : la reprise ne doit pas faire avancer les
-- curseurs de synchronisation (sinon tous les clients re-téléchargent tout).
ALTER TABLE divers ADD COLUMN IF NOT EXISTS club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER user_id;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER user_id;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER user_id;

UPDATE divers d JOIN clubs c ON c.auto_created_for = d.user_id
   SET d.club_id = c.id, d.updated_at = d.updated_at
 WHERE d.club_id IS NULL;
UPDATE sites s JOIN clubs c ON c.auto_created_for = s.user_id
   SET s.club_id = c.id, s.updated_at = s.updated_at
 WHERE s.club_id IS NULL;
UPDATE dives v JOIN clubs c ON c.auto_created_for = v.user_id
   SET v.club_id = c.id, v.updated_at = v.updated_at
 WHERE v.club_id IS NULL;

-- Toutes les lignes ont un propriétaire existant (orphelins supprimés par 005,
-- FK users depuis) : la reprise couvre donc 100 % des lignes. Si ce MODIFY
-- échoue, des lignes sans club subsistent : les examiner avant de rejouer
-- (SELECT … WHERE club_id IS NULL).
ALTER TABLE divers MODIFY club_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE sites  MODIFY club_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE dives  MODIFY club_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

CREATE INDEX IF NOT EXISTS idx_divers_club_updated ON divers (club_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_divers_club_deleted ON divers (club_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sites_club_updated  ON sites (club_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_sites_club_deleted  ON sites (club_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_dives_club_date     ON dives (club_id, date_plongee);
CREATE INDEX IF NOT EXISTS idx_dives_club_status   ON dives (club_id, status, planned_at);
CREATE INDEX IF NOT EXISTS idx_dives_club_updated  ON dives (club_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_dives_club_deleted  ON dives (club_id, deleted_at);

-- FK club_id → clubs (ON DELETE CASCADE : supprimer un club supprime ses
-- données ; le code le fait aussi explicitement, fichiers PDF compris).
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'divers'
                       AND COLUMN_NAME = 'club_id' AND REFERENCED_TABLE_NAME = 'clubs');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE divers ADD CONSTRAINT fk_divers_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sites'
                       AND COLUMN_NAME = 'club_id' AND REFERENCED_TABLE_NAME = 'clubs');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE sites ADD CONSTRAINT fk_sites_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dives'
                       AND COLUMN_NAME = 'club_id' AND REFERENCED_TABLE_NAME = 'clubs');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE dives ADD CONSTRAINT fk_dives_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- ── 5. user_id devient « auteur » : NULL-able, ON DELETE SET NULL ───────────
-- Avant : FK users ON DELETE CASCADE → supprimer un compte aurait effacé ses
-- contributions dans un club partagé. Étapes par table : retirer la FK
-- CASCADE (nom variable : *_ibfk_N ou fk_*_user), rendre la colonne NULL-able,
-- recréer la FK en SET NULL. Chaque étape est gardée → rejouable.

-- divers
SET @fk_name := (SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'divers'
                    AND REFERENCED_TABLE_NAME = 'users' AND DELETE_RULE <> 'SET NULL'
                  LIMIT 1);
SET @ddl := IF(@fk_name IS NULL, 'DO 0', CONCAT('ALTER TABLE divers DROP FOREIGN KEY `', @fk_name, '`'));
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
ALTER TABLE divers MODIFY user_id INT UNSIGNED NULL;
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.REFERENTIAL_CONSTRAINTS
                     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'divers'
                       AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE divers ADD CONSTRAINT fk_divers_author FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- sites
SET @fk_name := (SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sites'
                    AND REFERENCED_TABLE_NAME = 'users' AND DELETE_RULE <> 'SET NULL'
                  LIMIT 1);
SET @ddl := IF(@fk_name IS NULL, 'DO 0', CONCAT('ALTER TABLE sites DROP FOREIGN KEY `', @fk_name, '`'));
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
ALTER TABLE sites MODIFY user_id INT UNSIGNED NULL;
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.REFERENTIAL_CONSTRAINTS
                     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sites'
                       AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE sites ADD CONSTRAINT fk_sites_author FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- dives (l'index unique (user_id, client_uuid) tolère plusieurs NULL)
SET @fk_name := (SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'dives'
                    AND REFERENCED_TABLE_NAME = 'users' AND DELETE_RULE <> 'SET NULL'
                  LIMIT 1);
SET @ddl := IF(@fk_name IS NULL, 'DO 0', CONCAT('ALTER TABLE dives DROP FOREIGN KEY `', @fk_name, '`'));
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
ALTER TABLE dives MODIFY user_id INT UNSIGNED NULL;
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.REFERENTIAL_CONSTRAINTS
                     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'dives'
                       AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE dives ADD CONSTRAINT fk_dives_author FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
