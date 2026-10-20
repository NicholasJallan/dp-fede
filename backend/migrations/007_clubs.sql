-- Migration 007 — Socle « club » (phase 5), reprise des structures (002).
--
-- Pourquoi : les données (annuaire, sites, plongées) appartiennent à la
-- structure (club, SCA…), pas au compte d'un DP. Un club regroupe plusieurs
-- comptes avec un rôle chacun ; toutes les requêtes filtrent désormais par
-- club courant (club_id) au lieu de user_id. user_id est conservé comme
-- « auteur » de la ligne (NULL si le compte auteur a été supprimé ou inconnu).
--
-- Reprise des données (production : 000, 001 et 002_workspaces appliquées) :
--   a. un club PERSONNEL par compte users.kind = 'person', construit depuis
--      users.club_* (colonnes conservées, désormais obsolètes) ; le compte en
--      devient « responsable » et toutes ses lignes y sont rattachées ;
--   b. un club par STRUCTURE (table workspaces) : nom = workspaces.name,
--      informations reprises du compte-structure ; ses lignes (user_id =
--      workspaces.data_user_id) y sont rattachées ; membres = workspace_members
--      (owner → responsable, member → dp ; structure archivée : seuls les
--      owners). Sans owner, le créateur de la structure devient responsable ;
--   c. le compte-structure (users.kind = 'workspace') n'a PAS de club
--      personnel et ne peut toujours pas se connecter (Auth::current) ;
--   d. club courant : celui de la structure ACTIVE (archived_at NULL) si elle
--      était active sur la session la plus récente (non expirée) du membre
--      — c'est l'espace qu'il voyait, et celui de ses écritures hors ligne
--      encore en file —, sinon son club personnel ;
--   e. auteur des lignes d'une structure : user_id = created_by (compte
--      personne existant), sinon NULL ; NULL aussi si (auteur, client_uuid)
--      existe déjà parmi ses plongées personnelles (index uniq_dives_client,
--      supprimé en 011).
-- Les tables workspaces / workspace_members, sessions.workspace_id et les
-- colonnes created_by restent en base (lecture seule) ; une migration
-- ultérieure pourra les supprimer.
--
-- Idempotent (rejouable après un échec partiel) :
--   - CREATE TABLE / ADD COLUMN / CREATE INDEX … IF NOT EXISTS ;
--   - clubs.auto_created_for (club personnel) et clubs.legacy_workspace_id
--     (club issu d'une structure) sont UNIQUE : INSERT IGNORE ne crée jamais
--     de doublon ;
--   - chaque UPDATE ne touche que des lignes pas encore reprises (club_id /
--     current_club_id NULL, user_id encore égal au compte-structure) ;
--   - FK ajoutées / remplacées via une garde information_schema (cf. 005).
--
-- ATTENTION : l'ancien code (scope par user_id) ne voit plus les lignes des
-- structures après l'étape 6 : déployer avec l'API en maintenance (cf.
-- docs/deploy/php85.md, « Bascule de production »).

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
    -- Structure (workspaces.id, migration 002) dont le club est issu. Pas de
    -- FK : les tables workspaces pourront être supprimées plus tard.
    legacy_workspace_id INT UNSIGNED NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_clubs_auto_created_for (auto_created_for),
    UNIQUE KEY uq_clubs_legacy_workspace (legacy_workspace_id)
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

-- ── 2. Reprise (a) : un club personnel par compte « personne » ──────────────
-- UUID() est évalué ligne par ligne. INSERT IGNORE + clé unique
-- auto_created_for : rejouable sans doublon. Le compte-structure est exclu.
INSERT IGNORE INTO clubs
    (id, nom, numero_ffessm, siret, structure_type,
     president_prenom, president_nom, president_tel, urgence_defaut,
     auto_created_for, created_at)
SELECT UUID(),
       COALESCE(u.club_nom, ''), COALESCE(u.club_numero, ''), COALESCE(u.club_siret, ''),
       u.structure_type, u.president_prenom, u.president_nom, u.president_tel, u.urgence_defaut,
       u.id, COALESCE(u.created_at, NOW())
  FROM users u
 WHERE u.kind = 'person'
   AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.auto_created_for = u.id);

INSERT IGNORE INTO club_members (club_id, user_id, role, created_at)
SELECT c.id, c.auto_created_for, 'responsable', c.created_at
  FROM clubs c
  JOIN users u ON u.id = c.auto_created_for AND u.kind = 'person'
 WHERE NOT EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id);

