<?php
declare(strict_types=1);

/**
 * Règles applicables selon la juridiction de la plongée (portage de
 * src/domain/rules-for.js) : Code du sport (Rules) ou Polynésie française
 * (PfRules) ; toute autre valeur → Code du sport.
 */
final class RulesFor
{
    /** @return class-string<Rules>|class-string<PfRules> */
    public static function forJurisdiction(?string $jurisdiction): string
    {
        return Jurisdiction::normalize($jurisdiction) === 'PF' ? PfRules::class : Rules::class;
    }
}
