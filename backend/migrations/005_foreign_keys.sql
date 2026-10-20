-- Migration 005 — Clés étrangères manquantes + nettoyage des orphelins.
--
-- Pourquoi : `dives.user_id` n'avait pas de FK vers `users` (et était en INT
-- signé alors que users.id est INT UNSIGNED). La suppression d'un compte
-- (DELETE /api/users/:id) laissait donc ses plongées — et leur runtime state —
-- orphelines en base : fuite RGPD + données inaccessibles.
--
-- Étapes (toutes idempotentes) :
--   1. suppression des lignes orphelines (sans propriétaire existant) ;
--   2. alignement du type dives.user_id sur users.id ;
--   3. ajout des FK ON DELETE CASCADE absentes, détectées via
--      information_schema (quel que soit le nom de la contrainte existante :
--      les FK créées par 000 portent des noms auto-générés *_ibfk_N).
--
-- ATTENTION : destructif pour les orphelins. Faire une sauvegarde avant (le
-- script deploy/deploy-backend.sh lance la sauvegarde si elle est installée).

-- ── 1. Orphelins ────────────────────────────────────────────────────────────
DELETE FROM sessions           WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM divers             WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM sites              WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM dive_runtime_state WHERE dive_id NOT IN (SELECT id FROM dives);
DELETE FROM dives              WHERE user_id NOT IN (SELECT id FROM users);

-- ── 2. Type de dives.user_id (INT → INT UNSIGNED, comme users.id) ─────────────
ALTER TABLE dives MODIFY user_id INT UNSIGNED NOT NULL;

-- ── 3. FK manquantes ────────────────────────────────────────────────────────
-- dives.user_id → users.id
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dives'
                       AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE dives ADD CONSTRAINT fk_dives_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- sessions.user_id → users.id (présente depuis 000, garde-fou pour les vieilles instances)
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions'
                       AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE sessions ADD CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- divers.user_id → users.id
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'divers'
                       AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE divers ADD CONSTRAINT fk_divers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- sites.user_id → users.id
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sites'
                       AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE sites ADD CONSTRAINT fk_sites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- dive_runtime_state.dive_id → dives.id (présente depuis 001, garde-fou)
SET @fk_missing := (SELECT COUNT(*) = 0 FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dive_runtime_state'
                       AND COLUMN_NAME = 'dive_id' AND REFERENCED_TABLE_NAME = 'dives');
SET @ddl := IF(@fk_missing,
    'ALTER TABLE dive_runtime_state ADD CONSTRAINT fk_drs_dive FOREIGN KEY (dive_id) REFERENCES dives (id) ON DELETE CASCADE',
    'DO 0');
PREPARE fk_stmt FROM @ddl;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
