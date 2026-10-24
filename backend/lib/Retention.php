<?php
declare(strict_types=1);

/**
 * Purges périodiques (bin/purge.php, cron quotidien) — cf. docs/rgpd.md.
 *
 * Toujours actif :
 *   - sessions expirées, compteurs de rate-limit périmés ;
 *   - clubs supprimés dont la conservation légale (A322-72, 365 jours) est
 *     échue : suppression définitive des fiches conservées (lignes + PDF) ;
 *   - invitations de club utilisées, annulées ou expirées depuis plus de
 *     30 jours (elles contiennent une adresse e-mail).
 * Actif par défaut, paramétrable (0 = désactivé) :
 *   - lignes soft-deleted (divers, sites, plongées non archivées) depuis
 *     plus de N jours (défaut 180). La rétention temporaire sert à propager
 *     les suppressions aux clients hors-ligne (sync ?since=).
 * DÉSACTIVÉ par défaut (opt-in explicite) :
 *   - plongées archivées dont la date est antérieure à N années (N ≥ 1 :
 *     conservation minimale d'un an des fiches de sécurité, A322-72) ;
 *   - comptes inactifs depuis N années (N ≥ 2), hors administrateurs,
 *     hors comptes ayant une plongée de moins d'un an et hors seuls
 *     responsables d'un club partagé.
 * La suppression d'une plongée supprime aussi ses participants, ses
 * documents (lignes dive_documents ET fichiers PDF) et son runtime state.
 *
 * Paramètres : section 'retention' de /etc/dp-fede/config.php, surchargée
 * par les options CLI (--soft-deleted-days=…, --archived-dives-years=…,
 * --inactive-accounts-years=…, --dry-run).
 */
class Retention
{
    public const DEFAULT_SOFT_DELETED_DAYS = 180;
    /** Décision du 25/10/2026 : prescription civile de droit commun (5 ans) ; A322-72 : 1 an minimum. */
    public const DEFAULT_ARCHIVED_DIVES_YEARS = 5;
    public const MIN_INACTIVE_ACCOUNT_YEARS = 2;
    /** A322-72 : une plongée de moins d'un an protège le compte de la purge. */
    private const RECENT_DIVE_GUARD_YEARS = 1;
    /** Invitations closes (utilisées / annulées / expirées) conservées 30 jours. */
    public const CLOSED_INVITATIONS_DAYS = 30;

    // ── Fonctions pures ────────────────────────────────────────────────────

    /**
     * Analyse les options CLI (fonction pure, testée).
     *
     * @param string[] $args   arguments CLI (sans le nom du script)
     * @param array    $config section 'retention' de la config (peut être vide)
     * @return array{options: array{dry_run:bool,help:bool,soft_deleted_days:int,archived_dives_years:int,inactive_accounts_years:int}, errors: string[]}
     */
    public static function parseOptions(array $args, array $config): array
    {
        $opts = [
            'dry_run'                 => false,
            'help'                    => false,
            'soft_deleted_days'       => self::DEFAULT_SOFT_DELETED_DAYS,
            'archived_dives_years'    => self::DEFAULT_ARCHIVED_DIVES_YEARS,
            'inactive_accounts_years' => 0,
        ];
        $errors = [];

        foreach (['soft_deleted_days', 'archived_dives_years', 'inactive_accounts_years'] as $key) {
            if (!array_key_exists($key, $config)) continue;
            $v = $config[$key];
            if (is_int($v) && $v >= 0) {
                $opts[$key] = $v;
            } else {
                $errors[] = "config retention.{$key} doit être un entier ≥ 0";
            }
        }

        $map = [
            '--soft-deleted-days'       => 'soft_deleted_days',
            '--archived-dives-years'    => 'archived_dives_years',
            '--inactive-accounts-years' => 'inactive_accounts_years',
        ];
        foreach ($args as $arg) {
            if ($arg === '--dry-run') { $opts['dry_run'] = true; continue; }
            if ($arg === '--help' || $arg === '-h') { $opts['help'] = true; continue; }
            $parts = explode('=', $arg, 2);
            if (count($parts) === 2 && isset($map[$parts[0]])) {
                if (ctype_digit($parts[1])) {
                    $opts[$map[$parts[0]]] = (int)$parts[1];
                } else {
                    $errors[] = "{$parts[0]} : entier ≥ 0 attendu";
                }
                continue;
            }
            $errors[] = "option inconnue : {$arg}";
        }

        // archived_dives_years : la durée se compte en années entières, toute
        // valeur > 0 respecte donc le minimum d'un an (A322-72).
        if ($opts['inactive_accounts_years'] > 0 && $opts['inactive_accounts_years'] < self::MIN_INACTIVE_ACCOUNT_YEARS) {
            $errors[] = 'inactive_accounts_years : minimum ' . self::MIN_INACTIVE_ACCOUNT_YEARS . ' ans';
        }

        return ['options' => $opts, 'errors' => $errors];
    }

    /** Date limite « maintenant moins N jours/années » au format DATETIME (pure). */
    public static function cutoff(DateTimeImmutable $now, int $amount, string $unit): string
    {
        if (!in_array($unit, ['days', 'years'], true)) {
            throw new InvalidArgumentException("Unité inconnue : {$unit}");
        }
        return $now->modify("-{$amount} {$unit}")->format('Y-m-d H:i:s');
    }

    // ── Exécution ──────────────────────────────────────────────────────────

