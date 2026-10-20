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

    /** Supprime le cookie CSRF (logout) : un nouveau jeton sera émis au prochain login. */
    public static function clear(): void {
        setcookie(self::COOKIE, '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'secure'   => true,
            'httponly' => false,
            'samesite' => 'Strict',
        ]);
    }

    /** Vrai si le double-submit (en-tête X-CSRF-Token == cookie dp_csrf) est valide. */
    public static function isValid(): bool {
        $header = (string)($_SERVER[self::HEADER] ?? '');
        $cookie = (string)($_COOKIE[self::COOKIE] ?? '');
        return $header !== '' && $cookie !== '' && hash_equals($cookie, $header);
    }

    // Validate the X-CSRF-Token header against cookie (double-submit pattern)
    public static function verify(): void {
        if (!self::isValid()) {
            Json::abort(403, 'Jeton CSRF invalide');
        }
    }

    /**
     * Protection CSRF « raisonnable » pour le logout : le jeton double-submit
     * s'il est présent, sinon l'en-tête Origin (ou à défaut Referer) doit être
     * celui de l'application. Le cookie de session est par ailleurs
     * SameSite=Lax : il n'est pas envoyé sur un POST cross-site.
     *
     * Objectif : un client dont le cookie CSRF a disparu (expiré, purgé) doit
     * pouvoir se déconnecter réellement — avant, le 403 laissait la session
     * vivante côté serveur alors que l'UI se croyait déconnectée.
     */
    public static function verifyForLogout(): void {
        if (self::isValid()) return;
        $domain = (string)(Config::get('app')['domain'] ?? '');
        $origin  = isset($_SERVER['HTTP_ORIGIN'])  ? (string)$_SERVER['HTTP_ORIGIN']  : null;
        $referer = isset($_SERVER['HTTP_REFERER']) ? (string)$_SERVER['HTTP_REFERER'] : null;
        if (!self::isTrustedOrigin($origin, $referer, $domain)) {
            Json::abort(403, 'Origine de la requête non autorisée');
        }
    }

    /**
     * Fonction pure (testée) : l'Origin — ou, s'il est absent, le Referer —
     * désigne-t-il exactement https://{domain} ?
     */
    public static function isTrustedOrigin(?string $origin, ?string $referer, string $domain): bool {
        if ($domain === '') return false;
        $expected = 'https://' . strtolower($domain);

        if ($origin !== null && $origin !== '') {
            return strtolower(rtrim($origin, '/')) === $expected;
        }
        if ($referer !== null && $referer !== '') {
            $parts = parse_url($referer);
            if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) return false;
            if (isset($parts['port']) && (int)$parts['port'] !== 443) return false;
            return strtolower($parts['scheme']) === 'https'
                && strtolower($parts['host']) === strtolower($domain);
        }
        return false;
    }
}
