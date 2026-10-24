<?php
declare(strict_types=1);

/**
 * Dates des plongées (date_plongee, planned_at, started_at, closed_at) :
 * format du front (YYYY-MM-DDTHH:mm, ou ISO 8601 avec fuseau) ↔ DATETIME.
 */
final class DiveDates
{
    private const array LOCAL_FORMATS = ['Y-m-d\TH:i', 'Y-m-d\TH:i:s', 'Y-m-d H:i', 'Y-m-d H:i:s', 'Y-m-d'];

    public static function toMysql(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') return null;
        foreach (self::LOCAL_FORMATS as $fmt) {
            $dt = DateTimeImmutable::createFromFormat($fmt, $raw);
            if ($dt !== false) return $dt->format('Y-m-d H:i:s');
        }
        // ISO 8601 avec fuseau (ex. toISOString() → 2026-06-12T06:30:00.000Z) :
        // converti dans le fuseau du serveur, comme les dates saisies localement.
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/', $raw)) {
            try {
                $dt = new DateTimeImmutable($raw);
                return $dt->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d H:i:s');
            } catch (Exception) {
                return null;
            }
        }
        return null;
    }

    public static function fromMysql(?string $sqlDate): ?string
    {
        if (!$sqlDate) return null;
        $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $sqlDate);
        return $dt ? $dt->format('Y-m-d\TH:i') : $sqlDate;
    }
}
