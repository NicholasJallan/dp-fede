<?php
declare(strict_types=1);

class Csrf {
    private const COOKIE  = 'dp_csrf';
    private const HEADER  = 'HTTP_X_CSRF_TOKEN';
    // Aligné sur la TTL session (7 jours). Évite que le cookie CSRF expire
    // pendant qu'un DP est offline avec des actions en outbox prêtes à partir.
    private const TTL     = 604800;

    // Issue or refresh the CSRF cookie, return the token
    public static function token(): string {
        $existing = $_COOKIE[self::COOKIE] ?? '';
        if ($existing && strlen($existing) === 64) return $existing;

        $token = bin2hex(random_bytes(32));
        setcookie(self::COOKIE, $token, [
            'expires'  => time() + self::TTL,
            'path'     => '/',
            'secure'   => true,
            'httponly' => false,  // JS must read it
            'samesite' => 'Strict',
        ]);
        return $token;
    }

    // Validate the X-CSRF-Token header against cookie (double-submit pattern)
    public static function verify(): void {
        $header = $_SERVER[self::HEADER] ?? '';
        $cookie = $_COOKIE[self::COOKIE] ?? '';
        if (!$header || !$cookie || !hash_equals($cookie, $header)) {
            Json::abort(403, 'Jeton CSRF invalide');
        }
    }
}