-- ── 3. Reprise (b) : un club par structure ─────────────────────────────────
-- Informations du club reprises du compte-structure (nom de la structure,
-- numéro d'urgence…). Clé unique legacy_workspace_id : rejouable.
INSERT IGNORE INTO clubs
    (id, nom, numero_ffessm, siret, structure_type,
     president_prenom, president_nom, president_tel, urgence_defaut,
     legacy_workspace_id, created_at)
SELECT UUID(),
       w.name, COALESCE(du.club_numero, ''), COALESCE(du.club_siret, ''),
       du.structure_type, du.president_prenom, du.president_nom, du.president_tel, du.urgence_defaut,
       w.id, COALESCE(w.created_at, NOW())
  FROM workspaces w
  LEFT JOIN users du ON du.id = w.data_user_id;

-- Membres : owner → responsable, member → dp. Structure archivée : ses
-- membres n'y avaient plus accès, seuls les owners sont repris.
INSERT IGNORE INTO club_members (club_id, user_id, role, created_at)
SELECT c.id, wm.user_id, IF(wm.role = 'owner', 'responsable', 'dp'), COALESCE(wm.joined_at, NOW())
  FROM workspace_members wm
  JOIN workspaces w ON w.id = wm.workspace_id
  JOIN clubs c ON c.legacy_workspace_id = w.id
  JOIN users u ON u.id = wm.user_id AND u.kind = 'person'
 WHERE w.archived_at IS NULL OR wm.role = 'owner';

-- Un club garde toujours un responsable : sans owner (parti), le créateur de
-- la structure le devient (promu s'il était membre).
INSERT INTO club_members (club_id, user_id, role)
SELECT c.id, w.created_by, 'responsable'
  FROM workspaces w
  JOIN clubs c ON c.legacy_workspace_id = w.id
  JOIN users u ON u.id = w.created_by AND u.kind = 'person'
 WHERE NOT EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.role = 'responsable')
ON DUPLICATE KEY UPDATE role = 'responsable';

-- ── 4. Club courant de chaque utilisateur ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

-- (d) Structure active sur la session la plus récente (non expirée) : le
-- membre retrouve l'espace qu'il utilisait, ses écritures hors ligne encore en
-- file (sans club) y seront rattachées par le nouveau front.
UPDATE users u
  JOIN (SELECT s.user_id, MAX(s.expires_at) AS last_exp
          FROM sessions s
         WHERE s.expires_at > NOW()
         GROUP BY s.user_id) last ON last.user_id = u.id
  JOIN sessions s ON s.user_id = u.id AND s.expires_at = last.last_exp
  JOIN workspaces w ON w.id = s.workspace_id AND w.archived_at IS NULL
  JOIN clubs c ON c.legacy_workspace_id = w.id
  JOIN club_members m ON m.club_id = c.id AND m.user_id = u.id
   SET u.current_club_id = c.id
 WHERE u.current_club_id IS NULL;

-- Sinon : club personnel.
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

-- ── 5. club_id sur divers / sites / dives ───────────────────────────────────
-- « updated_at = updated_at » : la reprise ne doit pas faire avancer les
-- curseurs de synchronisation (sinon tous les clients re-téléchargent tout).
ALTER TABLE divers ADD COLUMN IF NOT EXISTS club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER user_id;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER user_id;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS club_id
    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER user_id;

-- Lignes d'une structure (propriétaire = compte-structure) → club de la structure.
UPDATE divers d JOIN workspaces w ON w.data_user_id = d.user_id
  JOIN clubs c ON c.legacy_workspace_id = w.id
   SET d.club_id = c.id, d.updated_at = d.updated_at
 WHERE d.club_id IS NULL;
UPDATE sites s JOIN workspaces w ON w.data_user_id = s.user_id
  JOIN clubs c ON c.legacy_workspace_id = w.id
   SET s.club_id = c.id, s.updated_at = s.updated_at
 WHERE s.club_id IS NULL;
UPDATE dives v JOIN workspaces w ON w.data_user_id = v.user_id
  JOIN clubs c ON c.legacy_workspace_id = w.id
   SET v.club_id = c.id, v.updated_at = v.updated_at
 WHERE v.club_id IS NULL;

-- Lignes personnelles → club personnel de leur propriétaire.
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
-- FK users depuis), personne ou compte-structure : la reprise couvre donc
-- 100 % des lignes. Si ce MODIFY
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

-- ── 6. user_id devient « auteur » : NULL-able, ON DELETE SET NULL ───────────
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

-- ── 7. Reprise (e) : auteur des lignes d'une structure ─────────────────────
-- Le compte-structure n'est l'auteur de rien : user_id = created_by s'il
-- désigne un compte « personne » existant, sinon NULL (auteur inconnu).
-- Rejouable : une fois reprise, la ligne n'a plus user_id = data_user_id.
UPDATE divers d
  JOIN workspaces w ON w.data_user_id = d.user_id
  LEFT JOIN users a ON a.id = d.created_by AND a.kind = 'person'
   SET d.user_id = a.id, d.updated_at = d.updated_at;
UPDATE sites s
  JOIN workspaces w ON w.data_user_id = s.user_id
  LEFT JOIN users a ON a.id = s.created_by AND a.kind = 'person'
   SET s.user_id = a.id, s.updated_at = s.updated_at;
-- dives : l'index unique (user_id, client_uuid) existe encore (supprimé en
-- 011). L'auteur reste NULL si (auteur, client_uuid) existe déjà parmi ses
-- plongées personnelles, ou sur une autre plongée de structure de même
-- auteur et plus petit id (rejeu d'outbox dans deux espaces) : seule la
-- première garde l'auteur. Critère « structure » sur club_id (stable pendant
-- l'UPDATE), pas sur user_id (modifié par lui).
UPDATE dives v
  JOIN workspaces w ON w.data_user_id = v.user_id
  LEFT JOIN users a ON a.id = v.created_by AND a.kind = 'person'
  LEFT JOIN dives dup ON dup.user_id = a.id AND dup.client_uuid = v.client_uuid AND dup.id <> v.id
  LEFT JOIN dives sib ON sib.created_by = v.created_by AND sib.client_uuid = v.client_uuid AND sib.id < v.id
  LEFT JOIN clubs sc ON sc.id = sib.club_id AND sc.legacy_workspace_id IS NOT NULL
   SET v.user_id = IF(dup.id IS NULL AND sc.id IS NULL, a.id, NULL), v.updated_at = v.updated_at;
