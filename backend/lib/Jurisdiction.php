<?php
declare(strict_types=1);

/**
 * Juridiction réglementaire d'une plongée : 'FR' (Code du sport) ou 'PF'
 * (Polynésie française, loi du pays n° 2017-44, arrêté n° 199 CM). La
 * réglementation applicable est celle du LIEU : le pays du site prime, la
 * juridiction du club ne sert que de repli.
 * Portage de src/domain/jurisdiction.js : cas communs dans
 * tests/fixtures/jurisdiction.json (JurisdictionTest, tests/jurisdiction.test.js).
 */
final class Jurisdiction
{
    public const array ALL = ['FR', 'PF'];
    public const string DEFAULT = 'FR';

    /** Codes pays (ISO 3166 alpha-2 et alpha-3) de la Polynésie française. */
    private const array PF_COUNTRY_CODES = ['PF', 'PYF'];

    public static function normalize(mixed $value): ?string
    {
        $v = is_string($value) ? strtoupper(trim($value)) : '';
        return in_array($v, self::ALL, true) ? $v : null;
    }

    /** Juridiction d'un pays de site ; null si le pays est inconnu. */
    public static function forCountry(?string $code): ?string
    {
        $c = strtoupper(trim((string)$code));
        if ($c === '') return null;
        return in_array($c, self::PF_COUNTRY_CODES, true) ? 'PF' : 'FR';
    }

    /** @param mixed $club juridiction du club, ou ligne clubs (clé 'jurisdiction') */
    public static function resolve(?string $paysCode, mixed $club): string
    {
        $clubJurisdiction = is_array($club) ? ($club['jurisdiction'] ?? null) : $club;
        return self::forCountry($paysCode) ?? self::normalize($clubJurisdiction) ?? self::DEFAULT;
    }
}
