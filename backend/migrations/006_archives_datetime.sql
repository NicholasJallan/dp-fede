-- Migration 006 — passer archives.date_plongee de VARCHAR(50) à DATETIME
-- Justification : permet le tri SQL par date, le filtrage par plage,
-- et un index efficace. Les anciennes valeurs sont au format "YYYY-MM-DDTHH:mm".
--
-- Stratégie :
-- 1. Ajouter une colonne date_plongee_dt DATETIME nullable
-- 2. Populer par STR_TO_DATE — les valeurs valides ISO-like se convertissent
-- 3. Garder l'ancienne colonne en backup (renommée), supprimer plus tard
-- 4. Renommer la nouvelle colonne en date_plongee
-- 5. Ajouter un index sur (user_id, date_plongee DESC)

ALTER TABLE archives
  ADD COLUMN date_plongee_dt DATETIME NULL AFTER date_plongee;

-- Convertir les anciennes valeurs (formats acceptés : ISO datetime, ISO date, vide)
-- Le ON CONFLICT n'existe pas en MariaDB ; STR_TO_DATE renvoie NULL si parse échoue.
UPDATE archives
SET date_plongee_dt = COALESCE(
  STR_TO_DATE(REPLACE(date_plongee, 'T', ' '), '%Y-%m-%d %H:%i'),
  STR_TO_DATE(date_plongee, '%Y-%m-%d')
)
WHERE date_plongee IS NOT NULL AND date_plongee <> '';

-- Garder l'ancien VARCHAR en backup (au cas où une valeur exotique n'aurait pas
-- pu être convertie ci-dessus, on peut auditer après coup).
ALTER TABLE archives
  CHANGE COLUMN date_plongee date_plongee_legacy VARCHAR(50);

ALTER TABLE archives
  CHANGE COLUMN date_plongee_dt date_plongee DATETIME NULL;

CREATE INDEX idx_archives_user_date ON archives (user_id, date_plongee DESC);
