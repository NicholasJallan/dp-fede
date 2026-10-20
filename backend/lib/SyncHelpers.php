<?php
declare(strict_types=1);

// Helpers partagés par les routes qui supportent le pull incrémental
// (divers, sites, dives) et l'idempotence des écritures (UUID client).

class SyncHelpers {
    /**
     * Parse un paramètre ?since= envoyé par le client. Accepte les formats
     * ISO 8601 émis par le front (Date#toISOString) ainsi que les variantes
     * MariaDB. Aborte en 422 si invalide.
     */
    public static function parseSinceParam(string $raw): string {
        $raw = trim($raw);
        $candidates = ['Y-m-d\TH:i:s', 'Y-m-d\TH:i', 'Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d'];
        foreach ($candidates as $fmt) {
            $dt = DateTimeImmutable::createFromFormat($fmt, $raw);
            if ($dt !== false) return $dt->format('Y-m-d H:i:s');
        }
        // Format avec timezone (Z, +HH:MM) — strtotime gère bien.
        $ts = strtotime($raw);
        if ($ts !== false) return date('Y-m-d H:i:s', $ts);
        Json::abort(422, 'Paramètre since invalide');
    }

    /**
     * Validation d'un UUID v1/v4 envoyé par le client (en hexadécimal canonique
     * avec tirets). Le serveur ne fait pas confiance à n'importe quelle chaîne
     * en PK ; ce filtre évite l'injection de PK pourries.
     */
    public static function isValidUuid(?string $s): bool {
        if (!$s) return false;
        return (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $s);
    }

    /** Convertit un DATETIME MySQL en ISO 8601 (UTC implicite côté serveur). */
    public static function toIso(?string $sqlDate): ?string {
        if (!$sqlDate) return null;
        $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $sqlDate);
        return $dt ? $dt->format('Y-m-d\TH:i:s') : null;
    }
    /**
     * INSERT … ON DUPLICATE KEY UPDATE limité au club (POST idempotents de
     * plongeurs et sites avec id client). Chaque colonne mise à jour l'est
     * via IF(club_id = VALUES(club_id), …) : si l'id appartient à un autre
     * club, la ligne existante reste intacte — atomiquement, sans SELECT
     * préalable. club_id n'étant jamais réaffecté, la garde vaut pour toutes
     * les colonnes. L'appelant relit la ligne (id + club) : absente → 404.
     *
     * $table et les noms de colonnes sont des constantes internes (validés).
     *
     * @param array<string,mixed> $cols   colonne => valeur (id et club_id requis)
     * @param list<string>        $insertOnly colonnes jamais mises à jour (auteur…)
     * @return array{0: string, 1: list<mixed>} [sql, paramètres]
     */
    public static function clubScopedUpsert(string $table, array $cols, array $insertOnly): array {
        $ident = '/^[a-z_][a-z0-9_]*$/';
        if (!preg_match($ident, $table)) throw new InvalidArgumentException("Table invalide : {$table}");
        if (!array_key_exists('id', $cols) || !array_key_exists('club_id', $cols)) {
            throw new InvalidArgumentException('id et club_id sont requis');
        }
        foreach (array_keys($cols) as $c) {
            if (!preg_match($ident, (string)$c)) throw new InvalidArgumentException("Colonne invalide : {$c}");
        }
        $guard     = 'club_id = VALUES(club_id)';
        $updatable = array_diff(array_keys($cols), array_merge(['id', 'club_id'], $insertOnly));
        $updates   = array_map(static fn(string $c): string => "{$c} = IF({$guard}, VALUES({$c}), {$c})", array_values($updatable));
        $updates[] = "deleted_at = IF({$guard}, NULL, deleted_at)";
        $sql = "INSERT INTO {$table} (" . implode(', ', array_keys($cols)) . ')'
             . ' VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')'
             . ' ON DUPLICATE KEY UPDATE ' . implode(', ', $updates);
        return [$sql, array_values($cols)];
    }
}
