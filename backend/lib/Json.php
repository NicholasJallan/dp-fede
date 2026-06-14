<?php
declare(strict_types=1);

class Json {
    /** @param mixed $data */
    public static function ok($data = null, int $code = 200): void {
        http_response_code($code);
        header('Cache-Control: no-store');
        echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function abort(int $code, string $message): void {
        http_response_code($code);
        header('Cache-Control: no-store');
        echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function body(): array {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
