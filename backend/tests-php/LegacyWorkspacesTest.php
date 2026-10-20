<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/**
 * Reprise des structures de production (002_workspaces) en clubs (007).
 *
 *   - règles pures de LegacyWorkspaces et plan() sur les volumes réels de
 *     la production (aucune donnée personnelle) ;
 *   - cohérence entre ces règles et le SQL de 007_clubs.sql ;
 *   - ordre des instructions émises par Migrator::run sur une base à l'état
 *     de production (000, 001, 002 appliquées), via le faux PDO.
 *
 * La migration a aussi été rejouée sur un vrai MariaDB (volumes réels,
 * reprise après échec partiel à chaque instruction, idempotence) : cf.
 * docs/integration-upstream.md.
 */
final class LegacyWorkspacesTest extends TestCase
{
    private const MIGRATIONS = __DIR__ . '/../migrations';
    private const NOW = 1_790_000_000;

    // ── Règles pures ───────────────────────────────────────────────────────

    public function testTechnicalAccountDetection(): void
    {
        $this->assertTrue(\LegacyWorkspaces::isTechnicalAccount(['kind' => 'workspace']));
        $this->assertFalse(\LegacyWorkspaces::isTechnicalAccount(['kind' => 'person']));
        $this->assertFalse(\LegacyWorkspaces::isTechnicalAccount(['id' => 3]), 'colonne absente = personne');
        $this->assertFalse(\LegacyWorkspaces::isTechnicalAccount(null));
    }

    public function testRoleMapping(): void
    {
        $this->assertSame('responsable', \LegacyWorkspaces::clubRole('owner'));
        $this->assertSame('dp', \LegacyWorkspaces::clubRole('member'));
        $this->assertSame('dp', \LegacyWorkspaces::clubRole('inconnu'));
    }

    public function testArchivedWorkspaceKeepsOnlyOwners(): void
    {
        $this->assertTrue(\LegacyWorkspaces::keepsMembership('member', false));
        $this->assertTrue(\LegacyWorkspaces::keepsMembership('owner', true));
        $this->assertFalse(\LegacyWorkspaces::keepsMembership('member', true));
    }

    public function testCurrentWorkspaceFollowsTheMostRecentLiveSession(): void
    {
        $s = static fn(int $exp, ?int $ws): array => ['expires_at' => self::NOW + $exp, 'workspace_id' => $ws];
        $cur = static fn(array $sessions, array $eligible = [1]): ?int => \LegacyWorkspaces::currentWorkspace($sessions, $eligible, self::NOW);

        $this->assertSame(1, $cur([$s(100, null), $s(500, 1)]), 'dernière session dans la structure');
        $this->assertNull($cur([$s(500, null), $s(100, 1)]), 'dernière session personnelle');
        $this->assertNull($cur([$s(-10, 1)]), 'session expirée ignorée');
        $this->assertNull($cur([$s(500, 1)], []), 'plus membre (ou structure archivée)');
        $this->assertSame(1, $cur([$s(500, null), $s(500, 1)]), 'égalité : la structure l\'emporte (comme le JOIN SQL)');
        $this->assertNull($cur([]));
    }

    public function testAuthorRules(): void
    {
        $persons = [2 => true, 6 => true];
        $this->assertSame(2, \LegacyWorkspaces::author(2, $persons));
        $this->assertNull(\LegacyWorkspaces::author(null, $persons), 'auteur inconnu');
        $this->assertNull(\LegacyWorkspaces::author(999, $persons), 'compte supprimé');
        $this->assertNull(\LegacyWorkspaces::author(14, $persons), 'compte-structure');
        $this->assertNull(\LegacyWorkspaces::author(2, $persons, true), 'conflit (auteur, client_uuid)');
    }

    // ── Plan sur les volumes de production ─────────────────────────────────

