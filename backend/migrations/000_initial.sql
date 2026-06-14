-- Migration 000 — schéma initial (snapshot du contenu de Db::migrate() v2026-06-13).
-- Sur une base déjà existante, Migrator::run() détecte que cette migration a
-- déjà été appliquée (table 'users' présente) et la marque directement en DB
-- sans ré-exécuter les CREATE TABLE.

CREATE TABLE IF NOT EXISTS users (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    google_sub       VARCHAR(255) NOT NULL,
    email            VARCHAR(255) NOT NULL,
    nom              VARCHAR(100) DEFAULT '',
    prenom           VARCHAR(100) DEFAULT '',
    avatar_url       VARCHAR(500) DEFAULT '',
    role             ENUM('admin','user') NOT NULL DEFAULT 'user',
    club_nom         VARCHAR(200) DEFAULT '',
    club_numero      VARCHAR(50)  DEFAULT '',
    club_siret       VARCHAR(50)  DEFAULT '',
    structure_type   VARCHAR(20)  NULL,
    president_prenom VARCHAR(100) NULL,
    president_nom    VARCHAR(100) NULL,
    president_tel    VARCHAR(30)  NULL,
    urgence_defaut   VARCHAR(20)  NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login       DATETIME,
    UNIQUE KEY uq_google_sub (google_sub),
    UNIQUE KEY uq_email      (email),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
    id         CHAR(64)     PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    ip_addr    VARCHAR(45)  DEFAULT '',
    user_agent VARCHAR(500) DEFAULT '',
    expires_at DATETIME     NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user    (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS divers (
    id               CHAR(36)     PRIMARY KEY,
    user_id          INT UNSIGNED NOT NULL,
    nom              VARCHAR(100) NOT NULL,
    prenom           VARCHAR(100) NOT NULL DEFAULT '',
    licence          VARCHAR(50)  DEFAULT '',
    niveau           VARCHAR(30)  DEFAULT '',
    niveau_plongeur  VARCHAR(3)   NULL,
    niveau_encadrant VARCHAR(4)   NULL,
    aptitudes_sup    JSON         NULL,
    qualifs          JSON,
    medical          DATE,
    notes            TEXT,
    deleted_at       DATETIME     NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user                (user_id),
    INDEX idx_nom                 (nom, prenom),
    INDEX idx_divers_user_updated (user_id, updated_at),
    INDEX idx_divers_user_deleted (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sites (
    id             CHAR(36)     PRIMARY KEY,
    user_id        INT UNSIGNED NOT NULL,
    nom            VARCHAR(200) NOT NULL,
    milieu         ENUM('En mer','Lac','Carrière','Piscine','Autre') DEFAULT 'En mer',
    profondeur_max DECIMAL(5,1),
    coordonnees    JSON,
    depart_bord    TINYINT(1)   NOT NULL DEFAULT 0,
    depart_bateau  TINYINT(1)   NOT NULL DEFAULT 0,
    shot_line      TINYINT(1)   NOT NULL DEFAULT 0,
    ville          VARCHAR(150) NULL,
    pays           VARCHAR(80)  NULL,
    pays_code      VARCHAR(3)   NULL,
    region         VARCHAR(150) NULL,
    acces_secours  VARCHAR(500) NULL,
    caisson        VARCHAR(500) NULL,
    notes          TEXT,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at     DATETIME     NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user               (user_id),
    INDEX idx_sites_user_updated (user_id, updated_at),
    INDEX idx_sites_user_deleted (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dives (
    id           VARCHAR(36)  PRIMARY KEY,
    user_id      INT          NOT NULL,
    client_uuid  VARCHAR(36)  NULL,
    site_nom     VARCHAR(255),
    date_plongee DATETIME     NULL,
    dp_nom       VARCHAR(200),
    dp_qual      VARCHAR(20),
    activite     VARCHAR(50),
    status       ENUM('prepared','in_progress','archived') NOT NULL DEFAULT 'archived',
    planned_at   DATETIME     NULL,
    started_at   DATETIME     NULL,
    closed_at    DATETIME     NULL,
    answers      MEDIUMTEXT,
    palanquees   MEDIUMTEXT,
    render_state MEDIUMTEXT   NULL,
    drive_link   VARCHAR(500),
    deleted_at   DATETIME     NULL,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_dives_client     (user_id, client_uuid),
    INDEX idx_dives_user_date        (user_id, date_plongee DESC),
    INDEX idx_dives_user_status      (user_id, status, planned_at DESC),
    INDEX idx_dives_user_deleted     (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       VARCHAR(64)  NOT NULL,
    ident        VARCHAR(64)  NOT NULL,
    count        INT UNSIGNED NOT NULL DEFAULT 0,
    window_start DATETIME     NOT NULL,
    PRIMARY KEY (bucket, ident)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
