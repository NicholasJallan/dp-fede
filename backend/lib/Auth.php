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
     * Délègue à firebase/php-jwt v7 (audit tiers, supprime le code ASN.1 maison).
     */
    private static function verifyJwtLocal(string $jwt): ?array {
        if (!class_exists('\Firebase\JWT\JWK')) return null;

        $jwks = self::fetchJwks();
        if (!$jwks) return null;

        try {
            $keys    = \Firebase\JWT\JWK::parseKeySet($jwks);
            $decoded = \Firebase\JWT\JWT::decode($jwt, $keys);
            return (array) json_decode(json_encode($decoded), true);
        } catch (\Throwable $e) {
            return null;
        }
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
            'SELECT s.user_id, s.expires_at, s.workspace_id FROM sessions s WHERE s.id=?',
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

        $user = Db::row('SELECT * FROM users WHERE id=?', [$session['user_id']]);
        if (!$user) return null;

        // Un compte-structure n'est pas un compte connectable : aucune session ne
        // doit pouvoir s'y rattacher (cf. migration 002, users.kind).
        if (($user['kind'] ?? 'person') === 'workspace') return null;

        return self::withScope($user, $session['workspace_id'] ?? null, $id);
    }

    /**
     * Enrichit la ligne utilisateur avec le scope de données actif.
     *
     *   $user['id']       → identité : auth, super-admin, created_by. Jamais modifié.
     *   $user['scope_id'] → propriétaire des données (divers / sites / dives) :
     *                       soi-même en espace personnel, le compte-structure
     *                       quand une structure est active sur la session.
     *
     * L'appartenance est revérifiée à chaque requête : retirer un membre ou
     * archiver la structure le renvoie immédiatement dans son espace personnel.
     */
    private static function withScope(array $user, $workspaceId, string $sessionId): array {
        $user['scope_id']  = (int)$user['id'];
        $user['workspace'] = null;

        if ($workspaceId) {
            $ws = Db::row(
                'SELECT w.id, w.name, w.slug, w.data_user_id, m.role
                   FROM workspaces w
                   JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
                  WHERE w.id = ? AND w.archived_at IS NULL',
                [$user['id'], $workspaceId]
            );
            if ($ws) {
                $user['scope_id']  = (int)$ws['data_user_id'];
                $user['workspace'] = [
                    'id'   => (int)$ws['id'],
                    'name' => $ws['name'],
                    'slug' => $ws['slug'],
                    'role' => $ws['role'],
                ];
            } else {
                // Structure archivée ou membre retiré → retour en espace personnel.
                Db::q('UPDATE sessions SET workspace_id=NULL WHERE id=?', [$sessionId]);
            }
        }

        $user['scope'] = self::scopeIdentity($user);
        return $user;
    }

    /**
     * Champs « structure » consommés par la fiche de sécurité (Art. A322-72),
     * l'écran profil et le numéro d'urgence. En espace personnel ce sont ceux
     * du compte ; dans une structure, ceux du compte-structure — pour que la
     * fiche porte le nom du stage et non le club personnel du DP.
     */
    private static function scopeIdentity(array $user): array {
        $src = $user;
        if ($user['workspace'] !== null && (int)$user['scope_id'] !== (int)$user['id']) {
            $row = Db::row('SELECT * FROM users WHERE id=?', [$user['scope_id']]);
            if ($row) $src = $row;
        }
        return [
            'id'               => (int)$user['scope_id'],
            'kind'             => $user['workspace'] === null ? 'personal' : 'workspace',
            'name'             => $user['workspace'] === null
                                    ? (($user['club_nom'] ?? '') !== '' ? $user['club_nom'] : 'Mon espace')
                                    : $user['workspace']['name'],
            'club_nom'         => $src['club_nom'] ?? '',
            'club_numero'      => $src['club_numero'] ?? '',
            'club_siret'       => $src['club_siret'] ?? '',
            'structure_type'   => $src['structure_type'] ?? null,
            'president_prenom' => $src['president_prenom'] ?? null,
            'president_nom'    => $src['president_nom'] ?? null,
            'president_tel'    => $src['president_tel'] ?? null,
            'urgence_defaut'   => $src['urgence_defaut'] ?? null,
        ];
    }

    /**
     * Bascule le scope de la session courante. $wsId null = espace personnel.
     * L'appartenance doit avoir été vérifiée par l'appelant (routes/workspaces.php).
     */
    public static function setWorkspace(?int $wsId): bool {
        $sid = $_COOKIE[self::COOKIE] ?? '';
        if (!$sid || strlen($sid) !== 64) return false;
        Db::q('UPDATE sessions SET workspace_id=? WHERE id=?', [$wsId, $sid]);
        return true;
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
