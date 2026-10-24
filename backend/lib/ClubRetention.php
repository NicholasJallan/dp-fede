<?php
declare(strict_types=1);

/**
 * Conservation légale des fiches de sécurité à la suppression d'un club
 * (Code du sport A322-72 : conservation 1 an par l'établissement ; exception
 * au droit à l'effacement, RGPD art. 17.3.b).
 *
 * Supprimer un club (DELETE /api/club, ou suppression du compte de son
 * unique membre) :
 *   - conserve les plongées archivées dont la date de référence date de moins
 *     de 365 jours, avec leurs documents (lignes + PDF), participants et
 *     runtime state, ainsi que les plongeurs et sites qu'elles référencent ;
 *   - supprime immédiatement tout le reste (autres plongées, plongeurs,
 *     sites, invitations, adhésions, PDF non conservés) ;
 *   - s'il reste des fiches : le club est soft-deleted (deleted_at,
 *     retention_until = fin de conservation la plus tardive) et n'a plus de
 *     membre → données inaccessibles par l'API ; sinon il est supprimé.
 * bin/purge.php (Retention::run) supprime définitivement les clubs dont
 * retention_until est dépassée.
 *
 * Date de référence d'une plongée : la plus tardive de closed_at (posée par
 * le serveur à l'archivage) et created_at — deux dates SERVEUR. date_plongee,
 * saisie par le client, n'intervient pas : un client ne peut pas avancer la
 * fin de conservation d'une fiche.
 *
 * Données conservées minimisées : les plongeurs conservés ne gardent que ce
 * qu'affiche la fiche (identité, licence, niveaux, aptitudes, qualifications) ;
 * date de naissance, CACI, représentant légal, autorisation parentale, fin de
 * licence, notes et identifiant externe sont effacés (RGPD art. 5.1.c).
 *
 * plan(), referenceDate(), retentionEnd(), referencedIds(), message() et
 * merge() sont purs (testés).
 */
class ClubRetention
{
    public const DAYS = 365;

    /**
     * Date de référence en SQL (table dives) : même règle que referenceDate().
     * NULL (aucune date serveur) → jamais purgée.
     */
    public const REFERENCE_SQL = 'GREATEST(COALESCE(closed_at, created_at), COALESCE(created_at, closed_at))';

    /** Colonnes des plongeurs conservés effacées (non nécessaires à la fiche). */
    public const ANONYMIZED_DIVER_COLUMNS = [
        'date_naissance', 'medical', 'licence_fin', 'representant_legal',
        'autorisation_parentale_saison', 'notes', 'external_id',
    ];

    // ── Fonctions pures ────────────────────────────────────────────────────

    public static function referenceDate(array $dive): ?DateTimeImmutable
    {
        $best = null;
        foreach (['closed_at', 'created_at'] as $k) {
            $d = self::parse($dive[$k] ?? null);
            if ($d !== null && ($best === null || $d > $best)) $best = $d;
        }
        return $best;
    }

    /** Dernier jour de conservation (référence + 365 jours), ou null. */
    public static function retentionEnd(array $dive): ?DateTimeImmutable
    {
        $ref = self::referenceDate($dive);
        return $ref?->setTime(0, 0)->modify('+' . self::DAYS . ' days');
    }

    /**
     * Plongeurs et sites référencés par une plongée (palanquées, DP,
     * sécurité surface, site).
     *
     * @return array{divers: string[], sites: string[]}
     */
    public static function referencedIds(array $dive): array
    {
        $answers    = self::decode($dive['answers'] ?? null);
        $palanquees = self::decode($dive['palanquees'] ?? null);
        $divers = [];
        foreach ($palanquees as $p) {
            if (!is_array($p)) continue;
            foreach ((array)($p['membres'] ?? []) as $m) {
                if (is_array($m) && empty($m['_bapteme']) && is_string($m['diverId'] ?? null) && $m['diverId'] !== '') {
                    $divers[$m['diverId']] = true;
                }
            }
        }
        if (is_string($answers['dp_id'] ?? null) && $answers['dp_id'] !== '') $divers[$answers['dp_id']] = true;
        foreach ((array)($answers['sec_surface_membres'] ?? []) as $id) {
            if (is_string($id) && $id !== '') $divers[$id] = true;
        }
        $sites = (is_string($answers['site_id'] ?? null) && $answers['site_id'] !== '') ? [$answers['site_id']] : [];
        return ['divers' => array_keys($divers), 'sites' => $sites];
    }

