<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/** Archivage serveur : participants, durées, chemins de stockage. */
final class DiveArchiveTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';
    private const DIVE = '7c1e5a90-2b3d-4e5f-8a9b-0c1d2e3f4a5b';

    public function testBuildParticipants(): void
    {
        $p1 = [['diverId' => 'a', 'aptitude' => 'GP'], ['diverId' => 'b', 'aptitude' => 'PE20']];
        $p2 = [['_bapteme' => true, 'nom' => 'X', 'aptitude' => 'Baptême'], ['diverId' => 'c', 'aptitude' => 'E1']];
        $rows = \DiveArchive::buildParticipants(
            [
                ['id' => 'p1', 'profMax' => 20, 'duree' => 40, 'membres' => $p1],
                ['id' => 'p2', 'profMax' => '6', 'membres' => $p2],
                ['id' => 'p3', 'membres' => []],
            ],
            [
                'realises'    => ['p1' => ['profMax' => 18.5, 'duree' => '42']],
                'heuresDebut' => ['p2' => '10:00'],
                'heuresFin'   => ['p2' => '10:25'],
            ],
            ['dp_id' => 'z', 'dp_qual' => 'N5']
        );

        $this->assertCount(5, $rows);
        $this->assertSame(['diver_id' => 'z', 'palanquee' => null, 'pal_type' => null, 'role' => 'dp', 'aptitude' => 'N5',
                           'prof_max_prevue' => null, 'prof_max_realisee' => null, 'duree_realisee' => null], $rows[0]);

        $this->assertSame('a', $rows[1]['diver_id']);
        $this->assertSame('guide', $rows[1]['role']);
        $this->assertSame(1, $rows[1]['palanquee']);
        $this->assertSame(\Rules::getPalType($p1, null), $rows[1]['pal_type']);
        $this->assertSame(20.0, $rows[1]['prof_max_prevue']);
        $this->assertSame(18.5, $rows[1]['prof_max_realisee']);
        $this->assertSame(42, $rows[1]['duree_realisee']);
        $this->assertSame('plongeur', $rows[2]['role']);

        $this->assertNull($rows[3]['diver_id']);
        $this->assertSame('bapteme', $rows[3]['role']);
        $this->assertSame('bapteme', $rows[3]['pal_type']);
        $this->assertSame(2, $rows[3]['palanquee']);
        $this->assertSame(25, $rows[3]['duree_realisee']);   // heures début / fin
        $this->assertNull($rows[3]['prof_max_realisee']);
        $this->assertSame('encadrant', $rows[4]['role']);
    }

    public function testBuildParticipantsToleratesGarbage(): void
    {
        $rows = \DiveArchive::buildParticipants(['x', ['membres' => ['y', ['diverId' => 5]]]], ['realises' => 'z'], []);
        $this->assertCount(1, $rows);
        $this->assertNull($rows[0]['diver_id']);
        $this->assertSame('plongeur', $rows[0]['role']);
    }

    public function testDurationBetween(): void
    {
        $this->assertSame(25, \DiveArchive::durationBetween('10:00', '10:25'));
        $this->assertSame(30, \DiveArchive::durationBetween('23:50', '00:20'));
        $this->assertNull(\DiveArchive::durationBetween('10:00', '09:00')); // 23 h : incohérent
        $this->assertNull(\DiveArchive::durationBetween('10:00', null));
        $this->assertNull(\DiveArchive::durationBetween('25:00', '26:00'));
    }

    public function testRoleFor(): void
    {
        $this->assertSame('bapteme', \DiveArchive::roleFor('PE12', true));
        $this->assertSame('bapteme', \DiveArchive::roleFor('Baptême', false));
        $this->assertSame('encadrant', \DiveArchive::roleFor('E3', false));
        $this->assertSame('guide', \DiveArchive::roleFor('GP', false));
        $this->assertSame('plongeur', \DiveArchive::roleFor('PA40', false));
        $this->assertSame('plongeur', \DiveArchive::roleFor(null, false));
    }

    public function testStoragePaths(): void
    {
        $this->assertSame('/var/lib/dp-fede/documents', \DiveArchive::storageRoot());
        $rel = \DiveArchive::relativePath(self::CLUB, self::DIVE, 'fiche', '2026-07-14 09:30:00');
        $this->assertSame(self::CLUB . '/2026/' . self::DIVE . '-fiche.pdf', $rel);
        $this->assertSame('/var/lib/dp-fede/documents/' . $rel, \DiveArchive::absolutePath($rel));

        $this->assertSame('/srv/dp-docs', \DiveArchive::rootFromConfig(['path' => '/srv/dp-docs/']));
        $this->assertSame('/var/lib/dp-fede/documents', \DiveArchive::rootFromConfig(['path' => '']));
        $this->assertSame('/var/lib/dp-fede/documents', \DiveArchive::rootFromConfig(null));
    }

    public function testStoragePathsRejectTraversalAndBadIds(): void
    {
        foreach (['../../etc/passwd', '/etc/passwd', self::CLUB . '/2026/../x-fiche.pdf', 'a/b.pdf'] as $bad) {
            try {
                \DiveArchive::absolutePath($bad);
                $this->fail("Chemin accepté : {$bad}");
            } catch (\InvalidArgumentException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }
        $this->expectException(\InvalidArgumentException::class);
        \DiveArchive::relativePath('pas-un-uuid', self::DIVE, 'fiche', null);
    }

    public function testRelativePathRejectsUnknownType(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \DiveArchive::relativePath(self::CLUB, self::DIVE, 'autre', null);
    }
}
