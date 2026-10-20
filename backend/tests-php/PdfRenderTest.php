<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * PdfRender::h / toText — les templates PDF sont en strict_types et reçoivent
 * des réponses JSON contenant des nombres : h() ne doit jamais lever de
 * TypeError.
 */
final class PdfRenderTest extends TestCase
{
    /** @dataProvider values */
    public function testHAcceptsAnyScalar($input, string $expected): void
    {
        $this->assertSame($expected, \PdfRender::h($input));
    }

    public static function values(): array
    {
        return [
            'int'         => [40, '40'],
            'float'       => [12.5, '12.5'],
            'float entier'=> [12.0, '12'],
            'null'        => [null, ''],
            'bool'        => [true, 'oui'],
            'tableau'     => [['a'], ''],
            'html'        => ['<b>"x"</b>', '&lt;b&gt;&quot;x&quot;&lt;/b&gt;'],
        ];
    }

    public function testTemplateClosureAcceptsInt(): void
    {
        // Reproduit la closure des templates (fichier en strict_types).
        $h = fn($v): string => \PdfRender::h($v);
        $this->assertSame('20', $h(20));
    }

    public function testFormatDateTimeHandlesEmptyAndValid(): void
    {
        $this->assertSame('—', \PdfRender::formatDateTime(null));
        $this->assertSame('—', \PdfRender::formatDateTime(''));
        $this->assertSame('14 juin 2026 — 09:00', \PdfRender::formatDateTime('2026-06-14T09:00'));
    }
}
