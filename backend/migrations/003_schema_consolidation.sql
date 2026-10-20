-- Migration 003 — Repli du schéma inline de l'ancien Db::migrate().
--
-- Jusqu'ici, Db::migrate() rejouait à CHAQUE requête HTTP des CREATE TABLE
-- IF NOT EXISTS + ~35 garde-fous addColumnIfMissing / addIndexIfMissing pour
-- les instances créées avec une version antérieure du schéma. Ces garde-fous
-- sont désormais ici, une fois pour toutes, sous forme idempotente (MariaDB :
-- ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS) : le fichier peut être
-- rejoué sans effet sur une base déjà à jour.

-- ── Tables ajoutées après le schéma initial ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       VARCHAR(64)  NOT NULL,
    ident        VARCHAR(64)  NOT NULL,
    count        INT UNSIGNED NOT NULL DEFAULT 0,
    window_start DATETIME     NOT NULL,
    PRIMARY KEY (bucket, ident)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── users ───────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS structure_type   VARCHAR(20)  NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS president_prenom VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS president_nom    VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS president_tel    VARCHAR(30)  NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS urgence_defaut   VARCHAR(20)  NULL;

-- ── divers ──────────────────────────────────────────────────────────────────
ALTER TABLE divers ADD COLUMN IF NOT EXISTS niveau_plongeur  VARCHAR(3) NULL;
ALTER TABLE divers ADD COLUMN IF NOT EXISTS niveau_encadrant VARCHAR(4) NULL;
ALTER TABLE divers ADD COLUMN IF NOT EXISTS aptitudes_sup    JSON       NULL;
ALTER TABLE divers ADD COLUMN IF NOT EXISTS deleted_at       DATETIME   NULL;
CREATE INDEX IF NOT EXISTS idx_divers_user_updated ON divers (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_divers_user_deleted ON divers (user_id, deleted_at);

-- ── sites ───────────────────────────────────────────────────────────────────
ALTER TABLE sites ADD COLUMN IF NOT EXISTS depart_bord   TINYINT(1)   NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS depart_bateau TINYINT(1)   NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS shot_line     TINYINT(1)   NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS ville         VARCHAR(150) NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS pays          VARCHAR(80)  NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS pays_code     VARCHAR(3)   NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS region        VARCHAR(150) NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS acces_secours VARCHAR(500) NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS caisson       VARCHAR(500) NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at    DATETIME     NULL;
CREATE INDEX IF NOT EXISTS idx_sites_user_updated ON sites (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_sites_user_deleted ON sites (user_id, deleted_at);

-- ── dives ───────────────────────────────────────────────────────────────────
ALTER TABLE dives ADD COLUMN IF NOT EXISTS client_uuid  VARCHAR(36) NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS status       ENUM('prepared','in_progress','archived') NOT NULL DEFAULT 'archived';
ALTER TABLE dives ADD COLUMN IF NOT EXISTS planned_at   DATETIME    NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS started_at   DATETIME    NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS closed_at    DATETIME    NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS render_state MEDIUMTEXT  NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS deleted_at   DATETIME    NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dives_client ON dives (user_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_dives_user_date    ON dives (user_id, date_plongee DESC);
CREATE INDEX IF NOT EXISTS idx_dives_user_status  ON dives (user_id, status, planned_at DESC);
CREATE INDEX IF NOT EXISTS idx_dives_user_deleted ON dives (user_id, deleted_at);
