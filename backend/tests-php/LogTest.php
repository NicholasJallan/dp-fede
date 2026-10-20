<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/** Log::buildEntry — l'acteur authentifié doit figurer dans chaque entrée. */
final class LogTest extends TestCase
{
    protected function tearDown(): void
    {
        \Log::setActor(null);
    }

    public function testActorIsRecorded(): void
    {
        $e = \Log::buildEntry('dive.created', ['dive_id' => 'x'], 42, ['REMOTE_ADDR' => '192.0.2.1', 'REQUEST_URI' => '/api/dives']);
        $this->assertSame(42, $e['user_id']);
        $this->assertSame('dive.created', $e['kind']);
        $this->assertSame('192.0.2.1', $e['ip']);
        $this->assertSame(['dive_id' => 'x'], $e['ctx']);
    }

    public function testExplicitUserIdWinsAndIsRemovedFromContext(): void
    {
        $e = \Log::buildEntry('auth.login', ['user_id' => '5'], null, []);
        $this->assertSame(5, $e['user_id']);
        $this->assertNull($e['ctx']);
    }

    public function testQueryStringIsNotLogged(): void
    {
        $e = \Log::buildEntry('x', null, null, ['REQUEST_URI' => '/api/dives?since=2026-01-01']);
        $this->assertSame('/api/dives', $e['path']);
    }

    public function testSetActor(): void
    {
        \Log::setActor(9);
        $this->assertSame(9, \Log::actor());
    }
}
