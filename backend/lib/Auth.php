<?php
declare(strict_types=1);

class Auth {
    private const COOKIE   = 'dp_session';
    // TTL session 7 jours — couvre les sorties terrain prolongées en zone blanche
    // sans réseau. Sliding refresh (cf. self::current()) prolonge tant que le DP
    // est encore online de temps en temps. Au-delà, le DP doit se reconnecter ;
    // l'outbox locale est préservée et envoyée après re-login.
    private const TTL      = 604800;     // 7 jours
    // Seuil de renouvellement sliding : on prolonge si la session a déjà brûlé
    // plus de la moitié de sa TTL. Évite d'écrire à chaque requête.
    private const SLIDE_THRESHOLD = 302400; // 3,5 jours
    private const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
    private const GOOGLE_JWKS      = 'https://www.googleapis.com/oauth2/v3/certs';
    private const JWKS_CACHE_KEY   = 'google_jwks_v1';
    private const JWKS_CACHE_TTL   = 21600; // 6h — Google rotate les clés rarement

    /**
     * Vérifie un ID token Google et retourne le payload, ou null.
     *
     * Stratégie hybride :
     *   1. Vérification locale via JWKS (clés publiques RS256 mises en cache APCu 6h).
     *      Aucun round-trip réseau si le cache est chaud → robuste, rapide, économe.
     *   2. Fallback sur l'endpoint tokeninfo si JWKS échoue (cache froid + OpenSSL
     *      absent, ou format de token non géré). Garde la compat historique.
     *
     * Dans les deux cas on revalide : aud, iss, exp.
     */
    public static function verifyGoogleToken(string $idToken): ?array {
        $payload = self::verifyJwtLocal($idToken);
        if ($payload === null) {
            // Fallback réseau si la vérif locale a échoué (par exemple JWKS
            // injoignable + APCu cache froid, ou OpenSSL non dispo en CLI).
            $payload = self::verifyViaTokeninfo($idToken);
        }
        if (!$payload) return null;

        // Revalidation côté serveur, quel que soit le mode.
        $clientId = Config::get('google')['client_id'] ?? '';
        if (($payload['aud'] ?? '') !== $clientId) return null;
        if (!in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) {
            return null;
        }
        if (((int)($payload['exp'] ?? 0)) < time()) return null;
        return $payload;
    }

    /**
     * Vérifie un JWT Google RS256 hors-ligne via la clé publique JWKS.
     * Retourne le payload si la signature est valide, null sinon.
     */
    private static function verifyJwtLocal(string $jwt): ?array {
        if (!function_exists('openssl_verify')) return null;

        $parts = explode('.', $jwt);
        if (count($parts) !== 3) return null;
        [$h64, $p64, $s64] = $parts;

        $header = json_decode(self::b64UrlDecode($h64), true);
        $payload = json_decode(self::b64UrlDecode($p64), true);
        $sig    = self::b64UrlDecode($s64);
        if (!is_array($header) || !is_array($payload) || $sig === false) return null;
        if (($header['alg'] ?? '') !== 'RS256') return null;

        $kid = $header['kid'] ?? '';
        if (!$kid) return null;

        $jwks = self::fetchJwks();
        if (!$jwks) return null;

        $key = null;
        foreach ($jwks['keys'] ?? [] as $k) {
            if (($k['kid'] ?? '') === $kid) { $key = $k; break; }
        }
        if (!$key) return null;

        $pem = self::jwkToPem($key);
        if (!$pem) return null;

        $ok = openssl_verify("{$h64}.{$p64}", $sig, $pem, OPENSSL_ALGO_SHA256);
        return $ok === 1 ? $payload : null;
    }

    private static function verifyViaTokeninfo(string $idToken): ?array {
        $url = self::GOOGLE_TOKENINFO . urlencode($idToken);
        $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
        $raw = @file_get_contents($url, false, $ctx);
        if (!$raw) return null;
        $payload = json_decode($raw, true);
        if (!is_array($payload) || isset($payload['error'])) return null;
        return $payload;
    }

