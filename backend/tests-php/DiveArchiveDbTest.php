<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/**
 * Archivage serveur, partie base / disque : intégrité des documents,
 * régénération encadrée (journalisée avec l'ancienne empreinte), marquage
 * des participants calculés.
 */
final class DiveArchiveDbTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';
    private const DIVE = '7c1e5a90-2b3d-4e5f-8a9b-0c1d2e3f4a5b';

    private RecordingPdo $pdo;
    private string $root;
    /** @var list<array{kind: string, ctx: ?array}> */
    private array $logged = [];

    protected function setUp(): void
    {
        $this->pdo  = RecordingPdo::install();
        $this->root = sys_get_temp_dir() . '/dpfede-docs-' . bin2hex(random_bytes(4));
        mkdir($this->root, 0700, true);
        (new \ReflectionProperty(\Config::class, 'cfg'))->setValue(null, ['documents' => ['path' => $this->root]]);
        \Log::capture(function (string $kind, ?array $ctx): void {
            $this->logged[] = ['kind' => $kind, 'ctx' => $ctx];
        });
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
        \Log::capture(null);
        (new \ReflectionProperty(\Config::class, 'cfg'))->setValue(null, null);
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->root, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $f) $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        rmdir($this->root);
    }

    /** Écrit un document sur le disque et renvoie sa ligne dive_documents. */
    private function storedDocument(string $type, string $content, ?string $sha = null): array
    {
        $rel = \DiveArchive::relativePath(self::CLUB, self::DIVE, $type, '2026-10-20 10:00:00');
        @mkdir(dirname($this->root . '/' . $rel), 0700, true);
        file_put_contents($this->root . '/' . $rel, $content);
        return ['type' => $type, 'path' => $rel, 'sha256' => $sha ?? hash('sha256', $content)];
    }

    private function dive(?string $status, ?string $updatedAt = '2026-10-20 10:00:00'): array
    {
        return ['id' => self::DIVE, 'club_id' => self::CLUB, 'status' => 'archived',
                'documents_status' => $status, 'documents_updated_at' => $updatedAt];
    }

    public function testDocumentStatesDetectMissingAndAlteredFiles(): void
    {
        $fiche = $this->storedDocument('fiche', 'PDF-FICHE');
        $check = $this->storedDocument('checklist', 'PDF-CHECK', str_repeat('0', 64)); // empreinte fausse
        $this->pdo->respond('/FROM dive_documents/', [$fiche, $check]);
        $states = \DiveArchive::documentStates(self::DIVE);
        $this->assertSame('intact', $states['fiche']['state']);
        $this->assertSame(hash('sha256', 'PDF-FICHE'), $states['fiche']['sha256']);
        $this->assertSame('altered', $states['checklist']['state']);

        RecordingPdo::uninstall();
        $this->pdo = RecordingPdo::install();
        $this->pdo->respond('/FROM dive_documents/', []);
        $states = \DiveArchive::documentStates(self::DIVE);
        $this->assertSame(['state' => 'missing', 'sha256' => null], $states['fiche']);
        $this->assertSame(['state' => 'missing', 'sha256' => null], $states['checklist']);
    }

    public function testRegenerationOfCompleteDocumentsIsRefusedWithoutWriting(): void
    {
        $this->pdo->respond('/FROM dive_documents/', [
            $this->storedDocument('fiche', 'A'), $this->storedDocument('checklist', 'B'),
        ]);
        $res = \DiveArchive::regenerate($this->dive('ok'), new DateTimeImmutable('2026-10-20 12:00:00'));
        $this->assertSame('refused', $res['status']);
        $this->assertSame('DOCUMENTS_COMPLETE', $res['code']);
        $this->assertSame([], $this->pdo->matching('/^\s*(UPDATE|INSERT|DELETE)/'));
        $this->assertSame([], $this->logged);
    }

    public function testRegenerationIsJournaledWithThePreviousFingerprint(): void
    {
        $fiche = $this->storedDocument('fiche', 'ANCIENNE-FICHE');
        $this->pdo->respond('/FROM dive_documents/', [$fiche]);   // check-list manquante
        // La génération elle-même échoue ici (aucune plongée renvoyée) : seul
        // le journal de la demande nous intéresse.
        \DiveArchive::regenerate($this->dive('error'), new DateTimeImmutable('2026-10-20 12:00:00'));

        $entry = array_values(array_filter($this->logged, fn(array $l): bool => $l['kind'] === 'dive.documents_regenerated'))[0] ?? null;
        $this->assertNotNull($entry, 'régénération non journalisée');
        $this->assertSame(self::DIVE, $entry['ctx']['dive_id']);
        $this->assertSame('error', $entry['ctx']['previous_status']);
        $this->assertSame(hash('sha256', 'ANCIENNE-FICHE'), $entry['ctx']['previous']['fiche']['sha256']);
        $this->assertSame('missing', $entry['ctx']['previous']['checklist']['state']);
    }

    public function testParticipantsAreMarkedAsComputedEvenWhenThereAreNone(): void
    {
        $this->pdo->respond('/FROM dives d LEFT JOIN dive_runtime_state/', [[
            'id' => self::DIVE, 'club_id' => self::CLUB, 'date_plongee' => '2026-10-20 10:00:00',
            'answers' => '{}', 'palanquees' => '[{"id":"p1","membres":[]}]', 'render_state' => '{}',
        ]]);
        $this->assertSame(0, \DiveArchive::refreshParticipants(self::DIVE));
        $marks = $this->pdo->matching('/UPDATE dives SET participants_at=NOW\(\), updated_at=updated_at WHERE id=\?/');
        $this->assertCount(1, $marks);
        $this->assertSame([self::DIVE], $marks[0]['params']);
        // Dans la même transaction que les lignes de participants.
        $sql    = array_column($this->pdo->log, 'sql');
        $mark   = array_search($marks[0]['sql'], $sql, true);
        $begin  = array_search('BEGIN', $sql, true);
        $commit = array_search('COMMIT', $sql, true);
        $this->assertTrue($begin !== false && $begin < $mark && $mark < $commit);
    }
}
