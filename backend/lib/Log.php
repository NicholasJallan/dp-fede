<?php
declare(strict_types=1);

/**
 * Logging structuré des actions métier.
 * Ligne NDJSON par action dans /var/log/dp-fede.log (chown www-data:www-data 640).
 * Ne logue jamais answers/palanquees entiers — uniquement les identifiants.
 */
class Log {
    private const LOG_FILE = '/var/log/dp-fede.log';

    public static function action(string $kind, ?array $context = null): void {
        $entry = [
            'ts'      => date('c'),
            'kind'    => $kind,
            'user_id' => $_SESSION['user_id'] ?? null,
            'ip'      => $_SERVER['REMOTE_ADDR'] ?? '',
            'path'    => $_SERVER['REQUEST_URI'] ?? '',
            'ctx'     => $context,
        ];
        @file_put_contents(
            self::LOG_FILE,
            json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n",
            FILE_APPEND | LOCK_EX
        );
    }
}
