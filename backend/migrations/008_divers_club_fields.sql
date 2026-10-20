-- Migration 008 — Champs plongeurs pour l'import club (VPDive, CSV) et les alertes.
--
--   source / external_id : provenance de la fiche ('manuel' saisie dans
--     l'application, 'vpdive', 'csv'…) et identifiant dans le logiciel source.
--     UNIQUE (club_id, source, external_id) : l'import est idempotent par ce
--     couple (plusieurs NULL autorisés pour les fiches manuelles).
--   licence_fin : date de fin de validité de la licence (alerte 30 jours).
--   representant_legal : nom / coordonnées du représentant légal d'un mineur
--     (texte libre, 200 caractères).
--   autorisation_parentale_saison : saison FFESSM couverte par l'autorisation
--     parentale, format 'AAAA-AAAA' (ex. '2026-2027').
--
-- Aucune donnée de santé ajoutée (le CACI reste une simple date : divers.medical).

ALTER TABLE divers ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manuel';
ALTER TABLE divers ADD COLUMN IF NOT EXISTS external_id VARCHAR(64) NULL;
ALTER TABLE divers ADD COLUMN IF NOT EXISTS licence_fin DATE NULL;
ALTER TABLE divers ADD COLUMN IF NOT EXISTS representant_legal VARCHAR(200) NULL;
ALTER TABLE divers ADD COLUMN IF NOT EXISTS autorisation_parentale_saison VARCHAR(9) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_divers_club_external ON divers (club_id, source, external_id);
CREATE INDEX IF NOT EXISTS idx_divers_club_licence ON divers (club_id, licence);
