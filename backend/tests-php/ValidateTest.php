<?php
declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ValidateTest extends TestCase
{
    private function errors(Validate $v): array
    {
        return (new \ReflectionProperty(Validate::class, 'errors'))->getValue($v);
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

    #[DataProvider('nonObjects')]
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

    /**
     * PATCH /api/auth/account renvoyait 500 (production, 04/09/2026) : un
     * appelant passait `$user['champ'] ?? null` en défaut alors que la
     * signature exigeait une chaîne (strict_types). Le défaut est nullable.
     */
    public function testStrAcceptsANullDefault(): void
    {
        $v = new \Validate(['nom' => '  Dupont ']);
        $this->assertSame('Dupont', $v->str('nom', null));
        $this->assertSame('', $v->str('president_nom', null));
        $this->assertSame('x', $v->str('absent', 'x'));
    }

    public function testRequiredHandlesArrayWithoutWarningOrTypeError(): void
    {
        $v = (new \Validate(['field' => ['bad']]))->required('field', 'Champ');
        $errors = $this->errors($v);
        $this->assertNotEmpty($errors);
        $this->assertStringContainsString('Champ', $errors[0]);
    }

    public function testMaxLenHandlesArrayWithoutWarningOrTypeError(): void
    {
        $v = (new \Validate(['field' => ['bad']]))->maxLen('field', 50, 'Champ');
        $errors = $this->errors($v);
        $this->assertNotEmpty($errors);
        $this->assertStringContainsString('Champ', $errors[0]);
    }

    public function testDateHandlesArrayWithoutWarningOrTypeError(): void
    {
        $v = (new \Validate(['field' => ['bad']]))->date('field', 'Date');
        $errors = $this->errors($v);
        $this->assertNotEmpty($errors);
        $this->assertStringContainsString('Date', $errors[0]);
    }

    public function testCoordinatesAcceptsValidFloatsAndNumericStrings(): void
    {
        $this->assertSame([43.48, -1.56], \Validate::coordinates(43.48, -1.56));
        $this->assertSame([43.48, -1.56], \Validate::coordinates('43.48', '-1.56'));
        $this->assertSame([0.0, 0.0], \Validate::coordinates(0, 0));
        $this->assertSame([0.0, 0.0], \Validate::coordinates('0', '0'));
        $this->assertSame([-90.0, -180.0], \Validate::coordinates(-90, -180));
        $this->assertSame([90.0, 180.0], \Validate::coordinates('90', '180'));
    }

    #[DataProvider('invalidCoordinates')]
    public function testCoordinatesRejectsInvalidValues(mixed $lat, mixed $lng): void
    {
        $this->assertNull(\Validate::coordinates($lat, $lng));
    }

    public static function invalidCoordinates(): array
    {
        return [
            'lat out of bounds high' => [90.1, 0],
            'lat out of bounds low'  => [-90.1, 0],
            'lng out of bounds high' => [0, 180.1],
            'lng out of bounds low'  => [0, -180.1],
            'lat non-numeric string' => ['abc', 0],
            'lng non-numeric string' => [0, 'xyz'],
            'lat null'               => [null, 0],
            'lng null'               => [0, null],
            'lat empty string'       => ['', 0],
            'lng empty string'       => [0, ''],
            'lat array'              => [[43.5], 0],
            'lng array'              => [0, [-1.5]],
        ];
    }
}
