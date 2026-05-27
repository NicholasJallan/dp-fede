-- Migration 002 — Schema v2 : nouveaux champs divers, sites, users

ALTER TABLE divers
  ADD COLUMN IF NOT EXISTS niveau_plongeur VARCHAR(3)  NULL,
  ADD COLUMN IF NOT EXISTS niveau_encadrant VARCHAR(4) NULL,
  ADD COLUMN IF NOT EXISTS aptitudes_sup    JSON       NULL;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS depart_bord    TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depart_bateau  TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS structure_type VARCHAR(20) NULL;

-- Migrer niveau → niveau_plongeur / niveau_encadrant
UPDATE divers SET niveau_plongeur  = niveau          WHERE niveau IN ('N1','N2','N3') AND niveau_plongeur IS NULL;
UPDATE divers SET niveau_encadrant = 'N4', niveau_plongeur = 'N3' WHERE niveau IN ('N4','GP')          AND niveau_encadrant IS NULL;
UPDATE divers SET niveau_encadrant = 'E1', niveau_plongeur = 'N3' WHERE niveau = 'E1'                  AND niveau_encadrant IS NULL;
UPDATE divers SET niveau_encadrant = 'E2', niveau_plongeur = 'N3' WHERE niveau = 'E2'                  AND niveau_encadrant IS NULL;
UPDATE divers SET niveau_encadrant = 'E3', niveau_plongeur = 'N3' WHERE niveau IN ('E3','MF1','BEES1') AND niveau_encadrant IS NULL;
UPDATE divers SET niveau_encadrant = 'E4', niveau_plongeur = 'N3' WHERE niveau IN ('E4','MF2')         AND niveau_encadrant IS NULL;
UPDATE divers SET niveau_encadrant = 'N5', niveau_plongeur = 'N3' WHERE niveau = 'P5'                  AND niveau_encadrant IS NULL;
UPDATE divers SET niveau_plongeur  = 'N3'                          WHERE niveau IN ('DEJEPS','DESJEPS') AND niveau_plongeur IS NULL;
