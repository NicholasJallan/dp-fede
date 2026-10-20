<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/**
 * Club — opérations base sensibles à la concurrence (dernier responsable),
 * statistiques (participants calculés une seule fois), UPSERT par club.
 */
final class ClubDbTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';

    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    private function members(): array
    {
        return [
            ['user_id' => 1, 'role' => 'responsable'],
            ['user_id' => 2, 'role' => 'dp'],
        ];
    }

    // ── Dernier responsable (pur) ──────────────────────────────────────────

    public function testLastResponsableViolation(): void
    {
        $m = $this->members();
        $this->assertSame('not_member', \Club::lastResponsableViolation($m, 9, 'dp'));
        $this->assertSame('last_responsable', \Club::lastResponsableViolation($m, 1, 'dp'));
        $this->assertSame('last_responsable', \Club::lastResponsableViolation($m, 1, null)); // retrait
        $this->assertNull(\Club::lastResponsableViolation($m, 1, 'responsable'));
        $this->assertNull(\Club::lastResponsableViolation($m, 2, null));
        $m[] = ['user_id' => 3, 'role' => 'responsable'];
        $this->assertNull(\Club::lastResponsableViolation($m, 1, 'lecture'));
    }

    // ── Verrouillage (SELECT … FOR UPDATE dans une transaction) ────────────

    public function testRoleChangeLocksTheMembersBeforeChecking(): void
    {
        $this->pdo->respond('/FROM club_members/', $this->members());
        $this->assertNull(\Club::changeMemberRole(self::CLUB, 2, 'responsable'));
        $sql = $this->pdo->statements();
        $this->assertSame('BEGIN', $sql[0]);
        $this->assertMatchesRegularExpression('/^SELECT user_id, role FROM club_members WHERE club_id=\? FOR UPDATE$/', $sql[1]);
        $this->assertStringStartsWith('UPDATE club_members SET role=? WHERE club_id=? AND user_id=?', $sql[2]);
        $this->assertSame('COMMIT', end($sql));
    }

    public function testDemotingTheLastResponsableWritesNothing(): void
    {
        $this->pdo->respond('/FROM club_members/', $this->members());
        $this->assertSame('last_responsable', \Club::changeMemberRole(self::CLUB, 1, 'dp'));
        $this->assertSame([], $this->pdo->matching('/^\s*UPDATE club_members/'));
        $this->assertContains('FOR UPDATE', array_map(static fn(string $s): string => substr($s, -10), $this->pdo->statements()));
    }

    public function testRemovingAMemberIsLockedToo(): void
    {
        $this->pdo->respond('/FROM club_members/', $this->members());
        $this->assertNull(\Club::removeMember(self::CLUB, 2));
        $sql = $this->pdo->statements();
        $this->assertSame('BEGIN', $sql[0]);
        $this->assertStringEndsWith('FOR UPDATE', $sql[1]);
        $this->assertContains('DELETE FROM club_members WHERE club_id=? AND user_id=?', $sql);
        $this->assertContains('UPDATE users SET current_club_id=NULL WHERE id=? AND current_club_id=?', $sql);

        RecordingPdo::uninstall();
        $this->pdo = RecordingPdo::install();
        $this->pdo->respond('/FROM club_members/', $this->members());
        $this->assertSame('last_responsable', \Club::removeMember(self::CLUB, 1));
        $this->assertSame([], $this->pdo->matching('/DELETE FROM club_members/'));
        $this->assertSame('not_member', \Club::removeMember(self::CLUB, 42));
    }

    // ── Statistiques : participants calculés une fois ──────────────────────

    public function testStatsComputeMissingParticipantsOnlyOnce(): void
    {
        \ClubStats::fetch(self::CLUB, '2026-09-15', '2027-09-14');
        $select = $this->pdo->statements()[0];
        // Repère : participants_at (posé même à zéro participant), plus de
        // NOT EXISTS ni de filtre sur palanquees recalculé à chaque appel.
        $this->assertStringContainsString('d.participants_at IS NULL', $select);
        $this->assertStringNotContainsString('NOT EXISTS', $select);
        $this->assertStringNotContainsString('d.palanquees', $select);
    }
}
