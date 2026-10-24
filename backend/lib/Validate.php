<?php
declare(strict_types=1);

class Validate {
    private array $errors = [];
    private array $data;

    public function __construct(array $data) {
        $this->data = $data;
    }

    /** Messages d'erreur accumulés (vide : corps valide). */
    public function errors(): array {
        return $this->errors;
    }

    public function required(string $key, string $label): self {
        if (!$this->isText($key, $label)) return $this;
        if (!isset($this->data[$key]) || trim((string)$this->data[$key]) === '') {
            $this->errors[] = "{$label} est requis";
        }
        return $this;
    }

    public function maxLen(string $key, int $max, string $label): self {
        if (!$this->isText($key, $label)) return $this;
        if (isset($this->data[$key]) && mb_strlen((string)$this->data[$key]) > $max) {
            $this->errors[] = "{$label} ne doit pas dépasser {$max} caractères";
        }
        return $this;
    }

    public function date(string $key, string $label): self {
        if (!$this->isText($key, $label)) return $this;
        $v = (string)($this->data[$key] ?? '');
        if ($v === '') return $this;
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $v);
        if (!$dt || $dt->format('Y-m-d') !== $v) {
            $this->errors[] = "{$label} doit être une date valide au format AAAA-MM-JJ";
        }
        return $this;
    }

    public function inList(string $key, array $allowed, string $label): self {
        if (!$this->isText($key, $label)) return $this;
        $v = $this->data[$key] ?? '';
        if ($v !== '' && !in_array($v, $allowed, true)) {
            $this->errors[] = "{$label} a une valeur non autorisée";
        }
        return $this;
    }

    public function abortIfErrors(): void {
        if ($this->errors) Json::abort(422, implode('; ', $this->errors));
    }

    public function str(string $key, ?string $default = ''): string {
        $v = $this->data[$key] ?? $default ?? '';
        return is_scalar($v) ? trim((string)$v) : '';
    }

    public function nullable(string $key): ?string {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '' || !is_scalar($v)) return null;
        return trim((string)$v);
    }

    /**
     * Champ absent ou scalaire ; un tableau / objet (corps forgé) est une
     * erreur de saisie, pas une TypeError 500. Une seule erreur par champ.
     */
    private function isText(string $key, string $label): bool {
        $v = $this->data[$key] ?? null;
        if ($v === null || is_scalar($v)) return true;
        $msg = "{$label} doit être un texte";
        if (!in_array($msg, $this->errors, true)) $this->errors[] = $msg;
        return false;
    }

    public function float(string $key): ?float {
        $v = $this->data[$key] ?? null;
        return is_numeric($v) ? (float)$v : null;
    }

    /**
     * Coordonnées GPS (nombres ou chaînes numériques) dans les bornes
     * terrestres, sinon null. 0 est valide (équateur, méridien de Greenwich).
     * @return array{0: float, 1: float}|null
     */
    public static function coordinates(mixed $lat, mixed $lng): ?array {
        if (!is_numeric($lat) || !is_numeric($lng)) return null;
        $lat = (float)$lat;
        $lng = (float)$lng;
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) return null;
        return [$lat, $lng];
    }

    public function arr(string $key): array {
        $v = $this->data[$key] ?? [];
        return is_array($v) ? $v : [];
    }

    /**
     * Encode en JSON un objet/tableau reçu du client, en refusant les autres
     * types et les charges trop volumineuses (fonction pure, testée).
     *
     * @param mixed $value
     * @throws InvalidArgumentException
     */
    public static function encodeJsonObject($value, int $maxBytes, string $label): string {
        if (!is_array($value)) {
            throw new InvalidArgumentException("{$label} doit être un objet JSON");
        }
        $json = json_encode($value, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new InvalidArgumentException("{$label} n'est pas sérialisable en JSON");
        }
        if (strlen($json) > $maxBytes) {
            throw new InvalidArgumentException("{$label} dépasse la taille maximale autorisée");
        }
        return $json;
    }
}
