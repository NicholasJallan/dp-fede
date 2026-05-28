-- Migration 004 — Mon compte v2 + Sites v2

-- Users : président du club + numéro d'urgence
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS president_prenom VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS president_nom    VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS president_tel    VARCHAR(30)  NULL,
  ADD COLUMN IF NOT EXISTS urgence_defaut   VARCHAR(20)  NULL;

-- Sites : shot-line + pays/ville + canton
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS shot_line   TINYINT(1)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ville       VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS pays        VARCHAR(80)  NULL,
  ADD COLUMN IF NOT EXISTS pays_code   VARCHAR(3)   NULL,
  ADD COLUMN IF NOT EXISTS region      VARCHAR(150) NULL;
