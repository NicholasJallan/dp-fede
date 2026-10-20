<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Les conflits (409) portent un code stable (`code` dans la réponse) : le
 * client hors-ligne distingue ainsi une idempotence d'un vrai conflit sans
 * dépendre du libellé (cf. docs/api-club.md, « Codes d'erreur stables »).
 */
final class ErrorCodesTest extends TestCase
{
    private const DIR = __DIR__ . '/..';

    /** Arguments de chaque appel Json::abort($status, …) du code source. */
    private static function abortCalls(int $status): array
    {
        $calls = [];
        foreach (array_merge(glob(self::DIR . '/routes/*.php'), glob(self::DIR . '/lib/*.php')) as $file) {
            $src = (string)file_get_contents($file);
            $offset = 0;
            while (($pos = strpos($src, "Json::abort({$status},", $offset)) !== false) {
                $depth = 0;
                $i = $pos + strlen('Json::abort');
                for (; $i < strlen($src); $i++) {
                    if ($src[$i] === '(') $depth++;
                    if ($src[$i] === ')' && --$depth === 0) break;
                }
                $calls[] = [basename($file), substr($src, $pos, $i - $pos + 1)];
                $offset = $i;
            }
        }
        return $calls;
    }

    public function testEveryConflictCarriesAStableCode(): void
    {
        $calls = self::abortCalls(409);
        $this->assertNotEmpty($calls);
        foreach ($calls as [$file, $call]) {
            $this->assertMatchesRegularExpression("/,\\s*('[A-Z][A-Z_]+'|DivePolicy::[A-Z_]+|\\$\\w+\\['code'\\])\\s*\\)$/", $call, "{$file} : 409 sans code stable : {$call}");
        }
    }

    public function testAccountDeletionConflictsCarryACode(): void
    {
        $user = ['id' => 1, 'role' => 'admin', 'email' => 'a@example.com'];
        $this->assertSame('LAST_ADMIN', \Account::deletionError($user, ['confirm' => 'SUPPRIMER'], 0)[2] ?? null);
    }
}
