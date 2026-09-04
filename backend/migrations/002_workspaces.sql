-- Migration 002 — Structures partagées (workspaces).
--
-- Une « structure » (stage, club, sortie) est un espace de données partagé par
-- plusieurs utilisateurs. Plutôt que d'ajouter une colonne workspace_id à
-- divers/sites/dives (backfill + refonte des 7 index menés par user_id +
-- de l'unique uniq_dives_client), on garde user_id comme clé de scope et on
-- change la valeur injectée : chaque structure possède un « compte-structure »,
-- une ligne users avec kind='workspace' qui ne peut jamais se connecter et à qui
-- appartiennent les données du stage. Auth::current() résout $user['scope_id'].
--
-- Tous les statements sont ré-entrants (IF NOT EXISTS) : Migrator::applyFile()
-- ne marque la migration appliquée qu'après succès complet, donc un échec en
-- cours de route doit pouvoir être rejoué sans casser l'API.

ALTER TABLE users ADD COLUMN IF NOT EXISTS kind ENUM('person','workspace') NOT NULL DEFAULT 'person';

CREATE TABLE IF NOT EXISTS workspaces (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    slug         VARCHAR(80)  NOT NULL,
    join_code    VARCHAR(40)  NOT NULL,
    data_user_id INT UNSIGNED NOT NULL,
    created_by   INT UNSIGNED NULL,
    archived_at  DATETIME     NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ws_slug      (slug),
    UNIQUE KEY uq_ws_code      (join_code),
    UNIQUE KEY uq_ws_data_user (data_user_id),
    FOREIGN KEY (data_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id INT UNSIGNED NOT NULL,
    user_id      INT UNSIGNED NOT NULL,
    role         ENUM('owner','member') NOT NULL DEFAULT 'member',
    joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id),
    INDEX idx_wsm_user (user_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_id INT UNSIGNED NULL;

ALTER TABLE divers ADD COLUMN IF NOT EXISTS created_by INT UNSIGNED NULL;
ALTER TABLE sites  ADD COLUMN IF NOT EXISTS created_by INT UNSIGNED NULL;
ALTER TABLE dives  ADD COLUMN IF NOT EXISTS created_by INT UNSIGNED NULL;
