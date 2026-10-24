<?php
declare(strict_types=1);

class Json {
    /** @param mixed $data */
    public static function ok($data = null, int $code = 200): never {
        http_response_code($code);
        header('Cache-Control: no-store');
        echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Termine la requête en erreur. $errorCode (facultatif) est un code stable
     * que le client peut tester sans dépendre du libellé (ex. 'CSRF_INVALID').
     */
    public static function abort(int $code, string $message, ?string $errorCode = null): never {
        http_response_code($code);
        header('Cache-Control: no-store');
        $payload = ['ok' => false, 'error' => $message];
        if ($errorCode !== null) $payload['code'] = $errorCode;
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function body(): array {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
