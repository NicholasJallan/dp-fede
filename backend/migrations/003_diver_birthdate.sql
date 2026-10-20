-- Migration 003 — Date de naissance des plongeurs.
--
-- Pourquoi : âge minimal en autonomie (Code du sport A322-73 : PA-12/PA-20
-- dès 16 ans, PA-40 dès 17 ans ; A322-89 : PA-60 réservé aux majeurs ;
-- autonomie des mineurs limitée à l'air et au nitrox). Donnée facultative :
-- sans elle, l'application affiche un avertissement au DP.

ALTER TABLE divers ADD COLUMN IF NOT EXISTS date_naissance DATE NULL AFTER licence;
