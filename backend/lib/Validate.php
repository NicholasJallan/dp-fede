<?php
declare(strict_types=1);

class Validate {
    private array $errors = [];
    private array $data;

    public function __construct(array $data) {
        $this->data = $data;
    }

    public function required(string $key, string $label): self {
        if (!isset($this->data[$key]) || trim((string)$this->data[$key]) === '') {
            $this->errors[] = "{$label} est requis";
        }
        return $this;
    }

    public function maxLen(string $key, int $max, string $label): self {
        if (isset($this->data[$key]) && mb_strlen((string)$this->data[$key]) > $max) {
            $this->errors[] = "{$label} ne doit pas dépasser {$max} caractères";
        }
        return $this;
    }

    public function date(string $key, string $label): self {
        $v = $this->data[$key] ?? '';
        if ($v === '') return $this;
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $v);
        if (!$dt || $dt->format('Y-m-d') !== $v) {
            $this->errors[] = "{$label} doit être une date valide au format AAAA-MM-JJ";
        }
        return $this;
    }

    public function inList(string $key, array $allowed, string $label): self {
        $v = $this->data[$key] ?? '';
        if ($v !== '' && !in_array($v, $allowed, true)) {
            $this->errors[] = "{$label} a une valeur non autorisée";
        }
        return $this;
    }

    public function abortIfErrors(): void {
        if ($this->errors) Json::abort(422, implode('; ', $this->errors));
    }

    public function str(string $key, string $default = ''): string {
        return trim((string)($this->data[$key] ?? $default));
    }

    public function nullable(string $key): ?string {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '') return null;
        return trim((string)$v);
    }

    public function float(string $key): ?float {
        $v = $this->data[$key] ?? null;
        return is_numeric($v) ? (float)$v : null;
    }

    public function arr(string $key): array {
        $v = $this->data[$key] ?? [];
        return is_array($v) ? $v : [];
    }

    public function jsonArr(string $key): string {
        return json_encode($this->arr($key), JSON_UNESCAPED_UNICODE);
    }
}
