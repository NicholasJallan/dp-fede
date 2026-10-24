<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/DiveService.php')) {
    require_once __DIR__ . '/../lib/DiveService.php';
}

final class DiveServiceTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';
    private const USER = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    public function testDiveRefusalInstantiation(): void
    {
        $ex = new \DiveRefusal(422, 'Règles non respectées', 'RULES_FAILED');
        $this->assertSame(422, $ex->httpStatus);
        $this->assertSame('Règles non respectées', $ex->getMessage());
        $this->assertSame('RULES_FAILED', $ex->errorCode);
    }

    // ── rulesInput (méthode pure) ──────────────────────────────────────────

    public function testRulesInputWhenAlreadyArchivedReturnsNull(): void
    {
        $stored = ['answers' => '{"site":"Lac"}', 'palanquees' => '[{"id":"p1"}]'];
        $this->assertNull(\DiveService::rulesInput('archived', 'archived', [], $stored));
        $this->assertNull(\DiveService::rulesInput('archived', 'in_progress', ['palanquees' => []], $stored));
        $this->assertNull(\DiveService::rulesInput('archived', null, [], $stored));
    }

    public function testRulesInputTransitionToArchivedAlwaysFusesBodyAndStored(): void
    {
        $stored = [
            'answers'    => json_encode(['site' => 'Leman', 'dp_nom' => 'Bob']),
            'palanquees' => json_encode([['id' => 'p1', 'profMax' => 20]]),
        ];

        // 1. Body avec palanquees et answers explicites
        $body = [
            'answers'    => ['site' => 'Leman Nouveau'],
            'palanquees' => [['id' => 'p2', 'profMax' => 40]],
        ];
        $res = \DiveService::rulesInput('prepared', 'archived', $body, $stored);
        $this->assertSame([
            'palanquees' => [['id' => 'p2', 'profMax' => 40]],
            'answers'    => ['site' => 'Leman Nouveau'],
        ], $res);

        // 2. Body sans palanquees et sans answers (vide) : repli sur le stocké décodé
        $resStored = \DiveService::rulesInput('prepared', 'archived', ['status' => 'archived'], $stored);
        $this->assertSame([
            'palanquees' => [['id' => 'p1', 'profMax' => 20]],
            'answers'    => ['site' => 'Leman', 'dp_nom' => 'Bob'],
        ], $resStored);

        // 3. Stocké corrompu ou null : repli sur tableau vide
        $resCorrupt = \DiveService::rulesInput('in_progress', 'archived', [], ['answers' => 'invalid', 'palanquees' => null]);
        $this->assertSame([
            'palanquees' => [],
            'answers'    => [],
        ], $resCorrupt);
    }

    public function testRulesInputTransitionToInProgressOnlyWhenPalanqueesInBody(): void
    {
        $stored = [
            'answers'    => json_encode(['site' => 'Leman']),
            'palanquees' => json_encode([['id' => 'p1', 'profMax' => 20]]),
        ];

        // Avec palanquees dans le body -> fusionné et retourné
        $bodyWithPal = ['status' => 'in_progress', 'palanquees' => [['id' => 'p1', 'profMax' => 25]]];
        $res = \DiveService::rulesInput('prepared', 'in_progress', $bodyWithPal, $stored);
        $this->assertSame([
            'palanquees' => [['id' => 'p1', 'profMax' => 25]],
            'answers'    => ['site' => 'Leman'],
        ], $res);

        // Sans palanquees dans le body (ex. PATCH {status:'in_progress', started_at:...} seul) -> null (pas de validation bloquante)
        $bodyWithoutPal = ['status' => 'in_progress', 'started_at' => '2026-10-25T10:00:00'];
        $this->assertNull(\DiveService::rulesInput('prepared', 'in_progress', $bodyWithoutPal, $stored));
    }

    public function testRulesInputTransitionToPreparedOrNullReturnsNull(): void
    {
        $stored = ['answers' => '{}', 'palanquees' => '[]'];
        $this->assertNull(\DiveService::rulesInput('prepared', 'prepared', ['palanquees' => []], $stored));
        $this->assertNull(\DiveService::rulesInput('prepared', null, ['palanquees' => []], $stored));
    }

    // ── create ─────────────────────────────────────────────────────────────

    public function testCreateWithRenderStateWrapsInTransactionAndInsertsBoth(): void
    {
        $body = [
            'date'         => '2026-10-25',
            'status'       => 'prepared',
            'answers'      => ['site' => 'Lac'],
            'palanquees'   => [],
            'render_state' => ['pressions' => ['p1' => ['d1' => 200]]],
        ];

        $res = \DiveService::create(self::CLUB, self::USER, $body);

        $this->assertIsArray($res);
        $this->assertArrayHasKey('id', $res);
        $this->assertNull($res['documents_status']);

        // Vérification de la séquence transactionnelle dans RecordingPdo
        $sqls = array_column($this->pdo->log, 'sql');
        $this->assertContains('BEGIN', $sqls);
        $this->assertContains('COMMIT', $sqls);
        $this->assertNotContains('ROLLBACK', $sqls);

        $beginIdx  = array_search('BEGIN', $sqls, true);
        $commitIdx = array_search('COMMIT', $sqls, true);

        $insertDivesIdx = null;
        $insertRuntimeIdx = null;
        foreach ($this->pdo->log as $idx => $entry) {
            if (stripos($entry['sql'], 'INSERT INTO dives') !== false) {
                $insertDivesIdx = $idx;
            }
            if (stripos($entry['sql'], 'INSERT INTO dive_runtime_state') !== false) {
                $insertRuntimeIdx = $idx;
            }
        }

        $this->assertNotNull($insertDivesIdx, 'INSERT INTO dives attendu');
        $this->assertNotNull($insertRuntimeIdx, 'INSERT INTO dive_runtime_state attendu');
        $this->assertGreaterThan($beginIdx, $insertDivesIdx);
        $this->assertGreaterThan($insertDivesIdx, $insertRuntimeIdx);
        $this->assertGreaterThan($insertRuntimeIdx, $commitIdx);
    }

    public function testCreateWithoutRenderStateSkipsRuntimeStateInsert(): void
    {
        $body = [
            'date'       => '2026-10-25',
            'status'     => 'prepared',
            'answers'    => ['site' => 'Lac'],
            'palanquees' => [],
        ];

        $res = \DiveService::create(self::CLUB, self::USER, $body);

        $this->assertIsArray($res);
        $this->assertNull($res['documents_status']);

        $sqls = array_column($this->pdo->log, 'sql');
        $this->assertContains('BEGIN', $sqls);
        $this->assertContains('COMMIT', $sqls);

        foreach ($this->pdo->log as $entry) {
            $this->assertStringNotContainsString('dive_runtime_state', $entry['sql']);
        }
    }

    public function testCreateArchivedSetsDocumentsStatusPendingAndCallsOnArchivedAfterCommit(): void
    {
        $body = [
            'date'       => '2026-10-25',
            'status'     => 'archived',
            'answers'    => ['site' => 'Lac'],
            'palanquees' => [],
        ];

        $calledWithId = null;
        $callCount    = 0;
        $commitDoneAtCall = false;

        $onArchived = function (string $id) use (&$calledWithId, &$callCount, &$commitDoneAtCall) {
            $calledWithId = $id;
            $callCount++;
            $sqls = array_column($this->pdo->log, 'sql');
            $commitDoneAtCall = in_array('COMMIT', $sqls, true);
        };

        $res = \DiveService::create(self::CLUB, self::USER, $body, $onArchived);

        $this->assertSame('pending', $res['documents_status']);
        $this->assertSame(1, $callCount, '$onArchived doit être appelé exactement une fois');
        $this->assertSame($res['id'], $calledWithId);
        $this->assertTrue($commitDoneAtCall, '$onArchived doit être appelé APRÈS le COMMIT');

        // Vérifie que documents_status 'pending' figure dans le SQL ou les paramètres de l'INSERT dives
        $foundPending = false;
        foreach ($this->pdo->log as $entry) {
            if (stripos($entry['sql'], 'INSERT INTO dives') !== false) {
                if (in_array('pending', $entry['params'], true) || stripos($entry['sql'], "'pending'") !== false) {
                    $foundPending = true;
                }
            }
        }
        $this->assertTrue($foundPending, "documents_status 'pending' attendu lors de l'INSERT dives");
    }

    public function testCreatePreparedLeavesDocumentsStatusNullAndNeverCallsOnArchived(): void
    {
        $body = [
            'date'       => '2026-10-25',
            'status'     => 'prepared',
            'answers'    => ['site' => 'Lac'],
            'palanquees' => [],
        ];

        $called = false;
        $res = \DiveService::create(self::CLUB, self::USER, $body, function () use (&$called) {
            $called = true;
        });

        $this->assertNull($res['documents_status']);
        $this->assertFalse($called, '$onArchived ne doit pas être appelé pour une plongée prepared');
    }

    public function testCreateRollsBackAndPropagatesWhenInsertDivesThrows(): void
    {
        $this->pdo->respond('/INSERT INTO dives/', function () {
            throw new \PDOException('Erreur simulée écriture base');
        });

        $body = [
            'date'         => '2026-10-25',
            'status'       => 'prepared',
            'answers'      => ['site' => 'Lac'],
            'palanquees'   => [],
            'render_state' => ['pressions' => []],
        ];

        $this->expectException(\PDOException::class);
        $this->expectExceptionMessage('Erreur simulée écriture base');

        try {
            \DiveService::create(self::CLUB, self::USER, $body);
        } finally {
            $sqls = array_column($this->pdo->log, 'sql');
            $this->assertContains('BEGIN', $sqls);
            $this->assertContains('ROLLBACK', $sqls);
            $this->assertNotContains('COMMIT', $sqls);

            foreach ($this->pdo->log as $entry) {
                $this->assertStringNotContainsString('dive_runtime_state', $entry['sql']);
            }
        }
    }

    // ── patch ──────────────────────────────────────────────────────────────

    public function testPatchNotFoundThrows404RollsBackWithoutUpdate(): void
    {
        $this->pdo->respond('/FOR UPDATE/', []);

        $this->expectException(\DiveRefusal::class);
        try {
            \DiveService::patch(self::CLUB, 'non-existent', ['site_nom' => 'Nouveau']);
        } catch (\DiveRefusal $e) {
            $this->assertSame(404, $e->httpStatus);
            $this->assertSame('Plongée introuvable', $e->getMessage());

            $sqls = array_column($this->pdo->log, 'sql');
            $this->assertContains('BEGIN', $sqls);
            $this->assertContains('ROLLBACK', $sqls);
            $this->assertNotContains('COMMIT', $sqls);
            foreach ($this->pdo->log as $entry) {
                $this->assertDoesNotMatchRegularExpression('/^\s*UPDATE\s+dives\b/i', $entry['sql']);
            }
            throw $e;
        }
    }

    public function testPatchStoredArchivedTransitionToOtherStatusThrows422ArchivedImmutable(): void
    {
        $stored = ['id' => 'd1', 'status' => 'archived', 'answers' => '{}', 'palanquees' => '[]'];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);

        $this->expectException(\DiveRefusal::class);
        try {
            \DiveService::patch(self::CLUB, 'd1', ['status' => 'prepared']);
        } catch (\DiveRefusal $e) {
            $this->assertSame(422, $e->httpStatus);
            $this->assertSame('ARCHIVED_IMMUTABLE', $e->errorCode);
            throw $e;
        }
    }

    public function testPatchStoredArchivedIgnoresAnswersAndWritesOnlyDriveLink(): void
    {
        $stored = [
            'id'               => 'd1',
            'status'           => 'archived',
            'answers'          => json_encode(['site' => 'Lac']),
            'palanquees'       => json_encode([['id' => 'p1']]),
            'drive_link'       => null,
            'documents_status' => 'done',
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);
        $this->pdo->respond('/SELECT .* FROM dives WHERE/i', [[
            'id'               => 'd1',
            'status'           => 'archived',
            'drive_link'       => 'https://drive.google.com/updated',
            'documents_status' => 'done',
        ]]);

        $res = \DiveService::patch(self::CLUB, 'd1', [
            'answers'    => ['site' => 'Mer'], // doit être ignoré
            'palanquees' => [],                // doit être ignoré
            'drive_link' => 'https://drive.google.com/updated',
        ]);

        $this->assertSame('https://drive.google.com/updated', $res['drive_link']);

        // Vérifie qu'aucun answers ou palanquees n'apparaît dans l'UPDATE
        $updateEntry = null;
        foreach ($this->pdo->log as $entry) {
            if (stripos($entry['sql'], 'UPDATE dives') !== false) {
                $updateEntry = $entry;
            }
        }
        $this->assertNotNull($updateEntry);
        $this->assertStringNotContainsString('answers', $updateEntry['sql']);
        $this->assertStringNotContainsString('palanquees', $updateEntry['sql']);
        $this->assertStringContainsString('drive_link', $updateEntry['sql']);
    }

    public function testPatchStoredArchivedReplaySameStatusSucceedsWithoutUpdate(): void
    {
        $stored = [
            'id'               => 'd1',
            'status'           => 'archived',
            'answers'          => '{}',
            'palanquees'       => '[]',
            'drive_link'       => 'https://drive.google.com/link',
            'documents_status' => 'done',
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);
        $this->pdo->respond('/SELECT .* FROM dives WHERE/i', [$stored]);

        $res = \DiveService::patch(self::CLUB, 'd1', ['status' => 'archived']);

        $this->assertSame('archived', $res['status']);
        foreach ($this->pdo->log as $entry) {
            $this->assertDoesNotMatchRegularExpression('/^\s*UPDATE\s+dives\b/i', $entry['sql']);
        }
    }

    public function testPatchStoredArchivedDifferentRenderStateThrows422ArchivedImmutable(): void
    {
        $stored = ['id' => 'd1', 'status' => 'archived', 'answers' => '{}', 'palanquees' => '[]'];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);
        $this->pdo->respond('/FROM dive_runtime_state/', [['state' => '{"pressions":{"p1":100}}']]);

        $this->expectException(\DiveRefusal::class);
        try {
            \DiveService::patch(self::CLUB, 'd1', ['render_state' => ['pressions' => ['p1' => 200]]]);
        } catch (\DiveRefusal $e) {
            $this->assertSame(422, $e->httpStatus);
            $this->assertSame('ARCHIVED_IMMUTABLE', $e->errorCode);
            throw $e;
        }
    }

    public function testPatchTransitionToArchivedValidatesMergedPalanqueesAndRefusesInvalid(): void
    {
        // Palanquée solo (invalide) stockée dans la base
        $invalidPal = [['id' => 'p1', 'profMax' => 20, 'membres' => [['diverId' => 'd1', 'aptitude' => 'PA60']]]];
        $stored = [
            'id'         => 'd1',
            'status'     => 'prepared',
            'answers'    => json_encode(['date' => '2026-10-25T10:00']),
            'palanquees' => json_encode($invalidPal),
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);
        $this->pdo->respond('/FROM clubs/', [['structure_type' => 'club']]);
        $this->pdo->respond('/FROM divers\s+WHERE/i', [[
            'id' => 'd1', 'nom' => 'Solo', 'prenom' => 'Dan', 'niveau_plongeur' => 'N3',
            'niveau_encadrant' => null, 'aptitudes_sup' => '[]', 'qualifs' => '[]',
            'medical' => '2026-01-01', 'date_naissance' => '1990-01-01'
        ]]);

        $called = false;
        $this->expectException(\DiveRefusal::class);
        try {
            \DiveService::patch(self::CLUB, 'd1', ['status' => 'archived'], function () use (&$called) {
                $called = true;
            });
        } catch (\DiveRefusal $e) {
            $this->assertSame(422, $e->httpStatus);
            $this->assertFalse($called, '$onArchived ne doit pas être appelé en cas de refus');

            $sqls = array_column($this->pdo->log, 'sql');
            $this->assertContains('ROLLBACK', $sqls);
            $this->assertNotContains('COMMIT', $sqls);
            foreach ($this->pdo->log as $entry) {
                $this->assertDoesNotMatchRegularExpression('/^\s*UPDATE\s+dives\b/i', $entry['sql']);
            }
            throw $e;
        }
    }

    public function testPatchTransitionToArchivedValidSucceedsAndCallsOnArchivedAfterCommit(): void
    {
        $stored = [
            'id'         => 'd1',
            'status'     => 'in_progress',
            'answers'    => '{}',
            'palanquees' => '[]',
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);
        $this->pdo->respond('/SELECT .* FROM dives WHERE/i', [[
            'id'               => 'd1',
            'status'           => 'archived',
            'drive_link'       => null,
            'documents_status' => 'pending',
        ]]);

        $calledId = null;
        $commitDoneAtCall = false;
        $onArchived = function (string $id) use (&$calledId, &$commitDoneAtCall) {
            $calledId = $id;
            $sqls = array_column($this->pdo->log, 'sql');
            $commitDoneAtCall = in_array('COMMIT', $sqls, true);
        };

        $res = \DiveService::patch(self::CLUB, 'd1', ['status' => 'archived'], $onArchived);

        $this->assertSame('archived', $res['status']);
        $this->assertSame('pending', $res['documents_status']);
        $this->assertSame('d1', $calledId);
        $this->assertTrue($commitDoneAtCall, '$onArchived doit être appelé APRÈS le COMMIT');

        // Vérifie que l'UPDATE a bien posé status='archived', closed_at=NOW() et documents_status='pending'
        $updateEntry = null;
        foreach ($this->pdo->log as $entry) {
            if (stripos($entry['sql'], 'UPDATE dives') !== false) {
                $updateEntry = $entry;
            }
        }
        $this->assertNotNull($updateEntry);
        $this->assertStringContainsString('closed_at=NOW()', $updateEntry['sql']);
        $this->assertStringContainsString("documents_status='pending'", $updateEntry['sql']);
        $this->assertStringContainsString('WHERE id=? AND club_id=?', $updateEntry['sql']);
    }

    public function testPatchInProgressWithoutPalanqueesNeverValidatesRules(): void
    {
        // Palanquées stockées invalides
        $stored = [
            'id'         => 'd1',
            'status'     => 'prepared',
            'answers'    => '{}',
            'palanquees' => json_encode([['id' => 'p1', 'profMax' => 20, 'membres' => [['diverId' => 'solo']]]]),
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);
        $this->pdo->respond('/SELECT .* FROM dives WHERE/i', [[
            'id'               => 'd1',
            'status'           => 'in_progress',
            'drive_link'       => null,
            'documents_status' => null,
        ]]);

        // Mise à l'eau simple sans envoyer les palanquées
        $res = \DiveService::patch(self::CLUB, 'd1', [
            'status'     => 'in_progress',
            'started_at' => '2026-10-25T10:00:00',
        ]);

        $this->assertSame('in_progress', $res['status']);

        // Aucune requête aux tables clubs ni divers (aucune validation déclenchée)
        foreach ($this->pdo->log as $entry) {
            $this->assertStringNotContainsString('FROM clubs', $entry['sql']);
            $this->assertStringNotContainsString('FROM divers', $entry['sql']);
        }
    }

    public function testPatchEmptyOverwriteRefusedWhenStoredHasPalanquees(): void
    {
        $stored = [
            'id'         => 'd1',
            'status'     => 'prepared',
            'answers'    => json_encode(['site' => 'Lac']),
            'palanquees' => json_encode([['id' => 'p1']]),
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);

        $this->expectException(\DiveRefusal::class);
        try {
            \DiveService::patch(self::CLUB, 'd1', [
                'answers'    => [],
                'palanquees' => [],
            ]);
        } catch (\DiveRefusal $e) {
            $this->assertSame(409, $e->httpStatus);
            $this->assertSame('EMPTY_OVERWRITE_REFUSED', $e->errorCode);
            throw $e;
        }
    }

    public function testPatchNoFieldsToUpdateThrows422(): void
    {
        $stored = [
            'id'         => 'd1',
            'status'     => 'prepared',
            'answers'    => '{}',
            'palanquees' => '[]',
        ];
        $this->pdo->respond('/FOR UPDATE/', [$stored]);

        $this->expectException(\DiveRefusal::class);
        try {
            // Statut invalide (booléen true au lieu d'une string autorisée) et aucun autre champ
            \DiveService::patch(self::CLUB, 'd1', ['status' => true]);
        } catch (\DiveRefusal $e) {
            $this->assertSame(422, $e->httpStatus);
            $this->assertStringContainsString('Aucun champ à mettre à jour', $e->getMessage());
            throw $e;
        }
    }

    public function testPatchLogsUnknownDiversWhenDiverIdMissingFromClub(): void
    {
        $logged = [];
        \Log::capture(function (string $kind, ?array $ctx) use (&$logged): void {
            $logged[] = ['kind' => $kind, 'ctx' => $ctx];
        });

        try {
            // Palanquée avec 3 membres : 2 connus en base (pour éviter PAL_SOLO quand le 3e est ignoré) et 1 fantôme
            $palanquees = [[
                'id' => 'p1',
                'profMax' => 20,
                'membres' => [
                    ['diverId' => 'd1', 'aptitude' => 'PA20'],
                    ['diverId' => 'd2', 'aptitude' => 'PA20'],
                    ['diverId' => 'diver-ghost', 'aptitude' => 'PA20'],
                ],
            ]];
            $stored = [
                'id'         => 'd1',
                'status'     => 'prepared',
                'answers'    => json_encode(['date' => '2026-10-25T10:00']),
                'palanquees' => json_encode($palanquees),
            ];

            $this->pdo->respond('/FOR UPDATE/', [$stored]);
            $this->pdo->respond('/FROM clubs/', [['structure_type' => 'club']]);
            // Réponse FROM divers ne contenant QUE d1 et d2 (diver-ghost absent)
            $this->pdo->respond('/FROM divers\s+WHERE/i', [
                [
                    'id' => 'd1', 'nom' => 'Un', 'prenom' => 'A',
                    'niveau_plongeur' => 'N2', 'niveau_encadrant' => null,
                    'aptitudes_sup' => '[]', 'qualifs' => '[]',
                    'medical' => '2026-01-01', 'date_naissance' => '1990-01-01',
                ],
                [
                    'id' => 'd2', 'nom' => 'Deux', 'prenom' => 'B',
                    'niveau_plongeur' => 'N2', 'niveau_encadrant' => null,
                    'aptitudes_sup' => '[]', 'qualifs' => '[]',
                    'medical' => '2026-01-01', 'date_naissance' => '1990-01-01',
                ],
            ]);
            $this->pdo->respond('/SELECT .* FROM dives WHERE/i', [[
                'id'               => 'd1',
                'status'           => 'archived',
                'drive_link'       => null,
                'documents_status' => 'pending',
            ]]);

            \DiveService::patch(self::CLUB, 'd1', ['status' => 'archived'], fn() => null);

            // Vérifie qu'une entrée 'dive.unknown_divers' a été enregistrée avec count => 1
            $unknownEntries = array_filter($logged, fn($e) => $e['kind'] === 'dive.unknown_divers');
            $this->assertCount(1, $unknownEntries);
            $entry = reset($unknownEntries);
            $this->assertSame(['club_id' => self::CLUB, 'count' => 1], $entry['ctx']);
        } finally {
            \Log::capture(null);
        }
    }

    public function testPatchDoesNotLogUnknownDiversWhenAllDiverIdsKnown(): void
    {
        $logged = [];
        \Log::capture(function (string $kind, ?array $ctx) use (&$logged): void {
            $logged[] = ['kind' => $kind, 'ctx' => $ctx];
        });

        try {
            $palanquees = [[
                'id' => 'p1',
                'profMax' => 20,
                'membres' => [
                    ['diverId' => 'd1', 'aptitude' => 'PA20'],
                    ['diverId' => 'd2', 'aptitude' => 'PA20'],
                ],
            ]];
            $stored = [
                'id'         => 'd1',
                'status'     => 'prepared',
                'answers'    => json_encode(['date' => '2026-10-25T10:00']),
                'palanquees' => json_encode($palanquees),
            ];

            $this->pdo->respond('/FOR UPDATE/', [$stored]);
            $this->pdo->respond('/FROM clubs/', [['structure_type' => 'club']]);
            $this->pdo->respond('/FROM divers\s+WHERE/i', [
                [
                    'id' => 'd1', 'nom' => 'Un', 'prenom' => 'A',
                    'niveau_plongeur' => 'N2', 'niveau_encadrant' => null,
                    'aptitudes_sup' => '[]', 'qualifs' => '[]',
                    'medical' => '2026-01-01', 'date_naissance' => '1990-01-01',
                ],
                [
                    'id' => 'd2', 'nom' => 'Deux', 'prenom' => 'B',
                    'niveau_plongeur' => 'N2', 'niveau_encadrant' => null,
                    'aptitudes_sup' => '[]', 'qualifs' => '[]',
                    'medical' => '2026-01-01', 'date_naissance' => '1990-01-01',
                ],
            ]);
            $this->pdo->respond('/SELECT .* FROM dives WHERE/i', [[
                'id'               => 'd1',
                'status'           => 'archived',
                'drive_link'       => null,
                'documents_status' => 'pending',
            ]]);

            \DiveService::patch(self::CLUB, 'd1', ['status' => 'archived'], fn() => null);

            $unknownEntries = array_filter($logged, fn($e) => $e['kind'] === 'dive.unknown_divers');
            $this->assertEmpty($unknownEntries);
        } finally {
            \Log::capture(null);
        }
    }
}
