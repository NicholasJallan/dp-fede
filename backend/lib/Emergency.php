<?php
declare(strict_types=1);

/**
 * Numéros d'urgence de la fiche de sécurité (plan de secours, A322-78).
 * Portage de src/domain/emergency.js : cas communs dans
 * tests/fixtures/emergency.json (EmergencyTest, tests/emergency.test.js).
 */
final class Emergency
{
    /** Numéro principal selon le pays du site. */
    public const array PAR_PAYS = ['CH' => '144', 'FR' => '18', 'PF' => '15'];

    /** Pays inconnu et club sans numéro réglé : valable dans toute l'Europe. */
    public const string INCONNUE = '112';

    /** @return array{secondaryNums: string, vhf: ?string} */
    public static function info(?string $pays, ?string $milieu): array
    {
        $isMer = preg_match('/^en mer$/i', trim((string)$milieu)) === 1;
        if ($pays === 'CH') {
            return [
                'secondaryNums' => '1414 (REGA · évacuation aérienne) · 117 (Police) · 112 (Europe)',
                'vhf'           => null,
            ];
        }
        if ($pays === 'PF') {
            return [
                'secondaryNums' => '+689 40 54 16 16 (JRCC Tahiti, secours en mer)',
                'vhf'           => $isMer ? 'Canal 16 (JRCC Tahiti)' : null,
            ];
        }
        if ($pays === 'FR') {
            $parts = ['15 (SAMU)', '112 (Europe)'];
            if ($isMer) $parts[] = '196 (CROSS)';
            return ['secondaryNums' => implode(' · ', $parts), 'vhf' => $isMer ? 'Canal 16 (CROSS)' : null];
        }
        $parts = ['112 (Europe)'];
        if ($isMer) $parts[] = '196 (CROSS)';
        array_push($parts, '15 (SAMU FR)', '18 (Pompiers FR)', '144 (CH)', '1414 (REGA CH)');
        return ['secondaryNums' => implode(' · ', $parts), 'vhf' => $isMer ? 'Canal 16' : null];
    }

    public static function defaultNumber(?string $pays, ?string $clubDefault): string
    {
        return self::PAR_PAYS[(string)$pays] ?? (trim((string)$clubDefault) ?: self::INCONNUE);
    }

    /** La saisie du DP ($manual) prime ; sinon le numéro suit le pays du site. */
    public static function resolve(?string $pays, ?string $clubDefault, ?string $current, bool $manual): string
    {
        $cur = trim((string)$current);
        if ($manual && $cur !== '') return $cur;
        return self::defaultNumber($pays, $clubDefault);
    }
}
