-- Migration 009 — Archivage serveur des fiches (A322-72) et participants.
--
-- A322-72 : la fiche de sécurité est conservée un an par l'établissement.
-- À l'archivage d'une plongée, le serveur génère fiche + check-list PDF et
-- les stocke hors web root (config 'documents.path', défaut
-- /var/lib/dp-fede/documents). dive_documents référence ces fichiers
-- (chemin RELATIF à la racine de stockage + empreinte SHA-256 vérifiée au
-- téléchargement).
--
-- dives.documents_status : NULL (non archivée / archivée avant cette
-- migration), 'pending' (génération en cours), 'ok', 'error' (échec journalisé,
-- relançable : POST /api/dives/:id/documents ou bin/documents.php).
--
-- dive_participants : une ligne par membre de palanquée (+ une ligne 'dp'),
-- remplie à l'archivage ; alimente les statistiques du club.

ALTER TABLE dives ADD COLUMN IF NOT EXISTS documents_status ENUM('pending','ok','error') NULL;
ALTER TABLE dives ADD COLUMN IF NOT EXISTS documents_updated_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS dive_documents (
    id         CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    dive_id    VARCHAR(36)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    club_id    CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    type       ENUM('fiche','checklist') NOT NULL,
    path       VARCHAR(500) NOT NULL,
    sha256     CHAR(64)     NOT NULL,
    bytes      INT UNSIGNED NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_dive_documents_type (dive_id, type),
    INDEX idx_dive_documents_club (club_id),
    CONSTRAINT fk_dive_documents_dive FOREIGN KEY (dive_id) REFERENCES dives (id) ON DELETE CASCADE,
    CONSTRAINT fk_dive_documents_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dive_participants (
    id                BIGINT UNSIGNED AUTO_INCREMENT,
    dive_id           VARCHAR(36)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    club_id           CHAR(36)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    diver_id          CHAR(36)     NULL,
    palanquee         SMALLINT UNSIGNED NULL,
    pal_type          VARCHAR(12)  NULL,
    role              VARCHAR(12)  NOT NULL,
    aptitude          VARCHAR(20)  NULL,
    prof_max_prevue   DECIMAL(5,1) NULL,
    prof_max_realisee DECIMAL(5,1) NULL,
    duree_realisee    SMALLINT UNSIGNED NULL,
    date_plongee      DATETIME     NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_dive_participants_dive (dive_id),
    INDEX idx_dive_participants_club_date (club_id, date_plongee),
    INDEX idx_dive_participants_club_diver (club_id, diver_id),
    CONSTRAINT fk_dive_participants_dive FOREIGN KEY (dive_id) REFERENCES dives (id) ON DELETE CASCADE,
    CONSTRAINT fk_dive_participants_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Colonnes de dive_participants :
--   diver_id          NULL pour un baptême (personne hors annuaire)
--   palanquee         n° 1…n ; NULL pour la ligne 'dp'
--   pal_type          bapteme / formation / guidee / exploration
--   role              dp / encadrant / guide / plongeur / bapteme
--   duree_realisee    minutes
--   date_plongee      copie de dives.date_plongee (statistiques par période)
