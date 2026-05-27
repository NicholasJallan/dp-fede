CREATE TABLE IF NOT EXISTS archives (
  id           VARCHAR(36)   PRIMARY KEY,
  user_id      INT           NOT NULL,
  site_nom     VARCHAR(255),
  date_plongee VARCHAR(50),
  dp_nom       VARCHAR(200),
  dp_qual      VARCHAR(20),
  activite     VARCHAR(50),
  answers      MEDIUMTEXT,
  palanquees   MEDIUMTEXT,
  drive_link   VARCHAR(500),
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_archives_user (user_id)
)
