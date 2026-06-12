<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Couvre parseDiveDateToMySql et normalizeDiveDate (routes/dives.php).
 *
 * Ces helpers sont la frontière entre :
 *  - le format ISO utilisé par le front (YYYY-MM-DDTHH:mm)
 *  - le format MySQL DATETIME (Y-m-d H:i:s).
 *
 * Toute régression ici casse silencieusement les dates plongée → priorité
 * haute pour la non-régression.
 */
final class DiveDateHelpersTest extends TestCase
{
    /** @dataProvider validIsoDates */
    public function testParseIso(string $input, string $expectedMysql): void
    {
        $this->assertSame($expectedMysql, \parseDiveDateToMySql($input));
    }

    public static function validIsoDates(): array
    {
        return [
            'ISO short'      => ['2026-06-12T08:30',     '2026-06-12 08:30:00'],
            'ISO with secs'  => ['2026-06-12T08:30:45',  '2026-06-12 08:30:45'],
            'space format'   => ['2026-06-12 08:30',     '2026-06-12 08:30:00'],
            'date only'      => ['2026-06-12',           '2026-06-12 00:00:00'],
        ];
    }

    public function testParseEmptyReturnsNull(): void
    {
        $this->assertNull(\parseDiveDateToMySql(''));
        $this->assertNull(\parseDiveDateToMySql('   '));
    }

    public function testParseGarbageReturnsNull(): void
    {
        $this->assertNull(\parseDiveDateToMySql('not-a-date'));
        $this->assertNull(\parseDiveDateToMySql('2026-13-99'));
    }

    public function testNormalizeRoundTrip(): void
    {
        $iso  = '2026-06-12T08:30';
        $sql  = \parseDiveDateToMySql($iso);
        $back = \normalizeDiveDate($sql);
        $this->assertSame($iso, $back);
    }

    public function testNormalizeNullReturnsNull(): void
    {
        $this->assertNull(\normalizeDiveDate(null));
    }

    public function testNormalizeMalformedSqlReturnedAsIs(): void
    {
        // Si la valeur DB est corrompue (jamais censé arriver), on la renvoie
        // telle quelle plutôt que de crash : front affichera '—'.
        $this->assertSame('garbage', \normalizeDiveDate('garbage'));
    }
}
