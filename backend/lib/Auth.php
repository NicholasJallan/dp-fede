<?php
declare(strict_types=1);

class Auth {
    private const COOKIE   = 'dp_session';
    private const TTL      = 86400;     // 24h in seconds
    private const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

    // Verify Google ID token via tokeninfo endpoint, return payload or null
    public static function verifyGoogleToken(string $idToken): ?array {
        $url = self::GOOGLE_TOKENINFO . urlencode($idToken);
        $ctx = stream_context_create(['http' => [
            'timeout' => 8,
            'ignore_errors' => true,
        ]]);
        $raw = @file_get_contents($url, false, $ctx);
        if (!$raw) return null;

        $payload = json_decode($raw, true);
        if (!$payload || isset($payload['error'])) return null;

        // Verify audience matches our client_id
        $clientId = Config::get('google')['client_id'];
        if (($payload['aud'] ?? '') !== $clientId) return null;

        // Verify issuer
        if (!in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) {
            return null;
        }

        // Check expiry
        if (($payload['exp'] ?? 0) < time()) return null;

        return $payload;
    }

    // Create or update user from Google payload, return user row
    public static function upsertUser(array $payload): array {
        $sub    = $payload['sub'];
        $email  = $payload['email'] ?? '';
        $nom    = $payload['family_name'] ?? '';
        $prenom = $payload['given_name'] ?? '';
        $avatar = $payload['picture'] ?? '';

        $existing = Db::row('SELECT * FROM users WHERE google_sub = ?', [$sub]);
        if ($existing) {
            Db::q(
                'UPDATE users SET email=?, avatar_url=?, last_login=NOW() WHERE id=?',
                [$email, $avatar, $existing['id']]
            );
            return Db::row('SELECT * FROM users WHERE id=?', [$existing['id']]);
        }

        // First ever user becomes admin
        $count = Db::row('SELECT COUNT(*) AS n FROM users')['n'];
        $role  = ($count == 0) ? 'admin' : 'user';

        Db::q(
            'INSERT INTO users (google_sub, email, nom, prenom, avatar_url, role, last_login)
             VALUES (?,?,?,?,?,?,NOW())',
            [$sub, $email, $nom, $prenom, $avatar, $role]
        );
        return Db::row('SELECT * FROM users WHERE google_sub=?', [$sub]);
    }

    // Issue session cookie, return session id
    public static function createSession(int $userId): string {
        $id      = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + self::TTL);
        $ip      = $_SERVER['REMOTE_ADDR'] ?? '';
        $ua      = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);

        Db::q(
            'INSERT INTO sessions (id, user_id, ip_addr, user_agent, expires_at) VALUES (?,?,?,?,?)',
            [$id, $userId, $ip, $ua, $expires]
        );

        self::setCookie($id);
        return $id;
    }

    private static function setCookie(string $id): void {
        $domain = Config::get('app')['domain'];
        setcookie(self::COOKIE, $id, [
            'expires'  => time() + self::TTL,
            'path'     => '/',
            'domain'   => $domain,
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    // Return current user from session cookie, or null
    public static function current(): ?array {
        $id = $_COOKIE[self::COOKIE] ?? '';
        if (!$id || strlen($id) !== 64) return null;

        $session = Db::row(
            'SELECT s.user_id, s.expires_at FROM sessions s WHERE s.id=?',
            [$id]
        );
        if (!$session) return null;
        if (strtotime($session['expires_at']) < time()) {
            Db::q('DELETE FROM sessions WHERE id=?', [$id]);
            return null;
        }

        return Db::row('SELECT * FROM users WHERE id=?', [$session['user_id']]);
    }

    // Require authenticated user or abort 401
    public static function require(): array {
        $user = self::current();
        if (!$user) Json::abort(401, 'Non authentifié');
        return $user;
    }

    // Require admin role or abort 403
    public static function requireAdmin(): array {
        $user = self::require();
        if ($user['role'] !== 'admin') Json::abort(403, 'Accès réservé aux administrateurs');
        return $user;
    }

    // Email du super-administrateur unique du système.
    // Le super-admin a accès aux endpoints de gestion d'utilisateurs (liste,
    // changement de rôle, suppression). Aucun autre compte n'y a accès, même
    // promu admin en base : on n'autorise pas l'escalade par modification DB.
    public const SUPER_ADMIN_EMAIL = 'nicholas.jallan@gmail.com';

    /**
     * Vérifie que l'utilisateur courant est *le* super-admin (par email).
     * Aborte 403 sinon.
     */
    public static function requireSuperAdmin(): array {
        $user = self::require();
        if (($user['email'] ?? '') !== self::SUPER_ADMIN_EMAIL) {
            Json::abort(403, 'Accès restreint au super-administrateur');
        }
        return $user;
    }

    /** Helper pure-lecture, pour les vues qui veulent juste savoir. */
    public static function isSuperAdmin(?array $user): bool {
        return $user && ($user['email'] ?? '') === self::SUPER_ADMIN_EMAIL;
    }

    public static function destroySession(): void {
        $id = $_COOKIE[self::COOKIE] ?? '';
        if ($id) Db::q('DELETE FROM sessions WHERE id=?', [$id]);
        setcookie(self::COOKIE, '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    // Purge expired sessions (call occasionally)
    public static function purgeExpired(): void {
        Db::q('DELETE FROM sessions WHERE expires_at < NOW()');
    }
}
