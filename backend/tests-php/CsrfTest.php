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

    /**
     * En CLI, setcookie() émet un warning "headers already sent". On capture
     * ob_start() pour ne pas violer beStrictAboutOutputDuringTests, et on
     * mute le warning avec @ (warning attendu en CLI, pas en HTTP).
     */
    public function testTokenIssuesValidHex(): void
    {
        $_COOKIE = [];
        ob_start();
        $tok = @\Csrf::token();
        ob_end_clean();
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $tok);
    }

    /**
     * Si un cookie valide existe déjà, token() le renvoie sans en générer
     * un nouveau (évite la rotation à chaque requête).
     */
    public function testTokenReusesExistingValidCookie(): void
    {
        $existing = str_repeat('c', 64);
        $_COOKIE['dp_csrf'] = $existing;
        $this->assertSame($existing, \Csrf::token());
    }
}
