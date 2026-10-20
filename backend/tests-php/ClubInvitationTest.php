<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

/** Invitations : jeton à usage unique, expiration, contrôle de l'e-mail. */
final class ClubInvitationTest extends TestCase
{
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->now = new DateTimeImmutable('2026-10-20 10:00:00');
    }

    private function inv(array $over = []): array
    {
        return $over + [
            'id' => 'i1', 'club_id' => 'c1', 'email' => 'Invite@Example.com', 'role' => 'dp',
            'token_hash' => str_repeat('a', 64), 'invited_by' => 3,
            'expires_at' => '2026-10-25 10:00:00', 'accepted_at' => null, 'revoked_at' => null,
            'created_at' => '2026-10-18 10:00:00',
        ];
    }

    public function testTokenIsRandomHexAndOnlyItsHashIsStored(): void
    {
        $t1 = \ClubInvitation::newToken();
        $t2 = \ClubInvitation::newToken();
        $this->assertTrue(\ClubInvitation::isTokenFormat($t1));
        $this->assertNotSame($t1, $t2);
        $hash = \ClubInvitation::hashToken($t1);
        $this->assertSame(64, strlen($hash));
        $this->assertNotSame($t1, $hash);
        $this->assertSame(hash('sha256', $t1), $hash);
        $this->assertFalse(\ClubInvitation::isTokenFormat('ABC'));
        $this->assertFalse(\ClubInvitation::isTokenFormat(strtoupper($t1)));
    }

    public function testLinkCarriesTokenInFragment(): void
    {
        $this->assertSame(
            'https://dp-fede.example/#invitation=abc',
            \ClubInvitation::link('dp-fede.example', 'abc')
        );
    }

    public function testExpiresAfterSevenDays(): void
    {
        $this->assertSame('2026-10-27 10:00:00', \ClubInvitation::expiresAt($this->now));
    }

    public function testStatus(): void
    {
        $this->assertSame('pending', \ClubInvitation::status($this->inv(), $this->now));
        $this->assertSame('accepted', \ClubInvitation::status($this->inv(['accepted_at' => '2026-10-19 08:00:00']), $this->now));
        $this->assertSame('revoked', \ClubInvitation::status($this->inv(['revoked_at' => '2026-10-19 08:00:00']), $this->now));
        $this->assertSame('expired', \ClubInvitation::status($this->inv(['expires_at' => '2026-10-20 10:00:00']), $this->now));
        $this->assertSame('expired', \ClubInvitation::status($this->inv(['expires_at' => 'n/a']), $this->now));
    }

    public function testAcceptRequiresMatchingEmailCaseInsensitive(): void
    {
        $this->assertNull(\ClubInvitation::acceptError($this->inv(), ' invite@example.COM ', $this->now));
        $err = \ClubInvitation::acceptError($this->inv(), 'autre@example.com', $this->now);
        $this->assertSame(403, $err[0]);
    }

    public function testAcceptRefusedWhenUsedRevokedOrExpired(): void
    {
        foreach ([
            ['accepted_at' => '2026-10-19 08:00:00'],
            ['revoked_at' => '2026-10-19 08:00:00'],
            ['expires_at' => '2026-10-19 08:00:00'],
        ] as $over) {
            $err = \ClubInvitation::acceptError($this->inv($over), 'invite@example.com', $this->now);
            $this->assertSame(410, $err[0], json_encode($over));
        }
    }

    public function testPublicInvitationNeverExposesTokenHash(): void
    {
        $pub = \ClubInvitation::publicInvitation($this->inv(), $this->now);
        $this->assertArrayNotHasKey('token_hash', $pub);
        $this->assertSame('pending', $pub['status']);
        $this->assertSame('2026-10-25T10:00:00', $pub['expires_at']);
        $this->assertSame(3, $pub['invited_by']);
    }

    public function testEmailValidation(): void
    {
        $this->assertTrue(\ClubInvitation::isValidEmail('dp@club.fr'));
        $this->assertFalse(\ClubInvitation::isValidEmail('pas-un-email'));
        $this->assertFalse(\ClubInvitation::isValidEmail(''));
        $this->assertSame('dp@club.fr', \ClubInvitation::normalizeEmail('  DP@Club.FR '));
    }
}
