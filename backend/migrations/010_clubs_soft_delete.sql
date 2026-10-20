-- Migration 010 — Suppression d'un club avec conservation légale (A322-72).
--
-- La fiche de sécurité doit être conservée un an par l'établissement
-- (Code du sport, A322-72) : exception au droit à l'effacement (RGPD,
-- art. 17.3.b). Supprimer un club (directement ou via la suppression du
-- compte de son unique membre) ne supprime donc plus tout immédiatement :
--   - le club est « soft-deleted » (deleted_at) et n'a plus aucun membre ;
--   - les plongées archivées de moins de 365 jours, leurs documents PDF,
--     participants et runtime state, ainsi que les plongeurs et sites qu'elles
--     référencent, sont CONSERVÉS jusqu'à retention_until (inaccessibles par
--     l'API : aucun membre) ;
--   - tout le reste est supprimé immédiatement.
-- bin/purge.php supprime définitivement le club et ces données (lignes et
-- fichiers) une fois retention_until dépassée.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS retention_until DATE NULL;
CREATE INDEX IF NOT EXISTS idx_clubs_deleted ON clubs (deleted_at, retention_until);
