<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Csrf::verify — double-submit pattern.
 *
 * On teste la voie nominale (cookie == header → pas d'abort). La voie
 * négative (`Json::abort` → exit) ne peut pas être testée en unit pur :
 * elle est validée par des tests d'intégration (cf. tests-php/integration/
 * — à créer en Sprint 3 quand on aura un harness HTTP).
 */
final class CsrfTest extends TestCase
{
    protected function setUp(): void
    {
        $_COOKIE = [];
        $_SERVER['HTTP_X_CSRF_TOKEN'] = '';
    }

    protected function tearDown(): void
    {
        $_COOKIE = [];
        unset($_SERVER['HTTP_X_CSRF_TOKEN']);
    }

    /**
     * Cas nominal : cookie ET header présents et égaux → pas d'exception.
     * @doesNotPerformAssertions
     */
    public function testVerifyPassesWhenTokensMatch(): void
    {
        $tok = str_repeat('a', 64);
        $_COOKIE['dp_csrf'] = $tok;
        $_SERVER['HTTP_X_CSRF_TOKEN'] = $tok;
        \Csrf::verify();
        // Si on arrive ici sans exit, c'est OK. Marqué @doesNotPerformAssertions
        // pour ne pas faire échouer phpunit en strict mode.
    }

    public function testTokenIssuesValidHex(): void
    {
        $_COOKIE = [];
        // Csrf::token() émet setcookie + retourne le token.
        // setcookie loggue un warning en CLI (headers already sent) — on
        // mute le warning car ce n'est pas la responsabilité du test.
        @\Csrf::token();
        // En CLI on n'a pas $_COOKIE qui se met à jour automatiquement, mais
        // au moins la méthode ne crash pas et retournerait un hex valide
        // si on capturait le retour direct (ce qu'on fait ci-dessous).
        $tok = @\Csrf::token();
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $tok);
    }
}
