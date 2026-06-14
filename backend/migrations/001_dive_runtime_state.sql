-- Migration 001 — Table dédiée pour render_state (H4).
--
-- Pourquoi : l'autosave 500 ms sur dives.render_state (~5-20 KB) touche
-- dives.updated_at (curseur de sync) et génère du page-split InnoDB.
-- Séparer render_state dans une table dédiée :
--   - Les écritures render_state ne polluent plus updated_at
--   - idx_dives_user_status reste stable pendant l'exécution
--   - ON DELETE CASCADE garantit la cohérence sans GC manuelle.

CREATE TABLE IF NOT EXISTS dive_runtime_state (
    dive_id    VARCHAR(36) PRIMARY KEY,
    state      MEDIUMTEXT  NOT NULL,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_drs_dive FOREIGN KEY (dive_id) REFERENCES dives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrer les render_state existants (idempotent via INSERT IGNORE).
INSERT IGNORE INTO dive_runtime_state (dive_id, state)
SELECT id, render_state
  FROM dives
 WHERE render_state IS NOT NULL
   AND render_state NOT IN ('', '{}', '[]');
