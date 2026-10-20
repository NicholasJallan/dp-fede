<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * UPSERT idempotent (POST /api/divers, /api/sites avec id client) : la
 * mise à jour ne s'applique qu'à une ligne du MÊME club, de façon atomique
 * (pas de SELECT préalable séparé de l'écriture).
 */
final class ClubScopedUpsertTest extends TestCase
{
    public function testEveryUpdatedColumnIsGuardedByTheClub(): void
    {
        [$sql, $params] = \SyncHelpers::clubScopedUpsert(
            'divers',
            ['id' => 'i', 'club_id' => 'c', 'user_id' => 7, 'nom' => 'Dupont', 'prenom' => 'Jean'],
            ['user_id']
        );
        $this->assertStringStartsWith('INSERT INTO divers (id, club_id, user_id, nom, prenom) VALUES (?,?,?,?,?)', $sql);
        $this->assertStringContainsString('ON DUPLICATE KEY UPDATE', $sql);
        $this->assertStringContainsString('nom = IF(club_id = VALUES(club_id), VALUES(nom), nom)', $sql);
        $this->assertStringContainsString('prenom = IF(club_id = VALUES(club_id), VALUES(prenom), prenom)', $sql);
        $this->assertStringContainsString('deleted_at = IF(club_id = VALUES(club_id), NULL, deleted_at)', $sql);
        $this->assertSame(['i', 'c', 7, 'Dupont', 'Jean'], $params);
    }

    public function testIdentityClubAndInsertOnlyColumnsAreNeverUpdated(): void
    {
        [$sql] = \SyncHelpers::clubScopedUpsert('sites', ['id' => 'i', 'club_id' => 'c', 'user_id' => 1, 'nom' => 'X'], ['user_id']);
        $update = substr($sql, strpos($sql, 'ON DUPLICATE KEY UPDATE'));
        $this->assertStringNotContainsString('club_id = IF', $update);
        $this->assertStringNotContainsString('id = IF', str_replace('club_id = VALUES(club_id)', '', $update));
        $this->assertStringNotContainsString('user_id', $update);
    }

    public function testRejectsUnsafeIdentifiers(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \SyncHelpers::clubScopedUpsert('divers; DROP', ['id' => 'i', 'club_id' => 'c'], []);
    }

    public function testRequiresIdAndClub(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \SyncHelpers::clubScopedUpsert('divers', ['nom' => 'x'], []);
    }
}