    /** État de la production au 20/10/2026 (identifiants et volumes, sans donnée personnelle). */
    private static function productionSnapshot(): array
    {
        $persons = [1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21];
        $users = array_map(static fn(int $id): array => ['id' => $id, 'kind' => 'person'], $persons);
        $users[] = ['id' => 14, 'kind' => 'workspace'];

        $rows = static function (array $perUser, array $createdBy = []): array {
            $out = [];
            foreach ($perUser as $uid => $n) {
                for ($k = 0; $k < $n; $k++) {
                    $out[] = ['user_id' => $uid, 'created_by' => $createdBy[$uid][$k] ?? null, 'client_uuid' => "c-{$uid}-{$k}"];
                }
            }
            return $out;
        };

        return [
            'now'        => self::NOW,
            'users'      => $users,
            'workspaces' => [['id' => 1, 'name' => 'BEPPA Hendaye 2026', 'data_user_id' => 14, 'created_by' => 2, 'archived' => false]],
            'members'    => array_map(
                static fn(int $u): array => ['workspace_id' => 1, 'user_id' => $u, 'role' => $u === 2 ? 'owner' : 'member'],
                [2, 6, 15, 16, 18, 19, 20]
            ),
            'sessions'   => [
                ['user_id' => 2, 'expires_at' => self::NOW + 86400, 'workspace_id' => null],
                ['user_id' => 2, 'expires_at' => self::NOW + 5 * 86400, 'workspace_id' => 1],
                ['user_id' => 6, 'expires_at' => self::NOW + 5 * 86400, 'workspace_id' => null],
                ['user_id' => 15, 'expires_at' => self::NOW - 60, 'workspace_id' => 1],
            ],
            'rows'       => [
                // 8 plongées avec created_by (6 du stage, 2 personnelles).
                'dives'  => $rows([2 => 19, 4 => 2, 5 => 2, 10 => 1, 14 => 7, 21 => 1],
                                  [14 => [2, 2, 6, 15, 16, 2], 2 => [2], 4 => [4]]),
                'divers' => $rows([2 => 10, 4 => 5, 5 => 2, 6 => 1, 9 => 1, 10 => 2, 14 => 20], [14 => array_fill(0, 12, 6)]),
                'sites'  => $rows([2 => 1, 14 => 2], [14 => [2]]),
            ],
        ];
    }

    public function testProductionPlan(): void
    {
        $plan = \LegacyWorkspaces::plan(self::productionSnapshot());

        $this->assertSame([], $plan['warnings']);
        $this->assertSame([], $plan['blocking']);
        $this->assertCount(19, $plan['clubs'], '18 clubs personnels + 1 club de structure');
        $this->assertArrayNotHasKey('perso:14', $plan['clubs'], 'pas de club personnel pour le compte-structure');
        $this->assertSame(
            [2 => 'responsable', 6 => 'dp', 15 => 'dp', 16 => 'dp', 18 => 'dp', 19 => 'dp', 20 => 'dp'],
            $plan['clubs']['ws:1']['members']
        );
        $this->assertSame([2 => 'responsable'], $plan['clubs']['perso:2']['members']);

        $this->assertSame('ws:1', $plan['current'][2], 'session la plus récente dans la structure');
        $this->assertSame('perso:6', $plan['current'][6], 'session la plus récente personnelle');
        $this->assertSame('perso:15', $plan['current'][15], 'session expirée');
        $this->assertSame('perso:18', $plan['current'][18], 'aucune session');
        $this->assertArrayNotHasKey(14, $plan['current']);

        $perClub = static function (array $buckets): array {
            $out = [];
            foreach ($buckets as $bucket => $n) {
                $club = explode('|', $bucket)[0];
                $out[$club] = ($out[$club] ?? 0) + $n;
            }
            ksort($out);
            return $out;
        };
        $this->assertSame(['perso:10' => 1, 'perso:2' => 19, 'perso:21' => 1, 'perso:4' => 2, 'perso:5' => 2, 'ws:1' => 7], $perClub($plan['rows']['dives']));
        $this->assertSame(['perso:10' => 2, 'perso:2' => 10, 'perso:4' => 5, 'perso:5' => 2, 'perso:6' => 1, 'perso:9' => 1, 'ws:1' => 20], $perClub($plan['rows']['divers']));
        $this->assertSame(32, array_sum($plan['rows']['dives']), 'aucune plongée perdue');
        $this->assertSame(41, array_sum($plan['rows']['divers']), 'aucun plongeur perdu');

        // Auteurs des plongées du stage : created_by, sinon inconnu.
        $this->assertSame(3, $plan['rows']['dives']['ws:1|2']);
        $this->assertSame(1, $plan['rows']['dives']['ws:1|6']);
        $this->assertSame(1, $plan['rows']['dives']['ws:1|null']);
        $this->assertSame(12, $plan['rows']['divers']['ws:1|6']);
        $this->assertSame(8, $plan['rows']['divers']['ws:1|null']);
    }

