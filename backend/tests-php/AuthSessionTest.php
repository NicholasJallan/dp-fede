<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/**
 * Auth::current — session valide, mais compte-structure (migration 002) :
 * jamais connectable, même avec une session forgée en base.
 */
final class AuthSessionTest extends TestCase
{
    private RecordingPdo $pdo;
    private string $sid;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
        $this->sid = str_repeat('a', 64);
        $_COOKIE['dp_session'] = $this->sid;
        // Expiration lointaine : pas de renouvellement glissant (pas d'en-tête Set-Cookie).
        $this->pdo->respond('/FROM sessions/', [['user_id' => 14, 'expires_at' => date('Y-m-d H:i:s', time() + 604800)]]);
    }

    protected function tearDown(): void
    {
        unset($_COOKIE['dp_session']);
        RecordingPdo::uninstall();
    }

    public function testTechnicalAccountSessionIsRejected(): void
    {
        $this->pdo->respond('/FROM users/', [['id' => 14, 'kind' => 'workspace', 'email' => 'structure+x@dp-fede.invalid']]);
        $this->assertNull(\Auth::current());
    }

    public function testPersonSessionIsAccepted(): void
    {
        $this->pdo->respond('/FROM users/', [['id' => 2, 'kind' => 'person', 'email' => 'dp@example.com']]);
        $this->assertSame(2, (int)(\Auth::current()['id'] ?? 0));
    }
}