    /**
     * Sélection des données à conserver parmi les plongées ARCHIVÉES du club.
     *
     * @param list<array> $archivedDives id, closed_at, date_plongee, created_at, answers, palanquees
     * @return array{dive_ids: string[], diver_ids: string[], site_ids: string[], count: int, until: ?string}
     */
    public static function plan(array $archivedDives, DateTimeImmutable $now): array
    {
        $today = $now->setTime(0, 0);
        $dives = [];
        $divers = [];
        $sites = [];
        $until = null;
        foreach ($archivedDives as $d) {
            $end = self::retentionEnd($d);
            if ($end === null || $end < $today) continue;
            $dives[] = (string)$d['id'];
            $refs = self::referencedIds($d);
            foreach ($refs['divers'] as $id) $divers[$id] = true;
            foreach ($refs['sites'] as $id) $sites[$id] = true;
            if ($until === null || $end > $until) $until = $end;
        }
        return [
            'dive_ids'  => $dives,
            'diver_ids' => array_keys($divers),
            'site_ids'  => array_keys($sites),
            'count'     => count($dives),
            'until'     => $until?->format('Y-m-d'),
        ];
    }

    /**
     * Agrège plusieurs résultats (suppression de compte : plusieurs clubs).
     *
     * @param list<array{count:int, until:?string}> $retained
     * @return array{fiches:int, until:?string, clubs:int}
     */
    public static function merge(array $retained): array
    {
        $count = 0;
        $until = null;
        $clubs = 0;
        foreach ($retained as $r) {
            if ($r['count'] < 1) continue;
            $count += (int)$r['count'];
            $clubs++;
            if ($until === null || (string)$r['until'] > $until) $until = (string)$r['until'];
        }
        return ['fiches' => $count, 'until' => $until, 'clubs' => $clubs];
    }

    /** Message destiné à l'interface. */
    public static function message(int $count, ?string $until): string
    {
        if ($count < 1 || $until === null) {
            return 'Aucune fiche de sécurité à conserver : toutes les données ont été supprimées.';
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $until);
        $fr   = $date ? $date->format('d/m/Y') : $until;
        $s    = $count > 1 ? 's' : '';
        return "{$count} fiche{$s} de sécurité archivée{$s} conservée{$s} jusqu'au {$fr} "
            . '(obligation légale de conservation d\'un an, art. A322-72 du Code du sport), '
            . 'puis supprimée' . $s . ' automatiquement. Les autres données ont été supprimées.';
    }

    private static function parse($v): ?DateTimeImmutable
    {
        if (!is_string($v) || $v === '') return null;
        $d = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', substr($v, 0, 19))
            ?: DateTimeImmutable::createFromFormat('!Y-m-d', substr($v, 0, 10));
        return $d ?: null;
    }

