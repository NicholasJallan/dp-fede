<?php
declare(strict_types=1);

/** Cycle de vie d'une plongée (colonne dives.status). */
enum DiveStatus: string
{
    case Prepared   = 'prepared';
    case InProgress = 'in_progress';
    case Archived   = 'archived';

    /** Statut reçu du client : chaîne exacte seulement (true, 1… → null). */
    public static function fromInput(mixed $value): ?self
    {
        return is_string($value) ? self::tryFrom($value) : null;
    }
}
