<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/RulesFor.php')) {
    require_once __DIR__ . '/../lib/RulesFor.php';
}

/**
 * Dispatcher de règles backend — RulesFor::forJurisdiction()
 */
final class RulesForTest extends TestCase
{
    public function testForJurisdictionReturnsRulesClassAtLotZero(): void
    {
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction('FR'));
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction('PF'));
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction(null));
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction(''));
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction('XX'));
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction('  fr  '));
        $this->assertSame(\Rules::class, \RulesFor::forJurisdiction('  pf  '));
    }
}
