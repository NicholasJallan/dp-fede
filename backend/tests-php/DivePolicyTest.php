<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

/**
 * Règles pures sur les plongées : immutabilité des fiches archivées
 * (A322-72), régénération des PDF, idempotence de POST /api/dives.
 */
final class DivePolicyTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';
    private const OTHER = '1c8e3d9f-7a2b-4d4c-8e3f-2b3c4d5e6f70';

    // ── render_state d'une plongée archivée ────────────────────────────────

    public function testArchivedPatchWithoutRenderStateIsAllowed(): void
    {
        $this->assertNull(\DivePolicy::archivedPatchViolation(['drive_link' => 'https://x'], '{"checked":[]}'));
        $this->assertNull(\DivePolicy::archivedPatchViolation(['status' => 'archived'], null));
    }

    public function testArchivedPatchChangingRenderStateIsRefused(): void
    {
        $msg = \DivePolicy::archivedPatchViolation(['render_state' => ['checked' => ['a' => true]]], '{"checked":[]}');
        $this->assertNotNull($msg);
        $this->assertStringContainsString('archivée', $msg);
        // Aucun état stocké : toute écriture est une modification.
        $this->assertNotNull(\DivePolicy::archivedPatchViolation(['render_state' => ['pressions' => []]], null));
        // Valeur non objet : refusée aussi.
        $this->assertNotNull(\DivePolicy::archivedPatchViolation(['render_state' => 'x'], '{}'));
    }

    public function testReplayOfTheArchivingPatchIsIdempotent(): void
    {
        // Le PATCH d'archivage (status + render_state) peut être rejoué par
        // l'outbox si la réponse a été perdue : état identique → accepté.
        $state = ['pressions' => ['p1' => ['a' => 200]], 'checked' => ['x' => true], 'comments' => []];
        $stored = json_encode($state, JSON_UNESCAPED_UNICODE);
        $this->assertTrue(\DivePolicy::sameRenderState($state, $stored));
        $this->assertNull(\DivePolicy::archivedPatchViolation(['status' => 'archived', 'render_state' => $state], $stored));
        $this->assertFalse(\DivePolicy::sameRenderState(['pressions' => []], $stored));
    }

    // ── Régénération des documents ─────────────────────────────────────────

    public function testDocumentsToGenerateKeepsIntactDocuments(): void
    {
        $this->assertSame([], \DivePolicy::documentsToGenerate(['fiche' => 'intact', 'checklist' => 'intact']));
        $this->assertSame(['checklist'], \DivePolicy::documentsToGenerate(['fiche' => 'intact', 'checklist' => 'altered']));
        // Type absent de la liste = document manquant.
        $this->assertSame(['fiche', 'checklist'], \DivePolicy::documentsToGenerate([]));
        $this->assertSame(['fiche'], \DivePolicy::documentsToGenerate(['checklist' => 'intact', 'fiche' => 'missing']));
    }

    public function testRegenerationAllowedOnErrorOrMissingDocument(): void
    {
        $now = new DateTimeImmutable('2026-10-20 12:00:00');
        $intact = ['fiche' => 'intact', 'checklist' => 'intact'];
        $this->assertNull(\DivePolicy::regenerationRefusal('error', $intact, '2026-10-20 11:59:00', $now));
        $this->assertNull(\DivePolicy::regenerationRefusal('ok', ['fiche' => 'intact', 'checklist' => 'missing'], null, $now));
        $this->assertNull(\DivePolicy::regenerationRefusal(null, [], null, $now)); // archivée avant la phase 5
        $this->assertNull(\DivePolicy::regenerationRefusal('ok', ['fiche' => 'altered', 'checklist' => 'intact'], null, $now));
    }

    public function testRegenerationRefusedWhenDocumentsAreCompleteOrBeingGenerated(): void
    {
        $now = new DateTimeImmutable('2026-10-20 12:00:00');
        $intact = ['fiche' => 'intact', 'checklist' => 'intact'];
        $refusal = \DivePolicy::regenerationRefusal('ok', $intact, '2026-10-20 10:00:00', $now);
        $this->assertNotNull($refusal);
        $this->assertSame('DOCUMENTS_COMPLETE', $refusal['code']);

        $pending = \DivePolicy::regenerationRefusal('pending', [], '2026-10-20 11:55:00', $now);
        $this->assertSame('DOCUMENTS_PENDING', $pending['code']);
        // « pending » depuis plus de 15 min : reprise autorisée (comme bin/documents.php --retry).
        $this->assertNull(\DivePolicy::regenerationRefusal('pending', [], '2026-10-20 11:40:00', $now));
    }

    // ── Idempotence de POST /api/dives (client_uuid) ───────────────────────

    public function testClientUuidUnknownCreatesTheDive(): void
    {
        $this->assertSame(['new', null], \DivePolicy::clientUuidOutcome([], self::CLUB));
    }

    public function testClientUuidOfALiveDiveOfTheClubIsADuplicate(): void
    {
        $rows = [['id' => 'd1', 'club_id' => self::CLUB, 'deleted_at' => null]];
        $this->assertSame(['duplicate', 'd1'], \DivePolicy::clientUuidOutcome($rows, self::CLUB));
        // Ligne d'un autre club en plus : la plongée du club courant prime.
        $rows[] = ['id' => 'd2', 'club_id' => self::OTHER, 'deleted_at' => null];
        $this->assertSame(['duplicate', 'd1'], \DivePolicy::clientUuidOutcome($rows, self::CLUB));
    }

    public function testClientUuidOfAnotherClubOrOfADeletedDiveIsAConflict(): void
    {
        $other = [['id' => 'd2', 'club_id' => self::OTHER, 'deleted_at' => null]];
        $this->assertSame(['conflict', null], \DivePolicy::clientUuidOutcome($other, self::CLUB));
        $deleted = [['id' => 'd1', 'club_id' => self::CLUB, 'deleted_at' => '2026-10-01 10:00:00']];
        $this->assertSame(['conflict', null], \DivePolicy::clientUuidOutcome($deleted, self::CLUB));
    }
}
