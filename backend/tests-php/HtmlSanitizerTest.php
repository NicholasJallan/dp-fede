<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

class HtmlSanitizerTest extends TestCase
{
    // --- Balises bloquées ---

    public function testRemovesIframeWithContent(): void
    {
        $html = '<p>Avant</p><iframe src="file:///etc/passwd" width="900" height="1200"></iframe><p>Après</p>';
        $out  = HtmlSanitizer::forPdf($html);
        $this->assertStringNotContainsString('<iframe', $out);
        $this->assertStringNotContainsString('/etc/passwd', $out);
    }

    public function testRemovesObjectTag(): void
    {
        $out = HtmlSanitizer::forPdf('<object data="file:///etc/shadow"><param name="x" value="y"/></object>');
        $this->assertStringNotContainsString('<object', $out);
    }

    public function testRemovesEmbedTag(): void
    {
        $out = HtmlSanitizer::forPdf('<embed src="file:///var/secret" />');
        $this->assertStringNotContainsString('<embed', $out);
    }

    public function testRemovesBaseTag(): void
    {
        $out = HtmlSanitizer::forPdf('<base href="http://evil.example.com/">');
        $this->assertStringNotContainsString('<base', $out);
    }

    public function testRemovesLinkRelImport(): void
    {
        $out = HtmlSanitizer::forPdf('<link rel="import" href="file:///etc/passwd">');
        $this->assertStringNotContainsString('<link', $out);
    }

    // --- Schémas URI bloqués ---

    public function testNeutralizeFileSchemeInSrc(): void
    {
        $out = HtmlSanitizer::forPdf('<img src="file:///etc/passwd">');
        $this->assertStringNotContainsString('file://', $out);
        $this->assertStringContainsString('about:blank', $out);
    }

    public function testNeutralizeJavascriptSchemeInHref(): void
    {
        $out = HtmlSanitizer::forPdf('<a href="javascript:alert(1)">clic</a>');
        $this->assertStringNotContainsString('javascript:', $out);
        $this->assertStringContainsString('about:blank', $out);
    }

    public function testNeutralizeDataUriNonImage(): void
    {
        $out = HtmlSanitizer::forPdf('<script src="data:text/javascript,alert(1)"></script>');
        $this->assertStringNotContainsString('data:text', $out);
    }

    public function testAllowDataImageUri(): void
    {
        $html = '<img src="data:image/png;base64,abc123">';
        $out  = HtmlSanitizer::forPdf($html);
        $this->assertStringContainsString('data:image/png;base64,abc123', $out);
    }

    public function testAllowHttpsUri(): void
    {
        $html = '<img src="https://example.com/logo.png">';
        $out  = HtmlSanitizer::forPdf($html);
        $this->assertStringContainsString('https://example.com/logo.png', $out);
    }

    // --- Contenu légitime préservé ---

    public function testPreservesNormalHtml(): void
    {
        $html = '<h1>Fiche sécurité</h1><p>Plongée du jour</p><table><tr><td>N1</td></tr></table>';
        $out  = HtmlSanitizer::forPdf($html);
        $this->assertSame($html, $out);
    }

    // --- PoC du plan de remédiation ---

    public function testPocIframeLocalFile(): void
    {
        $poc = '<iframe src="file:///etc/dp-fede/config.php" width="900" height="1200"></iframe>';
        $out = HtmlSanitizer::forPdf($poc);
        $this->assertStringNotContainsString('file://', $out);
        $this->assertStringNotContainsString('config.php', $out);
    }
}
