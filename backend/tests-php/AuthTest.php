<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Auth — vérification ID token Google + super-admin gate.
 *
 * On ne teste pas verifyGoogleToken contre l'endpoint live (network).
 * À la place :
 *  - on couvre isSuperAdmin (logique pure)
 *  - on couvre la constante SUPER_ADMIN_EMAIL (régression : ne pas
 *    changer accidentellement le compte super-admin)
 */
final class AuthTest extends TestCase
{
    public function testSuperAdminEmailConstantStable(): void
    {
        // Si quelqu'un change accidentellement la constante (rebase, refactor),
        // ce test red-flag immédiatement.
        $this->assertSame(
            'nicholas.jallan@gmail.com',
            \Auth::SUPER_ADMIN_EMAIL,
            'SUPER_ADMIN_EMAIL doit rester nicholas.jallan@gmail.com (single super-admin)'
        );
    }

    public function testIsSuperAdminTrueForSuperAdmin(): void
    {
        $user = ['email' => 'nicholas.jallan@gmail.com', 'role' => 'admin'];
        $this->assertTrue(\Auth::isSuperAdmin($user));
    }

    public function testIsSuperAdminFalseForOtherAdmin(): void
    {
        // Même avec role=admin en DB, un autre email ne doit PAS être super-admin.
        // C'est le rempart contre l'escalade par modification DB.
        $user = ['email' => 'fake.admin@example.com', 'role' => 'admin'];
        $this->assertFalse(\Auth::isSuperAdmin($user));
    }

    public function testIsSuperAdminFalseForNull(): void
    {
        $this->assertFalse(\Auth::isSuperAdmin(null));
    }

    public function testIsSuperAdminFalseForUserWithoutEmail(): void
    {
        $this->assertFalse(\Auth::isSuperAdmin(['role' => 'admin']));
    }

    #[DataProvider('emailVerifiedValues')]
    public function testIsEmailVerified($value, bool $expected): void
    {
        $payload = $value === '__absent__' ? [] : ['email_verified' => $value];
        $this->assertSame($expected, \Auth::isEmailVerified($payload));
    }

    public static function emailVerifiedValues(): array
    {
        return [
            'JWT booléen true'      => [true, true],
            'tokeninfo "true"'      => ['true', true],
            'false'                 => [false, false],
            'tokeninfo "false"'     => ['false', false],
            'absent'                => ['__absent__', false],
            'entier 1 (non standard)' => [1, false],
        ];
    }

    /**
     * Cache JWKS dans l'APCu partagé par les pools de php8.5-fpm : une entrée
     * écrite par une autre application (clés injectées) doit être ignorée.
     */
    public function testJwksCacheEntryIsSigned(): void
    {
        $secret = random_bytes(32);
        $jwks   = ['keys' => [['kid' => 'k1', 'n' => 'abc', 'e' => 'AQAB']]];
        $entry  = \Auth::sealJwks($jwks, $secret);
        $this->assertSame($jwks, \Auth::unsealJwks($entry, $secret));

        $forged = ['keys' => [['kid' => 'k1', 'n' => 'attaquant', 'e' => 'AQAB']]];
        $this->assertNull(\Auth::unsealJwks(['json' => json_encode($forged), 'mac' => $entry['mac']], $secret));
        $this->assertNull(\Auth::unsealJwks(\Auth::sealJwks($forged, 'autre-secret'), $secret));
        $this->assertNull(\Auth::unsealJwks($jwks, $secret), 'ancienne entrée non signée');
        $this->assertNull(\Auth::unsealJwks(false, $secret));
    }
}