    public function testPlanEdgeCases(): void
    {
        $s = self::productionSnapshot();
        $s['users'][] = ['id' => 30, 'kind' => 'workspace'];
        $s['users'][] = ['id' => 31, 'kind' => 'workspace'];
        $s['workspaces'][] = ['id' => 2, 'name' => 'Ancien stage', 'data_user_id' => 30, 'created_by' => 4, 'archived' => true];
        $s['workspaces'][] = ['id' => 3, 'name' => 'Sortie', 'data_user_id' => 31, 'created_by' => 9, 'archived' => false];
        $s['members'][] = ['workspace_id' => 2, 'user_id' => 4, 'role' => 'owner'];
        $s['members'][] = ['workspace_id' => 2, 'user_id' => 5, 'role' => 'member'];
        $s['members'][] = ['workspace_id' => 3, 'user_id' => 10, 'role' => 'member'];
        $s['sessions'][] = ['user_id' => 5, 'expires_at' => self::NOW + 999, 'workspace_id' => 2];
        $s['sessions'][] = ['user_id' => 9, 'expires_at' => self::NOW + 999, 'workspace_id' => 3];
        // Conflit : le stage et l'espace personnel de 2 portent le même client_uuid.
        $s['rows']['dives'][0]['client_uuid'] = 'partage';
        $s['rows']['dives'][] = ['user_id' => 14, 'created_by' => 2, 'client_uuid' => 'partage'];
        // Ligne orpheline (compte supprimé) : supprimée par 005.
        $s['rows']['sites'][] = ['user_id' => 77, 'created_by' => null, 'client_uuid' => null];

        // Même (auteur, client_uuid) dans deux structures : seule la plus petite id garde l'auteur.
        $s['users'][] = ['id' => 32, 'kind' => 'workspace'];
        $s['workspaces'][] = ['id' => 4, 'name' => 'Autre', 'data_user_id' => 32, 'created_by' => 2, 'archived' => false];
        $s['rows']['dives'][] = ['id' => 'b-2', 'user_id' => 32, 'created_by' => 6, 'client_uuid' => 'jumeau'];
        $s['rows']['dives'][] = ['id' => 'a-1', 'user_id' => 14, 'created_by' => 6, 'client_uuid' => 'jumeau'];

        $plan = \LegacyWorkspaces::plan($s);
        $this->assertSame(1, $plan['rows']['dives']['ws:4|null'], 'jumeau d\'id supérieure : auteur inconnu');
        $this->assertSame(2, $plan['rows']['dives']['ws:1|6'], 'jumeau d\'id inférieure : auteur conservé');
        $this->assertSame([4 => 'responsable'], $plan['clubs']['ws:2']['members'], 'structure archivée : owners seulement');
        $this->assertSame('perso:5', $plan['current'][5], 'structure archivée : club personnel');
        $this->assertSame([9 => 'responsable', 10 => 'dp'], $plan['clubs']['ws:3']['members'], 'sans owner : créateur responsable');
        $this->assertSame('ws:3', $plan['current'][9]);
        $this->assertSame(2, $plan['rows']['dives']['ws:1|null'], 'conflit d\'unicité : auteur inconnu');
        $this->assertSame(['sites : 1 ligne(s) sans propriétaire existant, supprimées par la migration 005'], $plan['warnings']);
    }

