<?php
declare(strict_types=1);

namespace DpFede\Tests;

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
}
