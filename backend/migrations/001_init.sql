-- DP Assistant — schéma initial
-- Exécuté automatiquement par Db.php si la table users n'existe pas

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_sub    VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  nom           VARCHAR(100) DEFAULT '',
  prenom        VARCHAR(100) DEFAULT '',
  avatar_url    VARCHAR(500) DEFAULT '',
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  -- Infos club / association
  club_nom      VARCHAR(200) DEFAULT '',
  club_numero   VARCHAR(50)  DEFAULT '',   -- numéro de club FFESSM
  club_siret    VARCHAR(50)  DEFAULT '',   -- SIRET / numéro d'entreprise
  -- Timestamps
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME,
  UNIQUE KEY uq_google_sub (google_sub),
  UNIQUE KEY uq_email (email),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id         CHAR(64) PRIMARY KEY,           -- random_bytes(32) hex
  user_id    INT UNSIGNED NOT NULL,
  ip_addr    VARCHAR(45) DEFAULT '',
  user_agent VARCHAR(500) DEFAULT '',
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user    (user_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS divers (
  id         CHAR(36) PRIMARY KEY,           -- UUID v4
  user_id    INT UNSIGNED NOT NULL,
  nom        VARCHAR(100) NOT NULL,
  prenom     VARCHAR(100) NOT NULL DEFAULT '',
  licence    VARCHAR(50)  DEFAULT '',
  niveau     VARCHAR(30)  DEFAULT '',
  qualifs    JSON,                            -- ["PN","RIFAP",...]
  medical    DATE,
  notes      TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_nom  (nom, prenom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sites (
  id              CHAR(36) PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  nom             VARCHAR(200) NOT NULL,
  milieu          ENUM('En mer','Lac','Carrière','Piscine','Autre') DEFAULT 'En mer',
  profondeur_max  DECIMAL(5,1),
  coordonnees     JSON,                       -- {"lat":46.1,"lng":7.0}
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