    public function testTechnicalAccountWithoutWorkspaceIsReported(): void
    {
        $s = self::productionSnapshot();
        $s['users'][] = ['id' => 40, 'kind' => 'workspace'];
        $plan = \LegacyWorkspaces::plan($s);
        $msg = 'compte-structure 40 sans structure : ses lignes resteraient sans club (la migration échouerait)';
        $this->assertContains($msg, $plan['warnings']);
        $this->assertSame([$msg], $plan['blocking'], 'bloquant : workspaces-plan --save sort en erreur');
    }

    // ── Cohérence avec le SQL de 007 ───────────────────────────────────────

    private static function clubsSql(): string
    {
        return (string)preg_replace('/\s+/', ' ', implode(";\n", \Migrator::splitStatements(
            (string)file_get_contents(self::MIGRATIONS . '/007_clubs.sql')
        )));
    }

    public function testSqlEncodesTheSameRules(): void
    {
        $sql = self::clubsSql();
        // Rôles : ROLE_MAP.
        $this->assertSame(['owner' => 'responsable', 'member' => 'dp'], \LegacyWorkspaces::ROLE_MAP);
        $this->assertStringContainsString("IF(wm.role = 'owner', 'responsable', 'dp')", $sql);
        // Structure archivée : owners seulement.
        $this->assertStringContainsString("WHERE w.archived_at IS NULL OR wm.role = 'owner'", $sql);
        // Pas de club personnel, d'adhésion ni d'auteur « compte-structure ».
        $this->assertStringContainsString("FROM users u WHERE u.kind = 'person' AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.auto_created_for = u.id)", $sql);
        $this->assertStringContainsString("JOIN users u ON u.id = wm.user_id AND u.kind = 'person'", $sql);
        $this->assertSame(3, substr_count($sql, "LEFT JOIN users a ON a.id = "), 'auteur = compte personne (divers, sites, dives)');
        // Club courant : session la plus récente non expirée, structure active, membre.
        $this->assertMatchesRegularExpression('/MAX\(s\.expires_at\).*WHERE s\.expires_at > NOW\(\).*JOIN workspaces w ON w\.id = s\.workspace_id AND w\.archived_at IS NULL.*JOIN club_members m ON m\.club_id = c\.id AND m\.user_id = u\.id/', $sql);
        // Conflit (auteur, client_uuid) : auteur NULL.
        $this->assertStringContainsString('SET v.user_id = IF(dup.id IS NULL AND sc.id IS NULL, a.id, NULL)', $sql);
        // Même (auteur, client_uuid) dans deux structures : critère sur club_id (stable pendant l'UPDATE).
        $this->assertStringContainsString('LEFT JOIN dives sib ON sib.created_by = v.created_by AND sib.client_uuid = v.client_uuid AND sib.id < v.id LEFT JOIN clubs sc ON sc.id = sib.club_id AND sc.legacy_workspace_id IS NOT NULL', $sql);
    }