    /**
     * Lance toutes les purges selon $opts. Retourne le nombre de lignes
     * supprimées (ou qui le seraient, en dry-run) par catégorie.
     *
     * @return array<string,int>
     */
    public static function run(array $opts, DateTimeImmutable $now): array
    {
        $dry = (bool)$opts['dry_run'];
        $out = [
            'sessions_expired'   => self::sessions($dry),
            'rate_limits'        => self::rateLimits($dry),
            'clubs_retention_expired' => ClubRetention::purgeExpired($dry, $now),
            'invitations_closed' => self::countOrDelete(
                $dry,
                'club_invitations',
                '(accepted_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < NOW()) AND created_at < ?',
                [self::cutoff($now, self::CLOSED_INVITATIONS_DAYS, 'days')]
            ),
        ];

        if ($opts['soft_deleted_days'] > 0) {
            $cut = self::cutoff($now, (int)$opts['soft_deleted_days'], 'days');
            // Données d'un club en conservation légale (A322-72) : purgées avec
            // le club par ClubRetention::purgeExpired, pas ici.
            $retained = ' AND club_id NOT IN (SELECT id FROM clubs WHERE deleted_at IS NOT NULL)';
            $out['divers_soft_deleted'] = self::countOrDelete($dry, 'divers', 'deleted_at IS NOT NULL AND deleted_at < ?' . $retained, [$cut]);
            $out['sites_soft_deleted']  = self::countOrDelete($dry, 'sites', 'deleted_at IS NOT NULL AND deleted_at < ?' . $retained, [$cut]);
            $out['dives_soft_deleted']  = self::dives($dry, 'deleted_at IS NOT NULL AND deleted_at < ?', [$cut]);
        }

        if ($opts['archived_dives_years'] > 0) {
            $cut = self::cutoff($now, (int)$opts['archived_dives_years'], 'years');
            $out['dives_archived_old'] = self::dives(
                $dry,
                "status = 'archived' AND " . ClubRetention::REFERENCE_SQL . ' < ?',
                [$cut]
            );
        }

        if ($opts['inactive_accounts_years'] > 0) {
            $out['accounts_inactive'] = self::inactiveAccounts(
                $dry,
                self::cutoff($now, (int)$opts['inactive_accounts_years'], 'years'),
                self::cutoff($now, self::RECENT_DIVE_GUARD_YEARS, 'years')
            );
        }
        return $out;
    }

    private static function sessions(bool $dry): int
    {
        return $dry
            ? (int)(Db::row('SELECT COUNT(*) AS n FROM sessions WHERE expires_at < NOW()')['n'] ?? 0)
            : Auth::purgeExpired();
    }

    private static function rateLimits(bool $dry): int
    {
        return $dry
            ? (int)(Db::row('SELECT COUNT(*) AS n FROM rate_limits WHERE window_start < DATE_SUB(NOW(), INTERVAL 2 HOUR)')['n'] ?? 0)
            : RateLimit::purge();
    }

    /** $table et $where sont des constantes internes (jamais d'entrée utilisateur). */
    private static function countOrDelete(bool $dry, string $table, string $where, array $params): int
    {
        if ($dry) {
            return (int)(Db::row("SELECT COUNT(*) AS n FROM {$table} WHERE {$where}", $params)['n'] ?? 0);
        }
        return Db::q("DELETE FROM {$table} WHERE {$where}", $params)->rowCount();
    }

    /**
     * Supprime des plongées avec leur runtime state, leurs participants et
     * leurs documents (explicitement, sans dépendre des FK). Les fichiers PDF
     * sont effacés après validation de la transaction.
     */
    private static function dives(bool $dry, string $where, array $params): int
    {
        if ($dry) return self::countOrDelete(true, 'dives', $where, $params);
        $paths = DiveArchive::documentPathsWhere($where, $params);
        $n = Db::transaction(static function (PDO $pdo) use ($where, $params): int {
            foreach (['dive_runtime_state', 'dive_participants', 'dive_documents'] as $child) {
                $pdo->prepare("DELETE FROM {$child} WHERE dive_id IN (SELECT id FROM dives WHERE {$where})")
                    ->execute($params);
            }
            $st = $pdo->prepare("DELETE FROM dives WHERE {$where}");
            $st->execute($params);
            return $st->rowCount();
        });
        DiveArchive::unlinkDocuments($paths);
        return $n;
    }

    private static function inactiveAccounts(bool $dry, string $inactiveCutoff, string $recentDiveCutoff): int
    {
        $ids = Db::all(
            "SELECT u.id FROM users u
              WHERE u.role <> 'admin'
                AND u.kind = 'person'
                AND u.email <> ?
                AND COALESCE(u.last_seen_at, u.last_login, u.created_at) < ?
                AND NOT EXISTS (
                    SELECT 1 FROM dives d
                     WHERE d.user_id = u.id
                       AND COALESCE(d.date_plongee, d.created_at) >= ?
                )",
            [Auth::SUPER_ADMIN_EMAIL, $inactiveCutoff, $recentDiveCutoff]
        );
        // Seul responsable d'un club partagé : le compte est conservé (le club
        // ne doit pas se retrouver sans responsable).
        $ids = array_values(array_filter($ids, static fn(array $row): bool => !Account::clubBlockers((int)$row['id'])));
        if ($dry) return count($ids);
        $done = 0;
        foreach ($ids as $row) {
            // Un compte en échec (verrou, contrainte) n'arrête pas la purge des
            // autres : journalisé, repris au passage suivant du cron.
            try {
                Account::deleteUserData((int)$row['id']);
                $done++;
            } catch (\Throwable $e) {
                self::logItemFailure('account', (int)$row['id'], $e);
            }
        }
        return $done;
    }

    /** Élément de purge en échec : journalisé (détail dans le journal PHP), la purge continue. */
    public static function logItemFailure(string $kind, int|string $id, \Throwable $e): void
    {
        error_log("[dp-fede] purge {$kind} {$id} : " . get_class($e) . ': ' . $e->getMessage());
        Log::action('purge.item_failed', ['kind' => $kind, 'id' => $id]);
    }
}
