<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/** Tests pour DivePdf::clubProfile : repli sur Club::DEFAULT_URGENCE ('112'). */
final class DivePdfTest extends TestCase
{
    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    public function testClubProfileDefaultsUrgenceTo112WhenNull(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Club Bulles', 'urgence_defaut' => null],
        ]);

        $profile = \DivePdf::clubProfile('c-1');
        $this->assertSame('Club Bulles', $profile['club_nom']);
        $this->assertSame('112', $profile['urgence_defaut']);
    }

    public function testClubProfileDefaultsUrgenceTo112WhenEmptyString(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Club Bulles', 'urgence_defaut' => ''],
        ]);

        $profile = \DivePdf::clubProfile('c-1');
        $this->assertSame('112', $profile['urgence_defaut']);
    }

    public function testClubProfilePreservesExplicitUrgenceNumber(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Club Suisse', 'urgence_defaut' => '144'],
        ]);

        $profile = \DivePdf::clubProfile('c-swiss');
        $this->assertSame('144', $profile['urgence_defaut']);
    }

    public function testClubProfileDefaultsUrgenceTo112WhenClubNotFound(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', []);

        $profile = \DivePdf::clubProfile('c-missing');
        $this->assertNull($profile['club_nom']);
        $this->assertSame('112', $profile['urgence_defaut']);
    }
}