    private static function decode($raw): array
    {
        if (is_array($raw)) return $raw;
        $v = json_decode((string)($raw ?? ''), true);
        return is_array($v) ? $v : [];
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    public static function planForClub(string $clubId, DateTimeImmutable $now): array
    {
        $dives = Db::all(
            "SELECT id, closed_at, date_plongee, created_at, answers, palanquees
               FROM dives WHERE club_id=? AND status='archived' AND deleted_at IS NULL",
            [$clubId]
        );
        return self::plan($dives, $now);
    }

    /** Chemins des PDF qui ne sont PAS conservés par le plan. */
    public static function pathsToDelete(string $clubId, array $plan): array
    {
        [$notIn, $params] = self::notIn('dive_id', $plan['dive_ids']);
        return array_column(
            Db::all("SELECT path FROM dive_documents WHERE club_id=?{$notIn}", [$clubId, ...$params]),
            'path'
        );
    }

    /**
     * Supprime les lignes non conservées et soft-delete le club (ou le
     * supprime s'il ne reste rien). Sans gestion de transaction : à appeler
     * dans Db::transaction ; fichiers supprimés par l'appelant après commit.
     *
     * @return array<string,int>
     */
    public static function retireClubRows(PDO $pdo, string $clubId, array $plan): array
    {
        if ($plan['count'] === 0) {
            return Club::deleteClubRows($pdo, $clubId);
        }
        $run = static function (string $sql, array $params) use ($pdo): int {
            $st = $pdo->prepare($sql);
            $st->execute($params);
            return $st->rowCount();
        };
        [$notDive, $pDive]   = self::notIn('dive_id', $plan['dive_ids']);
        [$notId, $pId]       = self::notIn('id', $plan['dive_ids']);
        [$notDiver, $pDiver] = self::notIn('id', $plan['diver_ids']);
        [$notSite, $pSite]   = self::notIn('id', $plan['site_ids']);

        return [
            'dive_participants'  => $run("DELETE FROM dive_participants WHERE club_id=?{$notDive}", [$clubId, ...$pDive]),
            'dive_documents'     => $run("DELETE FROM dive_documents WHERE club_id=?{$notDive}", [$clubId, ...$pDive]),
            'dive_runtime_state' => $run(
                "DELETE FROM dive_runtime_state WHERE dive_id IN (SELECT id FROM dives WHERE club_id=?{$notId})",
                [$clubId, ...$pId]
            ),
            'dives'              => $run("DELETE FROM dives WHERE club_id=?{$notId}", [$clubId, ...$pId]),
            'divers'             => $run("DELETE FROM divers WHERE club_id=?{$notDiver}", [$clubId, ...$pDiver]),
            'sites'              => $run("DELETE FROM sites WHERE club_id=?{$notSite}", [$clubId, ...$pSite]),
            // Minimisation : seules les données affichées par la fiche restent.
            'divers_anonymized'  => $run(
                'UPDATE divers SET ' . implode(', ', array_map(
                    static fn(string $c): string => "{$c}=NULL",
                    self::ANONYMIZED_DIVER_COLUMNS
                )) . ' WHERE club_id=?',
                [$clubId]
            ),
            'sites_anonymized'   => $run('UPDATE sites SET notes=NULL WHERE club_id=?', [$clubId]),
            'club_invitations'   => $run('DELETE FROM club_invitations WHERE club_id=?', [$clubId]),
            'users_current'      => $run('UPDATE users SET current_club_id=NULL WHERE current_club_id=?', [$clubId]),
            'club_members'       => $run('DELETE FROM club_members WHERE club_id=?', [$clubId]),
            // auto_created_for libéré : l'ancien membre pourra recevoir un nouveau club personnel.
            'clubs_retained'     => $run(
                'UPDATE clubs SET deleted_at=NOW(), retention_until=?, auto_created_for=NULL WHERE id=?',
                [$plan['until'], $clubId]
            ),
        ];
    }

    /**
     * Suppression d'un club avec conservation légale (transaction + fichiers).
     *
     * @return array{counts: array<string,int>, retained: array{count:int, until:?string}}
     */
    public static function retire(string $clubId): array
    {
        $plan   = self::planForClub($clubId, new DateTimeImmutable('now'));
        $paths  = self::pathsToDelete($clubId, $plan);
        $counts = Db::transaction(static fn(PDO $pdo): array => self::retireClubRows($pdo, $clubId, $plan));
        $counts['files'] = DiveArchive::unlinkDocuments($paths);
        if ($plan['count'] === 0) DiveArchive::removeClubDirectory($clubId);
        return ['counts' => $counts, 'retained' => ['count' => $plan['count'], 'until' => $plan['until']]];
    }

    /**
     * Purge définitive des clubs dont la conservation est échue
     * (bin/purge.php). Retourne le nombre de clubs (supprimés ou à supprimer).
     */
    public static function purgeExpired(bool $dry, DateTimeImmutable $now): int
    {
        $ids = array_column(Db::all(
            'SELECT id FROM clubs WHERE deleted_at IS NOT NULL AND (retention_until IS NULL OR retention_until < ?)',
            [$now->format('Y-m-d')]
        ), 'id');
        if ($dry) return count($ids);
        foreach ($ids as $id) Club::deleteClub((string)$id);
        return count($ids);
    }

    /** Fragment « AND col NOT IN (?,…) » (vide si la liste est vide). */
    private static function notIn(string $col, array $ids): array
    {
        if (!$ids) return ['', []];
        return [" AND {$col} NOT IN (" . implode(',', array_fill(0, count($ids), '?')) . ')', array_values($ids)];
    }
}
