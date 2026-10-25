-- Migration 013 — Profil polynésien d'un plongeur (arrêté n° 199 CM).
--
-- Objet JSON saisi par le DP (cf. src/domain/pf/pf-profile.js ↔
-- lib/PfProfile.php) : aptitudes PE/PA, mélanges PN/PTH, fonctions
-- ENS/GP/DP, stagiaire, brevets, diplôme homologué, patenté, date de
-- l'attestation de condition physique (annexe XVII). NULL : profil déduit
-- des seuls niveaux FFESSM.

ALTER TABLE divers ADD COLUMN IF NOT EXISTS pf JSON NULL;
