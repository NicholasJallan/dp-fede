<?php
declare(strict_types=1);

/**
 * Règles pures (testées, sans base) sur les plongées :
 *   - immutabilité d'une fiche archivée (A322-72) : render_state figé ;
 *   - régénération des PDF archivés : seulement en erreur ou document
 *     manquant / altéré, jamais pendant une génération en cours ;
 *   - idempotence de POST /api/dives par client_uuid, limitée au club.
 *
 * Codes d'erreur stables renvoyés au client : cf. docs/api-club.md.
 */
class DivePolicy
{
    public const ARCHIVED_IMMUTABLE   = 'ARCHIVED_IMMUTABLE';
    public const CLIENT_UUID_CONFLICT = 'CLIENT_UUID_CONFLICT';
    public const DOCUMENTS_COMPLETE   = 'DOCUMENTS_COMPLETE';
    public const DOCUMENTS_PENDING    = 'DOCUMENTS_PENDING';

    /** Une génération 'pending' plus ancienne est considérée abandonnée (cf. bin/documents.php --retry). */
    public const STALE_PENDING_MINUTES = 15;

    public const ARCHIVED_MESSAGE = 'Plongée archivée : la fiche de sécurité et son état d\'exécution ne sont plus modifiables (art. A322-72 du Code du sport)';

    // ── Plongée archivée ───────────────────────────────────────────────────

    /**
     * Vrai si $sent (render_state reçu) est identique à l'état stocké :
     * rejeu idempotent du PATCH d'archivage par l'outbox.
     *
     * @param mixed $sent
     */
    public static function sameRenderState($sent, ?string $storedJson): bool
    {
        if (!is_array($sent) || $storedJson === null || $storedJson === '') return false;
        $encoded = json_encode($sent, JSON_UNESCAPED_UNICODE);
        if ($encoded === $storedJson) return true;
        $stored = json_decode($storedJson, true);
        return is_array($stored) && $stored == $sent;
    }

    /**
     * Message d'erreur si un PATCH sur une plongée ARCHIVÉE modifie son état
     * d'exécution (render_state), null sinon. drive_link reste modifiable ;
     * answers / palanquees sont ignorés (comportement historique).
     */
    public static function archivedPatchViolation(array $body, ?string $storedRenderStateJson): ?string
    {
        if (!isset($body['render_state'])) return null; // absent ou null : non envoyé
        return self::sameRenderState($body['render_state'], $storedRenderStateJson) ? null : self::ARCHIVED_MESSAGE;
    }

    // ── Documents archivés ─────────────────────────────────────────────────

    /**
     * Types de document à (re)générer : ceux qui ne sont pas intègres. Un
     * document intègre n'est jamais remplacé.
     *
     * @param array<string,string> $states type => 'intact' | 'missing' | 'altered'
     * @return list<string>
     */
    public static function documentsToGenerate(array $states): array
    {
        return array_values(array_filter(
            DivePdf::TYPES,
            static fn(string $t): bool => ($states[$t] ?? 'missing') !== 'intact'
        ));
    }

    /**
     * Refus (code + message) d'une régénération manuelle, ou null si elle est
     * autorisée : documents_status 'error', ou document manquant / altéré,
     * hors génération en cours (pending de moins de 15 min).
     *
     * @param array<string,string> $states type => 'intact' | 'missing' | 'altered'
     * @return array{code: string, message: string}|null
     */
    public static function regenerationRefusal(?string $status, array $states, ?string $statusUpdatedAt, DateTimeImmutable $now): ?array
    {
        if ($status === 'pending' && !self::isStale($statusUpdatedAt, $now)) {
            return ['code' => self::DOCUMENTS_PENDING,
                    'message' => 'Génération des documents en cours : réessayez dans quelques minutes'];
        }
        if ($status === 'error' || self::documentsToGenerate($states) !== []) return null;
        return ['code' => self::DOCUMENTS_COMPLETE,
                'message' => 'Documents archivés complets et intègres : la régénération n\'est possible qu\'en cas d\'erreur ou de document manquant'];
    }

    private static function isStale(?string $updatedAt, DateTimeImmutable $now): bool
    {
        if ($updatedAt === null || $updatedAt === '') return true;
        $at = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', substr($updatedAt, 0, 19));
        if (!$at) return true;
        return $at <= $now->modify('-' . self::STALE_PENDING_MINUTES . ' minutes');
    }

    // ── Idempotence de POST /api/dives ─────────────────────────────────────

    /**
     * Issue d'un POST portant un client_uuid, d'après TOUTES les plongées qui
     * le portent (tous clubs, supprimées comprises) :
     *   - ['duplicate', id] : plongée active du club → rejeu de l'outbox ;
     *   - ['conflict', null] : uuid d'un autre club ou d'une plongée supprimée ;
     *   - ['new', null]      : inconnu.
     *
     * @param list<array{id: string, club_id: ?string, deleted_at: ?string}> $rows
     * @return array{0: string, 1: ?string}
     */
    public static function clientUuidOutcome(array $rows, string $clubId): array
    {
        foreach ($rows as $r) {
            if ((string)($r['club_id'] ?? '') === $clubId && empty($r['deleted_at'])) {
                return ['duplicate', (string)$r['id']];
            }
        }
        return $rows ? ['conflict', null] : ['new', null];
    }
}
