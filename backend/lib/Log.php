<?php
declare(strict_types=1);

/**
 * Logging structuré des actions métier.
 * Ligne NDJSON par action dans /var/log/dp-fede.log (chown www-data:www-data 640,
 * rotation : deploy/logrotate-dp-fede).
 * Ne logue jamais answers/palanquees entiers — uniquement les identifiants.
 *
 * L'acteur (utilisateur authentifié) est fixé par Auth::current() /
 * Auth::createSession() via Log::setActor(). L'API n'utilise pas $_SESSION :
 * l'ancienne lecture de $_SESSION['user_id'] donnait toujours null.
 */
class Log {
    private const LOG_FILE = '/var/log/dp-fede.log';

    private static ?int $actorId = null;

    public static function setActor(?int $userId): void {
        self::$actorId = $userId;
    }

    public static function actor(): ?int {
        return self::$actorId;
    }

    public static function action(string $kind, ?array $context = null): void {
        $entry = self::buildEntry($kind, $context, self::$actorId, $_SERVER);
        @file_put_contents(
            self::LOG_FILE,
            json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
            FILE_APPEND | LOCK_EX
        );
    }

    /**
     * Construit l'entrée de log (fonction pure, testée).
     * Un user_id explicite dans $context (ex. login, avant toute session)
     * prime sur l'acteur courant.
     */
    public static function buildEntry(string $kind, ?array $context, ?int $actorId, array $server): array {
        $userId = $actorId;
        if (isset($context['user_id']) && is_numeric($context['user_id'])) {
            $userId = (int)$context['user_id'];
            unset($context['user_id']);
            if ($context === []) $context = null;
        }
        return [
            'ts'      => date('c'),
            'kind'    => $kind,
            'user_id' => $userId,
            'ip'      => (string)($server['REMOTE_ADDR'] ?? ''),
            'path'    => (string)strtok((string)($server['REQUEST_URI'] ?? ''), '?'),
            'ctx'     => $context,
        ];
    }
}
