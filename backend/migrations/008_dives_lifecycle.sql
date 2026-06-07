-- Migration 008 — Cycle de vie des plongées
--
-- Objectifs :
--   1. Renommer la table archives → dives (le mot 'archives' ne couvre
--      plus le cycle de vie préparation + exécution + archivage)
--   2. Ajouter les colonnes de cycle de vie :
--        status       ENUM('prepared','in_progress','archived')
--        planned_at   DATETIME NULL  — date planifiée (= date_plongee à la création)
--        started_at   DATETIME NULL  — 1er heuresDebut posé
--        closed_at    DATETIME NULL  — archivage final
--        render_state MEDIUMTEXT NULL — { pressions, realises, heuresDebut, heuresFin, checked, comments }
--        deleted_at   DATETIME NULL  — soft-delete (cohérence avec divers/sites)
--   3. Backfill : toutes les lignes existantes sont des plongées archivées
--
-- Idempotente : Db.php gère le RENAME et les ADD COLUMN via
-- addColumnIfMissing/addIndexIfMissing, donc safe à re-exécuter.
--
-- Ce fichier est la documentation de référence. La migration effective est
-- appliquée par backend/lib/Db.php::migrate() au boot du backend.

-- 1. Renommer (conditionnel : Db.php vérifie que dives n'existe pas d'abord)
-- RENAME TABLE archives TO dives;

-- 2. Colonnes de cycle de vie
-- ALTER TABLE dives
--   ADD COLUMN status      ENUM('prepared','in_progress','archived') NOT NULL DEFAULT 'archived',
--   ADD COLUMN planned_at  DATETIME NULL,
--   ADD COLUMN started_at  DATETIME NULL,
--   ADD COLUMN closed_at   DATETIME NULL,
--   ADD COLUMN render_state MEDIUMTEXT NULL,
--   ADD COLUMN deleted_at  DATETIME NULL;

-- 3. Backfill
-- UPDATE dives SET planned_at = date_plongee, closed_at = created_at
--  WHERE status = 'archived' AND planned_at IS NULL;

-- 4. Index
-- CREATE INDEX idx_dives_user_status ON dives (user_id, status, planned_at DESC);
-- CREATE INDEX idx_dives_user_deleted ON dives (user_id, deleted_at);
