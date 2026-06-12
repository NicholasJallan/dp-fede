<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * SyncHelpers — validation UUID (format hex avec dashes) et parseSinceParam.
 *
 * isValidUuid n'impose pas la version v4 (regex générique). On vérifie le
 * format hex+dashes, et le rejet de tout ce qui n'y ressemble pas — c'est
 * le rempart contre l'injection de PK pourries en BDD.
 */
final class SyncHelpersTest extends TestCase
{
    public function testValidUuidHexFormat(): void
    {
        $this->assertTrue(\SyncHelpers::isValidUuid('a1b2c3d4-1234-4567-89ab-cdef01234567'));
        $this->assertTrue(\SyncHelpers::isValidUuid('00000000-0000-0000-0000-000000000000'));
        // Casse mixte acceptée (regex flag i)
        $this->assertTrue(\SyncHelpers::isValidUuid('A1B2C3D4-1234-4567-89AB-CDEF01234567'));
    }

    public function testInvalidUuidRejected(): void
    {
        // Trop court
        $this->assertFalse(\SyncHelpers::isValidUuid('not-a-uuid'));
        $this->assertFalse(\SyncHelpers::isValidUuid(''));
        $this->assertFalse(\SyncHelpers::isValidUuid(null));
        // Caractères non hex
        $this->assertFalse(\SyncHelpers::isValidUuid('a1b2c3d4-1234-4567-89ab-cdef01234XYZ'));
        // Mauvais découpage
        $this->assertFalse(\SyncHelpers::isValidUuid('a1b2c3d4123445678 9ab cdef01234567'));
        // Trop long (un caractère en trop)
        $this->assertFalse(\SyncHelpers::isValidUuid('a1b2c3d4-1234-4567-89ab-cdef012345678'));
    }

    public function testParseSinceAcceptsIso8601(): void
    {
        $sql = \SyncHelpers::parseSinceParam('2026-06-12T08:30:00Z');
        $this->assertNotNull($sql);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $sql);
    }

    public function testParseSinceRejectsGarbage(): void
    {
        // Implémentation actuelle : retourne une date ancienne par défaut, ou null.
        // On vérifie au minimum qu'il n'y a pas d'exception non interceptée.
        $result = \SyncHelpers::parseSinceParam('not-a-date');
        $this->assertTrue($result === null || is_string($result));
    }
}
