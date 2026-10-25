-- Migration 012 — Juridiction réglementaire d'origine du club.
--
-- 'FR' : Code du sport (annexes III-15 a à III-18 c) ; 'PF' : Polynésie
-- française (loi du pays n° 2017-44, arrêté n° 199 CM du 15/02/2018).
-- La réglementation applicable à une plongée est celle du LIEU (pays du
-- site, cf. src/domain/jurisdiction.js ↔ lib/Jurisdiction.php) ; celle du
-- club ne sert que de repli quand le pays du site est inconnu.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS jurisdiction ENUM('FR','PF') NOT NULL DEFAULT 'FR' AFTER structure_type;
