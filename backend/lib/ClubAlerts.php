<?php
declare(strict_types=1);

/**
 * Alertes de l'annuaire du club (bandeau d'accueil, écran annuaire) :
 *   - CACI expiré, expirant sous N jours (défaut 30), ou absent ;
 *   - licence expirée ou expirant sous N jours (si licence_fin connue) ;
 *   - mineur sans autorisation parentale pour la saison courante.
 *
 * Hypothèses (à valider, cf. docs/api-club.md) :
 *   - le CACI est valable 1 an à compter de sa date d'émission (même règle que
 *     le contrôle des palanquées côté front, MEDICAL_EXPIRED) ;
 *   - la saison FFESSM court du 15/09 au 14/09 de l'année suivante ; une
 *     saison est notée « AAAA-AAAA » (année de début - année de fin) ;
 *   - un plongeur est mineur s'il a moins de 18 ans à la date du jour (sans
 *     date de naissance, il n'est pas considéré comme mineur).
 *
 * Tout est pur sauf fetchForClub().
 */
class ClubAlerts
{
    public const DEFAULT_DAYS = 30;
    public const MAX_DAYS     = 120;
    private const SEASON_START_MONTH = 9;
    private const SEASON_START_DAY   = 15;
    private const MAJORITY_AGE       = 18;

    // ── Saisons ────────────────────────────────────────────────────────────

    /** Saison FFESSM contenant la date (ex. 2026-10-20 → « 2026-2027 »). */
    public static function seasonFor(DateTimeImmutable $date): string
    {
        $y = (int)$date->format('Y');
        $m = (int)$date->format('n');
        $d = (int)$date->format('j');
        $start = ($m > self::SEASON_START_MONTH || ($m === self::SEASON_START_MONTH && $d >= self::SEASON_START_DAY))
            ? $y : $y - 1;
        return $start . '-' . ($start + 1);
    }

    /** Bornes [début, fin] (AAAA-MM-JJ) de la saison « AAAA-AAAA ». */
    public static function seasonBounds(string $season): ?array
    {
        if (!self::isValidSeason($season)) return null;
        $start = (int)substr($season, 0, 4);
        return [
            sprintf('%04d-%02d-%02d', $start, self::SEASON_START_MONTH, self::SEASON_START_DAY),
            sprintf('%04d-%02d-%02d', $start + 1, self::SEASON_START_MONTH, self::SEASON_START_DAY - 1),
        ];
    }

    public static function isValidSeason(?string $season): bool
    {
        if ($season === null || !preg_match('/^(\d{4})-(\d{4})$/', $season, $m)) return false;
        return (int)$m[2] === (int)$m[1] + 1 && (int)$m[1] >= 2000 && (int)$m[1] <= 2100;
    }

    /**
     * Normalise une saison saisie librement : « 2026-2027 », « 2026/2027 »,
     * « 2026/27 », « 26-27 ». Retourne null si non reconnue.
     */
    public static function normalizeSeason(string $raw): ?string
    {
        $raw = trim($raw);
        if (!preg_match('/^(\d{2}|\d{4})\s*[-\/]\s*(\d{2}|\d{4})$/', $raw, $m)) return null;
        $a = strlen($m[1]) === 2 ? 2000 + (int)$m[1] : (int)$m[1];
        $b = (int)$m[2];
        if (strlen($m[2]) === 2) $b = intdiv($a, 100) * 100 + $b;
        $season = $a . '-' . $b;
        return self::isValidSeason($season) ? $season : null;
    }

    // ── Calculs ────────────────────────────────────────────────────────────

    /** Âge révolu à une date, ou null si date de naissance absente/invalide. */
    public static function ageAt(?string $birthDate, DateTimeImmutable $at): ?int
    {
        $b = self::parseDate($birthDate);
        if ($b === null || $b > $at) return null;
        return $b->diff($at)->y;
    }

    /** Date de fin de validité du CACI (émission + 1 an). */
    public static function caciExpiry(?string $caciDate): ?DateTimeImmutable
    {
        $d = self::parseDate($caciDate);
        return $d?->modify('+1 year');
    }

    /**
     * Alertes d'une liste de plongeurs (lignes divers, non supprimées).
     *
     * @return array{season:string, days:int, items: list<array>, counts: array<string,int>}
     */
    public static function compute(array $divers, DateTimeImmutable $today, int $days = self::DEFAULT_DAYS): array
    {
        $today  = $today->setTime(0, 0);
        $limit  = $today->modify("+{$days} days");
        $season = self::seasonFor($today);
        $items  = [];

        foreach ($divers as $d) {
            if (!empty($d['deleted_at'])) continue;
            $base = [
                'diver_id' => $d['id'] ?? null,
                'nom'      => $d['nom'] ?? '',
                'prenom'   => $d['prenom'] ?? '',
            ];

            $expiry = self::caciExpiry($d['medical'] ?? null);
            if ($expiry === null) {
                $items[] = $base + ['type' => 'caci_absent', 'severity' => 'warn', 'date' => null, 'days' => null];
            } elseif ($expiry <= $today) {
                $items[] = $base + self::dated('caci_expire', 'error', $expiry, $today);
            } elseif ($expiry <= $limit) {
                $items[] = $base + self::dated('caci_expire_bientot', 'warn', $expiry, $today);
            }

            $licenceEnd = self::parseDate($d['licence_fin'] ?? null);
            if ($licenceEnd !== null) {
                if ($licenceEnd < $today) {
                    $items[] = $base + self::dated('licence_expiree', 'error', $licenceEnd, $today);
                } elseif ($licenceEnd <= $limit) {
                    $items[] = $base + self::dated('licence_expire_bientot', 'warn', $licenceEnd, $today);
                }
            }

            $age = self::ageAt($d['date_naissance'] ?? null, $today);
            if ($age !== null && $age < self::MAJORITY_AGE
                && ($d['autorisation_parentale_saison'] ?? null) !== $season) {
                $items[] = $base + [
                    'type'     => 'autorisation_parentale_manquante',
                    'severity' => 'error',
                    'date'     => null,
                    'days'     => null,
                    'season'   => $season,
                    'age'      => $age,
                ];
            }
        }

        usort($items, static function (array $a, array $b): int {
            $sev = ['error' => 0, 'warn' => 1];
            return [$sev[$a['severity']], $a['days'] ?? PHP_INT_MAX, $a['nom'], $a['prenom']]
               <=> [$sev[$b['severity']], $b['days'] ?? PHP_INT_MAX, $b['nom'], $b['prenom']];
        });

        $counts = [];
        foreach ($items as $it) $counts[$it['type']] = ($counts[$it['type']] ?? 0) + 1;

        return ['season' => $season, 'days' => $days, 'items' => $items, 'counts' => $counts];
    }

    private static function dated(string $type, string $severity, DateTimeImmutable $date, DateTimeImmutable $today): array
    {
        $diff = (int)$today->diff($date)->format('%r%a');
        return ['type' => $type, 'severity' => $severity, 'date' => $date->format('Y-m-d'), 'days' => $diff];
    }

    private static function parseDate(?string $s): ?DateTimeImmutable
    {
        if ($s === null || $s === '') return null;
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', substr($s, 0, 10));
        return $d ?: null;
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    public static function fetchForClub(string $clubId, int $days): array
    {
        $divers = Db::all(
            'SELECT id, nom, prenom, medical, licence_fin, date_naissance, autorisation_parentale_saison, deleted_at
               FROM divers WHERE club_id=? AND deleted_at IS NULL ORDER BY nom, prenom',
            [$clubId]
        );
        return self::compute($divers, new DateTimeImmutable('today'), $days);
    }
}
