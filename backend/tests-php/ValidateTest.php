<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

class ValidateTest extends TestCase
{
    private function errors(Validate $v): array
    {
        $r = new \ReflectionProperty(Validate::class, 'errors');
        if (PHP_VERSION_ID < 80100) {
            $r->setAccessible(true); // requis seulement avant PHP 8.1
        }
        return $r->getValue($v);
    }

    private function hasDateError(array $data): bool
    {
        $v = (new Validate($data))->date('d', 'Date');
        return count($this->errors($v)) > 0;
    }

    public function testValidDatePasses(): void
    {
        $this->assertFalse($this->hasDateError(['d' => '2026-02-28']));
    }

    public function testLeapYearPasses(): void
    {
        $this->assertFalse($this->hasDateError(['d' => '2024-02-29']));
    }

    public function testNonLeapYearFeb29Rejected(): void
    {
        $this->assertTrue($this->hasDateError(['d' => '2026-02-29']));
    }

    public function testInvalidFormatRejected(): void
    {
        $this->assertTrue($this->hasDateError(['d' => '26-02-28']));
    }

    public function testMonth13Rejected(): void
    {
        $this->assertTrue($this->hasDateError(['d' => '2026-13-01']));
    }

    public function testDay32Rejected(): void
    {
        $this->assertTrue($this->hasDateError(['d' => '2026-01-32']));
    }

    public function testOverflowDateRejected(): void
    {
        // 2026-02-31 ne peut pas exister ; PHP le déroule en mars sans ce check
        $this->assertTrue($this->hasDateError(['d' => '2026-02-31']));
    }

    public function testExtremeValueRejected(): void
    {
        $this->assertTrue($this->hasDateError(['d' => '9999-99-99']));
    }

    public function testEmptyStringPassesDateCheck(): void
    {
        // L'absence de valeur est gérée par required(), pas date()
        $this->assertFalse($this->hasDateError(['d' => '']));
    }

    public function testMissingKeyPassesDateCheck(): void
    {
        $this->assertFalse($this->hasDateError([]));
    }

    // ── encodeJsonObject (render_state) ─────────────────────────────────────

    public function testEncodeJsonObjectAcceptsArray(): void
    {
        $json = \Validate::encodeJsonObject(['pressions' => ['p1-d1' => 50]], 1024, 'render_state');
        $this->assertSame('{"pressions":{"p1-d1":50}}', $json);
    }

    /** @dataProvider nonObjects */
    public function testEncodeJsonObjectRejectsNonArrays($value): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \Validate::encodeJsonObject($value, 1024, 'render_state');
    }

    public static function nonObjects(): array
    {
        return [
            'chaîne' => ['{"a":1}'],
            'entier' => [42],
            'null'   => [null],
            'bool'   => [true],
        ];
    }

    public function testEncodeJsonObjectRejectsOversizedPayload(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \Validate::encodeJsonObject(['x' => str_repeat('a', 100)], 50, 'render_state');
    }

    public function testEncodeJsonObjectRejectsInvalidUtf8(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \Validate::encodeJsonObject(['x' => "\xB1\x31"], 1024, 'render_state');
    }
}
