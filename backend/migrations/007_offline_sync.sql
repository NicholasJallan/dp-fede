-- Migration 007 — Préparation du mode offline + sync différé
--
-- Objectifs :
-- 1. Soft-delete sur divers et sites pour propager les suppressions au pull incrémental
-- 2. updated_at sur sites et archives pour les requêtes ?since=
-- 3. client_uuid sur archives pour l'idempotence (un sync rejoué N fois = 1 ligne)
--
-- Note : divers.updated_at existe déjà (migration 001).
-- Cette migration est idempotente via Db.php (check colonne par colonne).

ALTER TABLE divers
  ADD COLUMN deleted_at DATETIME NULL,
  ADD INDEX idx_divers_user_updated (user_id, updated_at),
  ADD INDEX idx_divers_user_deleted (user_id, deleted_at);

ALTER TABLE sites
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN deleted_at DATETIME NULL,
  ADD INDEX idx_sites_user_updated (user_id, updated_at),
  ADD INDEX idx_sites_user_deleted (user_id, deleted_at);

ALTER TABLE archives
  ADD COLUMN client_uuid VARCHAR(36) NULL,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD UNIQUE INDEX uniq_archives_client (user_id, client_uuid);
