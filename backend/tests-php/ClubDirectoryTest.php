<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/**
 * Annuaire et création de clubs : normalisation (fixture commune avec
 * tests/club-directory.test.js), validation, unicité du nom et des numéros.
 */
final class ClubDirectoryTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/club-identity.json';
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';

    private ?RecordingPdo $pdo = null;

    protected function tearDown(): void
    {
        if ($this->pdo) RecordingPdo::uninstall();
    }

    private function db(): RecordingPdo
    {
        return $this->pdo = RecordingPdo::install();
    }

    private static function fixture(): array
    {
        return json_decode((string)file_get_contents(self::FIXTURE_PATH), true, 512, JSON_THROW_ON_ERROR);
    }

    // ── Normalisation (fixture partagée) ───────────────────────────────────

    public function testNamesAreNormalizedLikeTheFrontEnd(): void
    {
        foreach (self::fixture()['names'] as [$in, $out]) {
            $this->assertSame($out, \Club::normalizeName($in), json_encode($in));
        }
    }

    public function testIdentifiersAreNormalizedLikeTheFrontEnd(): void
    {
        foreach (self::fixture()['identifiers'] as [$in, $out]) {
            $this->assertSame($out, \Club::normalizeIdentifier($in), json_encode($in));
        }
    }

    public function testClubUpdatesAreNormalizedToo(): void
    {
        [$fields, $errors] = \Club::sanitizeClubFields(['nom' => ' Bulles  en Valais ', 'numero_ffessm' => '06 13 0045', 'siret' => '123 456 789 00012']);
        $this->assertSame([], $errors);
        $this->assertSame(['nom' => 'Bulles en Valais', 'numero_ffessm' => '06130045', 'siret' => '12345678900012'], $fields);
    }

    // ── Validation d'un nouveau club ───────────────────────────────────────

    public function testNewClubRequiresANameAndAStructureType(): void
    {
        [, $errors] = \Club::sanitizeNewClub(['nom' => ' x ']);
        $this->assertCount(2, $errors);
        $this->assertStringContainsString('Nom du club obligatoire', $errors[0]);
        $this->assertStringContainsString('Type de structure obligatoire', $errors[1]);

        [, $errors] = \Club::sanitizeNewClub(['nom' => 'Bulles', 'structure_type' => 'inconnu']);
        $this->assertCount(1, $errors);
    }

    public function testNewClubDefaultsToFrenchRules(): void
    {
        [$fields, $errors] = \Club::sanitizeNewClub(['nom' => 'Bulles', 'structure_type' => 'club']);
        $this->assertSame([], $errors);
        $this->assertSame('FR', $fields['jurisdiction']);

        [$fields] = \Club::sanitizeNewClub(['nom' => 'Tahiti Plongée', 'structure_type' => 'patente', 'jurisdiction' => 'PF']);
        $this->assertSame('PF', $fields['jurisdiction']);
    }

    // ── Unicité ────────────────────────────────────────────────────────────

    public function testIdentityConflictReportsTheFirstTakenField(): void
    {
        $pdo = $this->db();
        $pdo->respond('/numero_ffessm = \?/', [['id' => 'autre']]);
        $conflict = \ClubDirectory::identityConflict(['nom' => 'Bulles', 'numero_ffessm' => '06130045', 'siret' => '']);
        $this->assertSame('CLUB_NUMBER_TAKEN', $conflict['code']);

        // Nom contrôlé d'abord, SIRET vide jamais contrôlé, clubs supprimés ignorés.
        $sql = $pdo->statements();
        $this->assertCount(2, $sql);
        $this->assertSame('SELECT id FROM clubs WHERE deleted_at IS NULL AND nom = ? LIMIT 1', $sql[0]);
        $this->assertSame('SELECT id FROM clubs WHERE deleted_at IS NULL AND numero_ffessm = ? LIMIT 1', $sql[1]);
    }

    public function testIdentityConflictExcludesTheClubBeingEdited(): void
    {
        $pdo = $this->db();
        $this->assertNull(\ClubDirectory::identityConflict(['siret' => '12345678900012'], self::CLUB));
        $this->assertSame(['12345678900012', self::CLUB], $pdo->log[0]['params']);
        $this->assertStringEndsWith('AND id <> ? LIMIT 1', $pdo->statements()[0]);
    }

    public function testIdentityConflictIgnoresEmptyValues(): void
    {
        $pdo = $this->db();
        $this->assertNull(\ClubDirectory::identityConflict(['nom' => '', 'numero_ffessm' => null, 'president_nom' => 'X']));
        $this->assertSame([], $pdo->log);
    }

    public function testDuplicateKeyErrorsAreTranslated(): void
    {
        $dup = static fn(string $key): \PDOException => new \PDOException(
            "SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry 'x' for key '{$key}'",
            23000
        );
        $this->assertSame('CLUB_NAME_TAKEN', \Club::identityConflictFromException($dup('uq_clubs_nom'))['code']);
        $this->assertSame('CLUB_NUMBER_TAKEN', \Club::identityConflictFromException($dup('uq_clubs_numero'))['code']);
        $this->assertSame('CLUB_SIRET_TAKEN', \Club::identityConflictFromException($dup('uq_clubs_siret'))['code']);
        $this->assertSame('CLUB_NAME_TAKEN', \Club::identityConflictFromException($dup('clubs.uq_clubs_nom'))['code']);
        $this->assertNull(\Club::identityConflictFromException($dup('PRIMARY')));
        $this->assertNull(\Club::identityConflictFromException(new \RuntimeException('autre')));
    }

    // ── Création ───────────────────────────────────────────────────────────

    public function testCreateMakesTheCreatorResponsableOfHisNewCurrentClub(): void
    {
        $pdo = $this->db();
        $id = \ClubDirectory::create(7, ['nom' => 'Bulles', 'structure_type' => 'club', 'jurisdiction' => 'FR', 'auto_created_for' => 9]);
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $id);

        $sql = $pdo->statements();
        $this->assertSame('BEGIN', $sql[0]);
        // Liste blanche : auto_created_for n'est pas un champ modifiable.
        $this->assertSame('INSERT INTO clubs (id, nom, structure_type, jurisdiction) VALUES (?,?,?,?)', $sql[1]);
        $this->assertSame([$id, 'Bulles', 'club', 'FR'], $pdo->log[1]['params']);
        $this->assertSame("INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,'responsable')", $sql[2]);
        $this->assertSame('UPDATE users SET current_club_id=? WHERE id=?', $sql[3]);
        $this->assertSame([$id, 7], $pdo->log[3]['params']);
        $this->assertSame('COMMIT', $sql[4]);
    }

    public function testOnlyUnnamedPersonalClubsAreRemovedAfterACreation(): void
    {
        $pdo = $this->db();
        $this->assertSame([], \Club::removeEmptyPersonalClubs(7, self::CLUB, true));
        $this->assertStringContainsString("AND c.nom = ''", $pdo->statements()[0]);
        \Club::removeEmptyPersonalClubs(7, self::CLUB);
        $this->assertStringNotContainsString("c.nom = ''", $pdo->statements()[1]);
    }

    public function testPersonalClubNeverReusesTheLegacyIdentityFields(): void
    {
        // Ancien users.club_nom = nom d'un club existant : l'index UNIQUE ferait
        // ignorer l'INSERT IGNORE puis échouer l'INSERT de repli (500 à chaque requête).
        $pdo = $this->db();
        $pdo->respond('/^INSERT IGNORE INTO clubs/', [], 1);
        \Club::createPersonalClub([
            'id' => 14, 'club_nom' => 'BEPPA Hendaye 2026', 'club_numero' => '2590049C', 'club_siret' => '123',
            'structure_type' => 'club', 'president_nom' => 'Martin',
        ]);
        $params = $pdo->log[0]['params'];
        $this->assertSame(['', '', ''], array_slice($params, 1, 3));
        $this->assertSame('club', $params[4]);
        $this->assertSame('Martin', $params[6]);
        $this->assertSame(14, $params[9]);
    }

    // ── Annuaire ───────────────────────────────────────────────────────────

    public function testLikePatternEscapesWildcards(): void
    {
        $this->assertSame('%bulles%', \ClubDirectory::likePattern('bulles'));
        $this->assertSame('%100\\%\\_ok\\\\%', \ClubDirectory::likePattern('100%_ok\\'));
    }

    public function testSearchListsNamedActiveClubsWithMyStatus(): void
    {
        $pdo = $this->db();
        $pdo->respond('/FROM clubs c/', [[
            'club_id' => self::CLUB, 'nom' => 'Bulles', 'numero_ffessm' => '06130045', 'structure_type' => 'club',
            'jurisdiction' => 'FR', 'members_count' => '3', 'is_member' => '0', 'pending_request_id' => 'r1',
        ]]);
        $clubs = \ClubDirectory::search(7, ' 06 13 ');
        $this->assertSame([[
            'club_id' => self::CLUB, 'nom' => 'Bulles', 'numero_ffessm' => '06130045', 'structure_type' => 'club',
            'jurisdiction' => 'FR', 'members_count' => 3, 'is_member' => false, 'pending_request_id' => 'r1',
        ]], $clubs);

        $sql = $pdo->statements()[0];
        $this->assertStringContainsString("c.deleted_at IS NULL AND c.nom <> ''", $sql);
        $this->assertStringContainsString('(c.nom LIKE ? OR c.numero_ffessm LIKE ?)', $sql);
        $this->assertStringEndsWith('LIMIT ' . \ClubDirectory::MAX_RESULTS, $sql);
        // Numéro recherché normalisé comme les numéros enregistrés.
        $this->assertSame([7, 7, '%06 13%', '%0613%'], $pdo->log[0]['params']);
    }

    public function testSeparatorOnlyQueryDoesNotMatchEveryNumber(): void
    {
        $pdo = $this->db();
        \ClubDirectory::search(7, ' - ');
        $sql = $pdo->statements()[0];
        $this->assertStringContainsString('AND c.nom LIKE ?', $sql);
        $this->assertStringNotContainsString('numero_ffessm LIKE', $sql);
        $this->assertSame([7, 7, '%-%'], $pdo->log[0]['params']);
    }

    public function testSearchWithoutQueryListsEveryNamedClub(): void
    {
        $pdo = $this->db();
        \ClubDirectory::search(7);
        $this->assertStringNotContainsString('LIKE', $pdo->statements()[0]);
        $this->assertSame([7, 7], $pdo->log[0]['params']);
    }

    public function testGeneratedColumnsAreNotExposed(): void
    {
        $club = \Club::publicClub(['id' => self::CLUB, 'nom' => 'B', 'nom_unique' => 'B', 'numero_unique' => null, 'siret_unique' => null]);
        $this->assertSame(['id' => self::CLUB, 'nom' => 'B'], $club);
    }
}