    public function testSqlOrderProtectsTheData(): void
    {
        $stmts = array_map(
            static fn(string $s): string => (string)preg_replace('/\s+/', ' ', $s),
            \Migrator::splitStatements((string)file_get_contents(self::MIGRATIONS . '/007_clubs.sql'))
        );
        $pos = static function (string $regex) use ($stmts): int {
            foreach ($stmts as $i => $s) if (preg_match($regex, $s)) return $i;
            return -1;
        };
        $wsClubs   = $pos('/^INSERT IGNORE INTO clubs .*FROM workspaces w/');
        $wsMembers = $pos('/^INSERT IGNORE INTO club_members .*FROM workspace_members wm/');
        $current   = $pos('/^UPDATE users u JOIN \(SELECT s\.user_id, MAX/');
        $wsRows    = $pos('/^UPDATE dives v JOIN workspaces w ON w\.data_user_id = v\.user_id JOIN clubs c/');
        $notNull   = $pos('/^ALTER TABLE dives MODIFY club_id .* NOT NULL$/');
        $nullable  = $pos('/^ALTER TABLE dives MODIFY user_id INT UNSIGNED NULL$/');
        $authors   = $pos('/^UPDATE dives v JOIN workspaces w ON w\.data_user_id = v\.user_id LEFT JOIN users a/');

        foreach (compact('wsClubs', 'wsMembers', 'current', 'wsRows', 'notNull', 'nullable', 'authors') as $name => $i) {
            $this->assertGreaterThanOrEqual(0, $i, "instruction absente : {$name}");
        }
        $this->assertLessThan($wsMembers, $wsClubs, 'clubs de structure avant leurs membres');
        $this->assertLessThan($current, $wsMembers, 'membres avant le club courant (jointure club_members)');
        $this->assertLessThan($notNull, $wsRows, 'lignes rattachées avant NOT NULL');
        $this->assertLessThan($authors, $wsRows, 'rattachement au club (par user_id = compte-structure) avant le changement d\'auteur');
        $this->assertLessThan($authors, $nullable, 'user_id NULL-able avant l\'auteur inconnu (NULL)');
        $this->assertSame(count($stmts) - 1, $authors, 'l\'auteur des plongées est la dernière étape');
    }

    /**
     * Migrator::run sur une base à l'état de production (000, 001, 002
     * appliquées) : 003 → 011 dans l'ordre, chacune marquée après ses
     * instructions, sous verrou.
     */
    public function testMigratorAppliesOurMigrationsAfterTheProductionOnes(): void
    {
        $pdo = new RecordingPdo();
        $pdo->respond('/GET_LOCK/', [['l' => 1]]);
        $pdo->respond('/FROM schema_migrations/', [['version' => '000'], ['version' => '001'], ['version' => '002']]);

        $done = \Migrator::run($pdo);
        $this->assertSame(['003', '004', '005', '006', '007', '008', '009', '010', '011'], $done);

        $log = $pdo->statements();
        $marks = [];
        foreach ($pdo->log as $i => $e) {
            if (str_starts_with($e['sql'], 'INSERT IGNORE INTO schema_migrations')) $marks[$e['params'][0]] = $i;
        }
        $this->assertSame(['003', '004', '005', '006', '007', '008', '009', '010', '011'], array_keys($marks));
        $this->assertNotContains('000', array_keys($marks));
        $this->assertStringStartsWith('SELECT GET_LOCK', $log[0]);
        $this->assertStringStartsWith('SELECT RELEASE_LOCK', end($log));

        // Toutes les instructions de 007 entre la marque 006 et la marque 007.
        $first = $this->indexOf($log, '/^INSERT IGNORE INTO clubs .*FROM users u WHERE u\.kind = \'person\'/');
        $last  = $this->indexOf($log, '/^UPDATE dives v JOIN workspaces w ON w\.data_user_id = v\.user_id LEFT JOIN users a/');
        $this->assertGreaterThan($marks['006'], $first);
        $this->assertLessThan($marks['007'], $last);
        // 011 (index unique par club) passe après la reprise des auteurs de 007.
        $this->assertGreaterThan($marks['007'], $this->indexOf($log, '/^CREATE UNIQUE INDEX IF NOT EXISTS uq_dives_club_client/'));
    }

    private function indexOf(array $log, string $regex): int
    {
        foreach ($log as $i => $sql) if (preg_match($regex, $sql)) return $i;
        $this->fail("instruction absente : {$regex}");
    }
}
