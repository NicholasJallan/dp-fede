<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/** RGPD — recevabilité de la suppression de compte et forme de l'export. */
final class AccountTest extends TestCase
{
    private const CONFIRM = ['confirm' => 'SUPPRIMER'];

    public function testDeletionRequiresExplicitConfirmation(): void
    {
        $user = ['id' => 7, 'role' => 'user', 'email' => 'a@example.com'];
        foreach ([[], ['confirm' => 'supprimer'], ['confirm' => true], ['confirm' => 'OUI']] as $body) {
            $err = \Account::deletionError($user, $body, 1);
            $this->assertNotNull($err);
            $this->assertSame(422, $err[0]);
        }
    }

    public function testRegularUserCanDelete(): void
    {
        $user = ['id' => 7, 'role' => 'user', 'email' => 'a@example.com'];
        $this->assertNull(\Account::deletionError($user, self::CONFIRM, 0));
    }

    public function testSoleSuperAdminCannotDelete(): void
    {
        $user = ['id' => 1, 'role' => 'admin', 'email' => \Auth::SUPER_ADMIN_EMAIL];
        $err  = \Account::deletionError($user, self::CONFIRM, 0);
        $this->assertNotNull($err);
        $this->assertSame(409, $err[0]);
    }

    public function testSuperAdminWithoutAdminRoleStillCountsAsAdmin(): void
    {
        $user = ['id' => 1, 'role' => 'user', 'email' => \Auth::SUPER_ADMIN_EMAIL];
        $this->assertSame(409, \Account::deletionError($user, self::CONFIRM, 0)[0]);
    }

    public function testAdminCanDeleteWhenAnotherAdminExists(): void
    {
        $user = ['id' => 1, 'role' => 'admin', 'email' => \Auth::SUPER_ADMIN_EMAIL];
        $this->assertNull(\Account::deletionError($user, self::CONFIRM, 1));
    }

    public function testExportDecodesJsonAndStripsSessionIds(): void
    {
        $export = \Account::buildExport(
            ['id' => 3, 'email' => 'dp@example.com'],
            [['id' => 'd1', 'qualifs' => '{"nitrox":["PN"]}', 'aptitudes_sup' => null, 'medical' => '2026-01-01']],
            [['id' => 's1', 'coordonnees' => '{"lat":43.1,"lng":5.9}']],
            [['id' => 'v1', 'answers' => '{"dp_nom":"X"}', 'palanquees' => '[{"id":"p1"}]', 'render_state' => null]],
            [['id' => str_repeat('a', 64), 'ip_addr' => '192.0.2.1', 'user_agent' => 'UA']],
            '2026-10-20T10:00:00+02:00'
        );

        $this->assertSame('dp-assistant-export/2', $export['format']);
        $this->assertSame('2026-10-20T10:00:00+02:00', $export['generated_at']);
        $this->assertSame(['nitrox' => ['PN']], $export['divers'][0]['qualifs']);
        $this->assertSame([], $export['divers'][0]['aptitudes_sup']);
        $this->assertSame(['lat' => 43.1, 'lng' => 5.9], $export['sites'][0]['coordonnees']);
        $this->assertSame(['dp_nom' => 'X'], $export['dives'][0]['answers']);
        $this->assertSame([['id' => 'p1']], $export['dives'][0]['palanquees']);
        $this->assertInstanceOf(\stdClass::class, $export['dives'][0]['render_state']);
        $this->assertArrayNotHasKey('id', $export['sessions'][0]);
        $this->assertSame('192.0.2.1', $export['sessions'][0]['ip_addr']);
    }

    public function testSoleResponsableOfSharedClubCannotDelete(): void
    {
        $user = ['id' => 7, 'role' => 'user', 'email' => 'a@example.com'];
        $err  = \Account::deletionError($user, self::CONFIRM, 0, [['club_id' => 'c1', 'nom' => 'Bulles']]);
        $this->assertSame(409, $err[0]);
        $this->assertStringContainsString('« Bulles »', $err[1]);
        // La confirmation reste vérifiée en premier.
        $this->assertSame(422, \Account::deletionError($user, [], 0, [['club_id' => 'c1', 'nom' => 'Bulles']])[0]);
    }

    public function testClubBlockerMessageNamesUnnamedClubs(): void
    {
        $msg = \Account::clubBlockerMessage([['club_id' => 'c1', 'nom' => ''], ['club_id' => 'c2', 'nom' => 'B']]);
        $this->assertStringContainsString('« club sans nom », « B »', $msg);
    }

    public function testExportIncludesClubsAndStripsSecrets(): void
    {
        $export = \Account::buildExport(
            ['id' => 3, 'email' => 'dp@example.com', 'google_sub' => '1234'],
            [], [], [], [],
            '2026-10-20T10:00:00+02:00',
            [['club_id' => 'c1', 'nom' => 'Bulles', 'role' => 'responsable']],
            [['id' => 'i1', 'email' => 'x@example.com', 'token_hash' => str_repeat('f', 64)]]
        );
        $this->assertArrayNotHasKey('google_sub', $export['account']);
        $this->assertSame('responsable', $export['clubs'][0]['role']);
        $this->assertArrayNotHasKey('token_hash', $export['invitations'][0]);
        $this->assertSame('x@example.com', $export['invitations'][0]['email']);
    }

    public function testDecodeJsonFallsBackOnInvalidInput(): void
    {
        $this->assertSame([], \Account::decodeJson('{invalide', []));
        $this->assertNull(\Account::decodeJson('', null));
        $this->assertNull(\Account::decodeJson('null', 'défaut'));
    }
}
