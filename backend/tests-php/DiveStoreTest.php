<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/** Accès base des plongées : résolution id / client_uuid, écriture de l'état d'exécution. */
final class DiveStoreTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';
    private const ID   = '7c1e5a90-2b3d-4e5f-8a9b-0c1d2e3f4a5b';

    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    public function testFindActivePrefersTheServerIdOverAClientUuid(): void
    {
        $this->pdo->respond('/FROM dives/', [['id' => self::ID, 'status' => 'prepared']]);
        $row = \DiveStore::findActive(self::ID, self::CLUB);
        $this->assertSame(self::ID, $row['id']);

        $sql = $this->pdo->statements()[0];
        $this->assertStringContainsString('(id=? OR client_uuid=?) AND club_id=? AND deleted_at IS NULL', $sql);
        $this->assertStringContainsString('ORDER BY (id = ?) DESC LIMIT 1', $sql);
        $this->assertSame([self::ID, self::ID, self::CLUB, self::ID], $this->pdo->log[0]['params']);
    }

    public function testFindActiveReturnsNullWhenAbsent(): void
    {
        $this->assertNull(\DiveStore::findActive(self::ID, self::CLUB));
    }

    public function testRowsByClientUuidSeesEveryClubAndSoftDeletes(): void
    {
        \DiveStore::rowsByClientUuid(self::ID);
        $sql = $this->pdo->statements()[0];
        $this->assertStringContainsString('SELECT id, club_id, deleted_at FROM dives WHERE client_uuid=?', $sql);
        $this->assertStringNotContainsString('club_id=?', $sql);
        $this->assertStringNotContainsString('deleted_at IS NULL', $sql);
    }

    public function testRuntimeStateIsWrittenOnlyWhileTheDiveIsNotArchived(): void
    {
        $this->pdo->respond('/INSERT INTO dive_runtime_state/', [], 1);
        $this->assertTrue(\DiveStore::writeRuntimeStateUnlessArchived(self::ID, '{"checked":[]}'));
        $sql = $this->pdo->statements()[0];
        $this->assertMatchesRegularExpression(
            "/INSERT INTO dive_runtime_state \\(dive_id, state\\) SELECT id, \\? FROM dives WHERE id=\\? AND status<>'archived'/",
            $sql
        );
        $this->assertStringContainsString('ON DUPLICATE KEY UPDATE state=?', $sql);
    }

    public function testRuntimeStateRefusedWhenTheDiveWasArchivedMeanwhile(): void
    {
        // rowCount 0 : soit l'état est inchangé, soit la plongée est archivée.
        $this->pdo->respond('/INSERT INTO dive_runtime_state/', [], 0);
        $this->pdo->respond('/SELECT status FROM dives/', [['status' => 'archived']]);
        $this->assertFalse(\DiveStore::writeRuntimeStateUnlessArchived(self::ID, '{}'));
    }

    public function testUnchangedRuntimeStateOfAnActiveDiveIsAccepted(): void
    {
        $this->pdo->respond('/INSERT INTO dive_runtime_state/', [], 0);
        $this->pdo->respond('/SELECT status FROM dives/', [['status' => 'in_progress']]);
        $this->assertTrue(\DiveStore::writeRuntimeStateUnlessArchived(self::ID, '{}'));
    }
}
