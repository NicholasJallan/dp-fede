<?php
declare(strict_types=1);

/**
 * Rôles d'une palanquée au sens de l'arrêté n° 199 CM (aptitudes PE/PA,
 * fonctions ENS/GP/DP), partagés par PfRules et PfGasRules.
 * Portage de src/domain/pf/pf-roles.js. Fonctions pures.
 */
final class PfRoles
{
    public const array DP_RANK = ['DP-40', 'DP-60', 'DP-70', 'DP-100', 'DP-120'];

    /** Niveau d'un code « XX-nn » (ENS-06 → 6, GP-50 → 50, PE-20 → 20) ; 0 sinon. */
    public static function level(string $code, string $prefix): int
    {
        return str_starts_with($code, "{$prefix}-") ? (int)substr($code, strlen($prefix) + 1) : 0;
    }

    public static function ensLevel(string $role): int
    {
        return self::level($role, 'ENS');
    }

    public static function gpLevel(string $role): int
    {
        return self::level($role, 'GP');
    }

    public static function airLevel(string $role): int
    {
        return self::level($role, 'PE') ?: self::level($role, 'PA');
    }

    public static function isEncadrantRole(string $role): bool
    {
        return self::ensLevel($role) > 0 || self::gpLevel($role) > 0;
    }

    public static function isNovice(string $role): bool
    {
        return $role === 'Baptême' || $role === 'Débutant';
    }

    /** Le profil porte une fonction DP au moins égale à `$required`. */
    public static function hasDp(?array $profile, string $required): bool
    {
        if ($profile === null) return false;
        $min = array_search($required, self::DP_RANK, true);
        foreach ($profile['fonctions'] as $f) {
            $rank = array_search($f, self::DP_RANK, true);
            if ($rank !== false && $rank >= $min) return true;
        }
        return false;
    }

    /** Le profil porte toutes les aptitudes et tous les mélanges demandés. */
    public static function hasAll(?array $profile, array $aptitudes = [], array $gaz = []): bool
    {
        if ($profile === null) return false;
        foreach ($aptitudes as $a) if (!in_array($a, $profile['aptitudes'], true)) return false;
        foreach ($gaz as $g) if (!in_array($g, $profile['gaz'], true)) return false;
        return true;
    }

    /** Membre au rôle le plus élevé (le premier en cas d'égalité). */
    public static function best(array $membres, callable $levelOf): ?array
    {
        $best = null;
        foreach ($membres as $m) {
            if ($best === null || $levelOf($m['aptitude']) > $levelOf($best['aptitude'])) $best = $m;
        }
        return $best;
    }

    public static function memberName(array $m): string
    {
        $d = $m['_bapteme'] ? $m : ($m['diver'] ?? []);
        return trim((is_string($d['prenom'] ?? null) ? $d['prenom'] : '') . ' '
            . mb_strtoupper(is_string($d['nom'] ?? null) ? $d['nom'] : ''));
    }

    public static function memberId(array $m): string
    {
        $id = $m['_bapteme'] ? ($m['id'] ?? '') : ($m['diverId'] ?? ($m['id'] ?? ''));
        return is_scalar($id) ? (string)$id : '';
    }

    /** @return list<string> */
    public static function ids(array $membres): array
    {
        return array_values(array_map([self::class, 'memberId'], $membres));
    }

    /** @return list<string> */
    public static function names(array $membres): array
    {
        return array_values(array_map([self::class, 'memberName'], $membres));
    }

    public static function ageAt(?string $birthIso, ?DateTimeImmutable $when): ?int
    {
        if ($birthIso === null || $when === null) return null;
        $b = self::parseCalendarDate($birthIso);
        if ($b === null) return null;
        $age = (int)$when->format('Y') - (int)$b->format('Y');
        $wm  = (int)$when->format('n');
        $bm  = (int)$b->format('n');
        if ($wm < $bm || ($wm === $bm && (int)$when->format('j') < (int)$b->format('j'))) $age -= 1;
        return $age;
    }

    public static function parseCalendarDate(string $raw): ?DateTimeImmutable
    {
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $raw, $p) !== 1) return null;
        if (!checkdate((int)$p[2], (int)$p[3], (int)$p[1])) return null;
        return new DateTimeImmutable(sprintf('%04d-%02d-%02d 00:00:00', $p[1], $p[2], $p[3]));
    }

    public static function fmt(float $n): string
    {
        return floor($n) === $n ? (string)(int)$n : (string)$n;
    }
}
