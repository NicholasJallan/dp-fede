<?php
declare(strict_types=1);

/**
 * Règles applicables selon la juridiction de la plongée (portage de
 * src/domain/rules-for.js). La Polynésie (PF) n'est pas encore transcrite :
 * toute juridiction retombe sur le Code du sport (Rules).
 */
final class RulesFor
{
    /** @return class-string<Rules> */
    public static function forJurisdiction(?string $jurisdiction): string
    {
        return Rules::class;
    }
}