    private static function fetchJwks(): ?array {
        if (function_exists('apcu_enabled') && apcu_enabled()) {
            $cached = apcu_fetch(self::JWKS_CACHE_KEY, $ok);
            if ($ok && is_array($cached)) return $cached;
        }
        $ctx = stream_context_create(['http' => ['timeout' => 6, 'ignore_errors' => true]]);
        $raw = @file_get_contents(self::GOOGLE_JWKS, false, $ctx);
        if (!$raw) return null;
        $jwks = json_decode($raw, true);
        if (!is_array($jwks) || !isset($jwks['keys'])) return null;
        if (function_exists('apcu_enabled') && apcu_enabled()) {
            apcu_store(self::JWKS_CACHE_KEY, $jwks, self::JWKS_CACHE_TTL);
        }
        return $jwks;
    }

    /**
     * Convertit un JWK RSA (e, n base64url) en PEM PKCS#1 utilisable par openssl_verify.
     * Implémentation minimale — pas de dépendance Composer.
     */
    private static function jwkToPem(array $jwk): ?string {
        if (($jwk['kty'] ?? '') !== 'RSA') return null;
        $n = self::b64UrlDecode($jwk['n'] ?? '');
        $e = self::b64UrlDecode($jwk['e'] ?? '');
        if ($n === false || $e === false) return null;

        // ASN.1 DER : SEQUENCE { INTEGER n, INTEGER e } emballé en SubjectPublicKeyInfo
        $modulus  = self::asn1Integer($n);
        $exponent = self::asn1Integer($e);
        $rsaKey   = self::asn1Sequence($modulus . $exponent);
        // BIT STRING wrapper + AlgorithmIdentifier (rsaEncryption OID)
        $bitString = "\x00" . $rsaKey; // unused bits = 0
        $bitWrap   = self::asn1TLV(0x03, $bitString);
        $algId     = self::asn1Sequence(
            self::asn1TLV(0x06, "\x2A\x86\x48\x86\xF7\x0D\x01\x01\x01") // OID rsaEncryption
            . "\x05\x00" // NULL
        );
        $spki = self::asn1Sequence($algId . $bitWrap);
        $b64  = chunk_split(base64_encode($spki), 64, "\n");
        return "-----BEGIN PUBLIC KEY-----\n{$b64}-----END PUBLIC KEY-----\n";
    }

    private static function asn1Integer(string $bytes): string {
        // INTEGER doit commencer par 0x00 si le MSB est set (sinon interprété négatif).
        if (strlen($bytes) > 0 && (ord($bytes[0]) & 0x80)) $bytes = "\x00" . $bytes;
        return self::asn1TLV(0x02, $bytes);
    }

    private static function asn1Sequence(string $contents): string {
        return self::asn1TLV(0x30, $contents);
    }

    private static function asn1TLV(int $tag, string $value): string {
        $len = strlen($value);
        if ($len < 128) {
            $lenBytes = chr($len);
        } else {
            $hex = dechex($len);
            if (strlen($hex) & 1) $hex = '0' . $hex;
            $raw = hex2bin($hex);
            $lenBytes = chr(0x80 | strlen($raw)) . $raw;
        }
        return chr($tag) . $lenBytes . $value;
    }

    private static function b64UrlDecode(string $s) {
        $s = strtr($s, '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) $s .= str_repeat('=', 4 - $pad);
        return base64_decode($s, true);
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

        // Sliding window : si la session est entamée à plus de 50%, on la
        // prolonge. Maintient l'utilisateur connecté tant qu'il revient sur
        // l'app au moins une fois tous les 3,5 jours, sans rafraîchir à chaque
        // requête (cf. SLIDE_THRESHOLD).
        $remaining = strtotime($session['expires_at']) - time();
        if ($remaining < self::SLIDE_THRESHOLD) {
            $newExpires = date('Y-m-d H:i:s', time() + self::TTL);
            Db::q('UPDATE sessions SET expires_at=? WHERE id=?', [$newExpires, $id]);
            self::setCookie($id);
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
