-- Migration 011 — Idempotence de POST /api/dives par club ; participants
-- calculés une seule fois.
--
-- 1. client_uuid unique PAR CLUB (et non plus par auteur) : POST /api/dives
--    cherche la plongée par (club_id, client_uuid). Un client_uuid déjà
--    utilisé dans un autre club, ou par une plongée supprimée, est refusé
--    (409 CLIENT_UUID_CONFLICT) au lieu d'être confondu avec un rejeu.
--    Doublons existants dans un même club (deux auteurs, cas pathologique) :
--    on garde le client_uuid de la plongée non supprimée, puis la plus
--    ancienne ; les autres passent à NULL (la plongée reste, seul son lien
--    d'idempotence disparaît). dives.updated_at est préservé (curseur de sync).
-- 2. L'ancien index (user_id, client_uuid) est supprimé ; un index simple
--    sur user_id le remplace pour la clé étrangère « auteur ».
-- 3. dives.participants_at : date du calcul de dive_participants, posée même
--    à zéro participant (ClubStats ne recalcule plus ces plongées à chaque
--    appel). Rattrapage : plongées ayant déjà des participants, ou archivées
--    depuis la phase 5 (documents_status renseigné : calculés à l'archivage).
--
-- Chaque instruction est rejouable (MariaDB valide le DDL implicitement).

UPDATE dives d
  JOIN dives k
    ON k.club_id = d.club_id AND k.client_uuid = d.client_uuid AND k.id <> d.id
   AND ((k.deleted_at IS NULL AND d.deleted_at IS NOT NULL)
        OR ((k.deleted_at IS NULL) = (d.deleted_at IS NULL)
            AND (k.created_at < d.created_at OR (k.created_at = d.created_at AND k.id < d.id))))
   SET d.client_uuid = NULL, d.updated_at = d.updated_at
 WHERE d.client_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dives_club_client ON dives (club_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_dives_author ON dives (user_id);
DROP INDEX IF EXISTS uniq_dives_client ON dives;

ALTER TABLE dives ADD COLUMN IF NOT EXISTS participants_at DATETIME NULL;

UPDATE dives SET participants_at = COALESCE(documents_updated_at, NOW()), updated_at = updated_at
 WHERE participants_at IS NULL
   AND (documents_status IS NOT NULL OR EXISTS (SELECT 1 FROM dive_participants p WHERE p.dive_id = dives.id));
