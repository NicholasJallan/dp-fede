<?php
declare(strict_types=1);

/**
 * Accès base des plongées partagé par les routes (dives, documents, PDF).
 */
class DiveStore
{
    /**
     * Plongée active du club par id serveur ou client_uuid. Un id serveur
     * prime sur un client_uuid identique (ORDER BY (id = ?) DESC).
     * $columns : liste de colonnes interne (jamais d'entrée utilisateur).
     */
    public static function findActive(string $idOrUuid, string $clubId, string $columns = 'id, status'): ?array
    {
        return Db::row(
            "SELECT {$columns} FROM dives
              WHERE (id=? OR client_uuid=?) AND club_id=? AND deleted_at IS NULL
              ORDER BY (id = ?) DESC LIMIT 1",
            [$idOrUuid, $idOrUuid, $clubId, $idOrUuid]
        );
    }

    /** Toutes les plongées portant ce client_uuid (tous clubs, supprimées comprises). */
    public static function rowsByClientUuid(string $clientUuid): array
    {
        return Db::all('SELECT id, club_id, deleted_at FROM dives WHERE client_uuid=?', [$clientUuid]);
    }

    /** État d'exécution stocké (dive_runtime_state, à défaut l'ancienne colonne). */
    public static function storedRenderState(string $diveId): ?string
    {
        $r = Db::row(
            'SELECT COALESCE(r.state, d.render_state) AS state
               FROM dives d LEFT JOIN dive_runtime_state r ON r.dive_id = d.id WHERE d.id=?',
            [$diveId]
        );
        return isset($r['state']) ? (string)$r['state'] : null;
    }

    /**
     * Écrit render_state (sans toucher dives.updated_at) tant que la plongée
     * n'est PAS archivée : la condition est dans la même instruction que
     * l'écriture, une archivage concurrent ne peut pas être contourné.
     * Retourne false si la plongée est archivée (rien n'a été écrit).
     */
    public static function writeRuntimeStateUnlessArchived(string $diveId, string $json): bool
    {
        $st = Db::q(
            "INSERT INTO dive_runtime_state (dive_id, state)
             SELECT id, ? FROM dives WHERE id=? AND status<>'archived'
             ON DUPLICATE KEY UPDATE state=?",
            [$json, $diveId, $json]
        );
        if ($st->rowCount() > 0) return true;
        // 0 ligne : état inchangé, ou plongée archivée entre-temps.
        $row = Db::row('SELECT status FROM dives WHERE id=?', [$diveId]);
        return ($row['status'] ?? null) !== 'archived';
    }
}
