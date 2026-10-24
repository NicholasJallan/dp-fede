<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/** Club — matrice des permissions et compatibilité des anciens champs users.club_*. */
final class ClubTest extends TestCase
{
    /**
     * Matrice attendue (docs/api-club.md). Toute évolution de Club::PERMISSIONS
     * doit être reflétée ici ET dans la documentation.
     */
    private const EXPECTED = [
        'responsable' => ['club.read', 'club.manage', 'members.read', 'divers.read', 'divers.write', 'divers.import',
                          'sites.read', 'sites.write', 'dives.read', 'dives.write', 'documents.read',
                          'documents.generate', 'alerts.read', 'stats.read'],
        'dp'          => ['club.read', 'members.read', 'divers.read', 'divers.write', 'divers.import',
                          'sites.read', 'sites.write', 'dives.read', 'dives.write', 'documents.read',
                          'documents.generate', 'alerts.read', 'stats.read'],
        'encadrant'   => ['club.read', 'members.read', 'divers.read', 'sites.read', 'dives.read',
                          'documents.read', 'alerts.read', 'stats.read'],
        'lecture'     => ['club.read', 'members.read', 'divers.read', 'sites.read', 'dives.read',
                          'documents.read', 'stats.read'],
    ];

    public function testPermissionMatrixMatchesDocumentation(): void
    {
        foreach (self::EXPECTED as $role => $allowed) {
            foreach (array_keys(\Club::PERMISSIONS) as $action) {
                $this->assertSame(
                    in_array($action, $allowed, true),
                    \Club::can($role, $action),
                    "{$role} / {$action}"
                );
            }
        }
    }

    public function testOnlyResponsableManagesTheClub(): void
    {
        $this->assertTrue(\Club::can('responsable', 'club.manage'));
        foreach (['dp', 'encadrant', 'lecture'] as $role) {
            $this->assertFalse(\Club::can($role, 'club.manage'), $role);
        }
    }

    public function testReadOnlyRolesCannotWrite(): void
    {
        foreach (['encadrant', 'lecture'] as $role) {
            foreach (['divers.write', 'divers.import', 'sites.write', 'dives.write', 'documents.generate'] as $action) {
                $this->assertFalse(\Club::can($role, $action), "{$role} / {$action}");
            }
        }
    }

    public function testUnknownRoleOrActionIsDenied(): void
    {
        $this->assertFalse(\Club::can(null, 'club.read'));
        $this->assertFalse(\Club::can('admin', 'club.read'));
        $this->assertFalse(\Club::can('responsable', 'action.inconnue'));
    }

    public function testEveryPermissionReferencesKnownRoles(): void
    {
        foreach (\Club::PERMISSIONS as $action => $roles) {
            foreach ($roles as $r) $this->assertTrue(\Club::isRole($r), "{$action} : {$r}");
        }
        $this->assertFalse(\Club::isRole('admin'));
        $this->assertFalse(\Club::isRole(null));
    }

    public function testProfileOverlayExposesClubUnderLegacyNames(): void
    {
        $user = ['id' => 3, 'email' => 'dp@example.com', 'club_nom' => 'Ancien nom', 'club_numero' => 'X'];
        $club = [
            'id' => 'c1', 'nom' => 'Bulles en Valais', 'numero_ffessm' => '06123456', 'siret' => '',
            'structure_type' => 'club', 'president_prenom' => 'Anne', 'president_nom' => 'Martin',
            'president_tel' => '0600000000', 'urgence_defaut' => '112',
        ];
        $out = \Club::profileOverlay($user, $club, 'dp', 2);
        $this->assertSame('Bulles en Valais', $out['club_nom']);
        $this->assertSame('06123456', $out['club_numero']);
        $this->assertSame('', $out['club_siret']);
        $this->assertSame('Martin', $out['president_nom']);
        $this->assertSame('112', $out['urgence_defaut']);
        $this->assertSame('c1', $out['club_id']);
        $this->assertSame('dp', $out['club_role']);
        $this->assertSame(2, $out['club_count']);
        $this->assertSame('dp@example.com', $out['email']);
    }

    public function testLegacyBodyMapsOnlyPresentClubFields(): void
    {
        $fields = \Club::fieldsFromLegacyBody(['club_nom' => '  Club A ', 'nom' => 'Dupont', 'urgence_defaut' => null]);
        $this->assertSame(['nom' => 'Club A', 'urgence_defaut' => null], $fields);
    }

    public function testSanitizeClubFields(): void
    {
        [$fields, $errors] = \Club::sanitizeClubFields([
            'nom' => '', 'structure_type' => 'inconnu', 'president_tel' => '  ', 'numero_ffessm' => ' 061 ',
            'champ_inconnu' => 'x',
        ]);
        $this->assertSame([], $errors);
        $this->assertSame('', $fields['nom']);
        $this->assertNull($fields['structure_type']);
        $this->assertNull($fields['president_tel']);
        $this->assertSame('061', $fields['numero_ffessm']);
        $this->assertArrayNotHasKey('champ_inconnu', $fields);

        [, $errors] = \Club::sanitizeClubFields(['nom' => str_repeat('a', 201), 'siret' => ['x']]);
        $this->assertCount(2, $errors);
    }

    public function testPublicClubHidesInternalMarkerAndUsesIsoDates(): void
    {
        $pub = \Club::publicClub(['id' => 'c1', 'nom' => 'A', 'auto_created_for' => 3, 'created_at' => '2026-10-20 09:00:00']);
        $this->assertArrayNotHasKey('auto_created_for', $pub);
        $this->assertSame('2026-10-20T09:00:00', $pub['created_at']);
    }

    public function testDefaultEmergencyNumberIsNotAChange(): void
    {
        $club = ['urgence_defaut' => null, 'nom' => 'A'];
        // Décision utilisateur « 112 si pays inconnu » : le repli est '112'.
        $this->assertSame([], \Club::changedFields($club, ['urgence_defaut' => '112', 'nom' => 'A']));
        $this->assertSame(['urgence_defaut' => '18'], \Club::changedFields($club, ['urgence_defaut' => '18']));
        $this->assertSame('112', \Club::profileOverlay([], $club + ['id' => 'c1'], 'dp', 1)['urgence_defaut']);
    }

    public function testDiffers(): void
    {
        $club = ['nom' => 'A', 'president_nom' => null];
        $this->assertFalse(\Club::differs($club, ['nom' => 'A', 'president_nom' => '']));
        $this->assertTrue(\Club::differs($club, ['nom' => 'B']));
    }
}
