<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

class ValidateTest extends TestCase
{
    private function errors(Validate $v): array
    {
        $r = new \ReflectionProperty(Validate::class, 'errors');
        $r->setAccessible(true);
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
}
