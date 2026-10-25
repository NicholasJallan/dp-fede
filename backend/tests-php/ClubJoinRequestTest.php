<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/**
 * Demandes d'adhésion : message, une seule demande en attente, décision
 * du responsable sous verrou, club personnel vide du demandeur supprimé.
 */
final class ClubJoinRequestTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';
    private const REQ  = '5d6e7f80-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    public function testMessageIsOptionalTrimmedAndBounded(): void
    {
        $this->assertSame([null, null], \ClubJoinRequest::sanitizeMessage(null));
        $this->assertSame([null, null], \ClubJoinRequest::sanitizeMessage('   '));
        $this->assertSame(['Bonjour', null], \ClubJoinRequest::sanitizeMessage(' Bonjour '));
        $this->assertNotNull(\ClubJoinRequest::sanitizeMessage(['x'])[1]);
        $this->assertNotNull(\ClubJoinRequest::sanitizeMessage(str_repeat('é', \ClubJoinRequest::MESSAGE_MAX + 1))[1]);
        $this->assertNull(\ClubJoinRequest::sanitizeMessage(str_repeat('é', \ClubJoinRequest::MESSAGE_MAX))[1]);
    }

    public function testASecondPendingRequestIsRefusedByTheUniqueIndex(): void
    {
        $this->pdo->respond('/^INSERT INTO club_join_requests/', static function (): array {
            throw new \PDOException("SQLSTATE[23000]: Duplicate entry 'x-7-1' for key 'uq_club_join_pending'", 23000);
        });
        $this->assertNull(\ClubJoinRequest::create(self::CLUB, 7, null));
    }

    public function testOtherDatabaseErrorsAreNotSwallowed(): void
    {
        $this->pdo->respond('/^INSERT INTO club_join_requests/', static function (): array {
            throw new \PDOException("SQLSTATE[23000]: Cannot add or update a child row: a foreign key constraint fails", 23000);
        });
        $this->expectException(\PDOException::class);
        \ClubJoinRequest::create(self::CLUB, 7, null);
    }

    public function testCreateReturnsTheStoredRequest(): void
    {
        $this->pdo->respond('/FROM club_join_requests r JOIN clubs/', [[
            'id' => self::REQ, 'club_id' => self::CLUB, 'club_nom' => 'Bulles', 'status' => 'pending',
            'role' => null, 'message' => 'Salut', 'created_at' => '2026-10-25 10:00:00', 'decided_at' => null,
        ]]);
        $req = \ClubJoinRequest::create(self::CLUB, 7, 'Salut');
        $this->assertSame([self::CLUB, 7, 'Salut'], array_slice($this->pdo->log[0]['params'], 1));
        $pub = \ClubJoinRequest::publicForUser($req);
        $this->assertSame('pending', $pub['status']);
        $this->assertSame('Bulles', $pub['club_nom']);
    }

    public function testAcceptLocksTheRequestThenEnrollsTheRequester(): void
    {
        $this->pdo->respond('/FROM club_join_requests WHERE id=\? AND club_id=\? AND status=\'pending\' FOR UPDATE/', [['user_id' => '7']]);
        $this->assertSame(7, \ClubJoinRequest::accept(self::CLUB, self::REQ, 'dp', 1));

        $sql = $this->pdo->statements();
        $this->assertSame('BEGIN', $sql[0]);
        $this->assertStringEndsWith('FOR UPDATE', $sql[1]);
        $this->assertStringStartsWith('INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role = role', $sql[2]);
        $this->assertSame([self::CLUB, 7, 'dp'], $this->pdo->log[2]['params']);
        $this->assertStringStartsWith("UPDATE club_join_requests SET status='accepted'", $sql[3]);
        $this->assertSame(['dp', 1, self::REQ], $this->pdo->log[3]['params']);
        $this->assertSame('COMMIT', $sql[4]);
        // Puis : club courant s'il n'en a pas ou s'il était sur son club personnel
        // jamais nommé — club conservé (saisies hors ligne encore en file).
        $this->assertCount(6, $sql);
        $this->assertStringStartsWith('UPDATE users SET current_club_id=? WHERE id=? AND (current_club_id IS NULL', $sql[5]);
        $this->assertStringContainsString("auto_created_for=? AND nom=''", $sql[5]);
        $this->assertSame([self::CLUB, 7, 7], end($this->pdo->log)['params']);
        $this->assertSame([], $this->pdo->matching('/DELETE FROM clubs/'));
    }

    public function testAcceptingAnAlreadyHandledRequestWritesNothing(): void
    {
        $this->assertNull(\ClubJoinRequest::accept(self::CLUB, self::REQ, 'dp', 1));
        $this->assertSame([], $this->pdo->matching('/^\s*(INSERT|UPDATE)/'));
    }

    public function testRefuseAndCancelOnlyTouchPendingRequests(): void
    {
        $this->pdo->respond('/^UPDATE club_join_requests/', [], 1);
        $this->assertTrue(\ClubJoinRequest::refuse(self::CLUB, self::REQ, 1));
        $this->assertTrue(\ClubJoinRequest::cancel(7, self::REQ));
        [$refuse, $cancel] = $this->pdo->statements();
        $this->assertStringEndsWith("WHERE id=? AND club_id=? AND status='pending'", $refuse);
        $this->assertStringEndsWith("WHERE id=? AND user_id=? AND status='pending'", $cancel);
        $this->assertSame([1, self::REQ, self::CLUB], $this->pdo->log[0]['params']);
        $this->assertSame([self::REQ, 7], $this->pdo->log[1]['params']);
    }

    public function testRequesterIdentityIsShownToTheClub(): void
    {
        $this->pdo->respond('/FROM club_join_requests r JOIN users/', [[
            'id' => self::REQ, 'user_id' => '7', 'message' => null, 'created_at' => '2026-10-25 10:00:00',
            'nom' => 'Dupont', 'prenom' => 'Ana', 'email' => 'ana@example.com', 'avatar_url' => null,
        ]]);
        $list = \ClubJoinRequest::listForClub(self::CLUB);
        $this->assertSame(7, $list[0]['user_id']);
        $this->assertSame('ana@example.com', $list[0]['email']);
        $this->assertStringContainsString("r.status='pending'", $this->pdo->statements()[0]);
    }

    public function testRequesterSeesPendingAndRecentDecisionsOnly(): void
    {
        \ClubJoinRequest::listForUser(7);
        $sql = $this->pdo->statements()[0];
        $this->assertStringContainsString("r.status <> 'cancelled'", $sql);
        $this->assertStringContainsString('INTERVAL ' . \ClubJoinRequest::RECENT_DAYS . ' DAY', $sql);
        $this->assertStringContainsString('c.deleted_at IS NULL', $sql);
    }
}
