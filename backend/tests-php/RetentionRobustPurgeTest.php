<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/** Tests de robustesse des purges (comptes inactifs et clubs échus) : un échec n'arrête pas la boucle. */
final class RetentionRobustPurgeTest extends TestCase
{
    private RecordingPdo $pdo;

    /** @var list<array{kind: string, ctx: ?array}> */
    private array $logged = [];

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
        $this->logged = [];
        \Log::capture(function (string $kind, ?array $ctx): void {
            $this->logged[] = ['kind' => $kind, 'ctx' => $ctx];
        });
    }

    protected function tearDown(): void
    {
        \Log::capture(null);
        RecordingPdo::uninstall();
    }

    public function testClubRetentionPurgeExpiredContinuesWhenOneClubFails(): void
    {
        $now = new DateTimeImmutable('2026-10-25');

        // Répondre avec 2 clubs échus : 'c-bad' (échouera) et 'c-good' (réussira)
        $this->pdo->respond(
            '/SELECT id FROM clubs WHERE deleted_at IS NOT NULL/i',
            [['id' => 'c-bad'], ['id' => 'c-good']]
        );

        // Faire échouer la suppression pour 'c-bad'
        $this->pdo->respond(
            '/FROM dive_documents WHERE club_id/i',
            function (string $sql, array $params): array {
                if (($params[0] ?? null) === 'c-bad') {
                    throw new \PDOException('Erreur SQL simulée sur c-bad');
                }
                return [];
            }
        );

        $successCount = \ClubRetention::purgeExpired(false, $now);

        // Seul c-good doit être comptabilisé dans les succès
        $this->assertSame(1, $successCount);

        // Vérifier la journalisation de l'échec
        $failedLogs = array_values(array_filter(
            $this->logged,
            static fn(array $l): bool => $l['kind'] === 'purge.item_failed'
        ));
        $this->assertCount(1, $failedLogs);
        $this->assertSame('club', $failedLogs[0]['ctx']['kind'] ?? null);
        $this->assertSame('c-bad', $failedLogs[0]['ctx']['id'] ?? null);
    }

    public function testRetentionInactiveAccountsContinuesWhenOneAccountFails(): void
    {
        $now = new DateTimeImmutable('2026-10-25 03:00:00');

        // Deux comptes inactifs trouvés : 10 (échouera) et 20 (réussira)
        $this->pdo->respond(
            '/SELECT u\.id FROM users u/i',
            [['id' => 10], ['id' => 20]]
        );

        // Aucun club blocker pour ces comptes
        $this->pdo->respond('/SELECT c\.id FROM clubs c/i', []);
        $this->pdo->respond('/SELECT club_id FROM club_members/i', []);

        // Faire échouer la transaction ou requête sur le compte 10
        $this->pdo->respond(
            '/DELETE FROM sessions WHERE user_id/i',
            function (string $sql, array $params): array {
                if (($params[0] ?? null) === 10) {
                    throw new \PDOException('Erreur SQL simulée sur user 10');
                }
                return [];
            }
        );

        $opts = [
            'dry_run'                 => false,
            'soft_deleted_days'       => 0,
            'archived_dives_years'    => 0,
            'inactive_accounts_years' => 2,
        ];

        $res = \Retention::run($opts, $now);

        // Seul user 20 doit être comptabilisé
        $this->assertSame(1, $res['accounts_inactive'] ?? null);

        // Vérifier la journalisation de l'échec
        $failedLogs = array_values(array_filter(
            $this->logged,
            static fn(array $l): bool => $l['kind'] === 'purge.item_failed'
        ));
        $this->assertCount(1, $failedLogs);
        $this->assertSame('account', $failedLogs[0]['ctx']['kind'] ?? null);
        $this->assertSame(10, $failedLogs[0]['ctx']['id'] ?? null);
    }
}
