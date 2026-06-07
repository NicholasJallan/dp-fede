<?php
declare(strict_types=1);

// Helpers partagés par les routes qui supportent le pull incrémental
// (divers, sites, archives) et l'idempotence des écritures (UUID client).

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
}
