<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\DoesNotPerformAssertions;
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
     */
    #[DoesNotPerformAssertions]
    public function testVerifyPassesWhenTokensMatch(): void
    {
        $tok = str_repeat('a', 64);
        $_COOKIE['dp_csrf'] = $tok;
        $_SERVER['HTTP_X_CSRF_TOKEN'] = $tok;
        \Csrf::verify();
        // Si on arrive ici sans exit, c'est OK. Marqué #[DoesNotPerformAssertions]
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

    public function testIsValidRequiresMatchingHeaderAndCookie(): void
    {
        $this->assertFalse(\Csrf::isValid());
        $_COOKIE['dp_csrf'] = str_repeat('a', 64);
        $this->assertFalse(\Csrf::isValid());
        $_SERVER['HTTP_X_CSRF_TOKEN'] = str_repeat('b', 64);
        $this->assertFalse(\Csrf::isValid());
        $_SERVER['HTTP_X_CSRF_TOKEN'] = str_repeat('a', 64);
        $this->assertTrue(\Csrf::isValid());
    }

    #[DataProvider('origins')]
    public function testIsTrustedOrigin(?string $origin, ?string $referer, bool $expected): void
    {
        $this->assertSame($expected, \Csrf::isTrustedOrigin($origin, $referer, 'dp-fede.bullesenvalais.ch'));
    }

    public static function origins(): array
    {
        return [
            'origin exact'               => ['https://dp-fede.bullesenvalais.ch', null, true],
            'origin casse différente'    => ['https://DP-FEDE.bullesenvalais.ch', null, true],
            'origin http'                => ['http://dp-fede.bullesenvalais.ch', null, false],
            'origin tiers'               => ['https://evil.example', null, false],
            'origin suffixe piégé'       => ['https://dp-fede.bullesenvalais.ch.evil.example', null, false],
            'origin "null"'              => ['null', 'https://dp-fede.bullesenvalais.ch/', false],
            'origin prime sur referer'   => ['https://evil.example', 'https://dp-fede.bullesenvalais.ch/', false],
            'referer seul ok'            => [null, 'https://dp-fede.bullesenvalais.ch/archives?x=1', true],
            'referer port non standard'  => [null, 'https://dp-fede.bullesenvalais.ch:8443/', false],
            'referer tiers'              => [null, 'https://evil.example/dp-fede.bullesenvalais.ch', false],
            'rien'                       => [null, null, false],
            'vides'                      => ['', '', false],
        ];
    }

    public function testIsTrustedOriginFalseWithoutDomain(): void
    {
        $this->assertFalse(\Csrf::isTrustedOrigin('https://', null, ''));
    }
}
