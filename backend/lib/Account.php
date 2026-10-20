<?php
declare(strict_types=1);

/**
 * RGPD — droit d'accès / portabilité (export) et droit à l'effacement
 * (suppression du compte et de toutes ses données).
 *
 * Les fonctions « build* » et « deletionError » sont pures (testées sans base) ;
 * fetchExport() et deleteUserData() accèdent à MariaDB.
 */
class Account
{
    public const DELETE_CONFIRMATION = 'SUPPRIMER';
    public const EXPORT_FORMAT       = 'dp-assistant-export/1';

    // ── Fonctions pures ────────────────────────────────────────────────────

    /**
     * Vérifie qu'une demande de suppression de compte est recevable.
     *
     * @param array $user             utilisateur courant (ligne users)
     * @param array $body             corps JSON de la requête
     * @param int   $otherAdminCount  nombre d'AUTRES comptes role='admin'
     * @return array{0:int,1:string}|null [code HTTP, message] ou null si OK
     */
    public static function deletionError(array $user, array $body, int $otherAdminCount): ?array
    {
        if (($body['confirm'] ?? null) !== self::DELETE_CONFIRMATION) {
            return [422, 'Confirmation requise : envoyer { "confirm": "' . self::DELETE_CONFIRMATION . '" }'];
        }
        $isAdmin = ($user['role'] ?? '') === 'admin' || Auth::isSuperAdmin($user);
        if ($isAdmin && $otherAdminCount < 1) {
            return [409, 'Vous êtes le seul administrateur : promouvez un autre administrateur avant de supprimer votre compte'];
        }
        return null;
    }

    /**
     * Assemble l'export JSON des données d'un utilisateur.
     * Les champs JSON stockés en texte sont décodés ; les identifiants de
     * session (secrets d'authentification) sont exclus.
     */
    public static function buildExport(
        array $user,
        array $divers,
        array $sites,
        array $dives,
        array $sessions,
        string $generatedAt
    ): array {
        return [
            'format'       => self::EXPORT_FORMAT,
            'generated_at' => $generatedAt,
            'account'      => $user,
            'divers'       => array_map([self::class, 'exportDiver'], $divers),
            'sites'        => array_map([self::class, 'exportSite'], $sites),
            'dives'        => array_map([self::class, 'exportDive'], $dives),
            'sessions'     => array_map([self::class, 'exportSession'], $sessions),
        ];
    }

    public static function exportDiver(array $d): array
    {
        $d['qualifs']       = self::decodeJson($d['qualifs'] ?? null, []);
        $d['aptitudes_sup'] = self::decodeJson($d['aptitudes_sup'] ?? null, []);
        return $d;
    }

    public static function exportSite(array $s): array
    {
        $s['coordonnees'] = self::decodeJson($s['coordonnees'] ?? null, null);
        return $s;
    }

    public static function exportDive(array $d): array
    {
        $d['answers']      = self::decodeJson($d['answers'] ?? null, new \stdClass());
        $d['palanquees']   = self::decodeJson($d['palanquees'] ?? null, []);
        $d['render_state'] = self::decodeJson($d['render_state'] ?? null, new \stdClass());
        return $d;
    }

    public static function exportSession(array $s): array
    {
        unset($s['id']);
        return $s;
    }

    /**
     * @param mixed $default
     * @return mixed
     */
    public static function decodeJson(?string $raw, $default)
    {
        if ($raw === null || $raw === '') return $default;
        $v = json_decode($raw, true);
        return $v === null && json_last_error() !== JSON_ERROR_NONE ? $default : $v;
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    public static function fetchExport(int $userId): array
    {
        $user = Db::row('SELECT * FROM users WHERE id=?', [$userId]) ?? [];
        $divers = Db::all('SELECT * FROM divers WHERE user_id=? ORDER BY nom, prenom', [$userId]);
        $sites  = Db::all('SELECT * FROM sites WHERE user_id=? ORDER BY nom', [$userId]);
        $dives  = Db::all(
            'SELECT d.*, COALESCE(r.state, d.render_state) AS render_state
               FROM dives d
               LEFT JOIN dive_runtime_state r ON r.dive_id = d.id
              WHERE d.user_id=?
              ORDER BY d.date_plongee, d.created_at',
            [$userId]
        );
        $sessions = Db::all(
            'SELECT id, ip_addr, user_agent, created_at, expires_at FROM sessions WHERE user_id=? ORDER BY created_at',
            [$userId]
        );
        return self::buildExport($user, $divers, $sites, $dives, $sessions, date('c'));
    }

    /**
     * Supprime le compte et TOUTES ses données, dans une transaction.
     * Les suppressions sont explicites (ne dépendent pas des FK CASCADE,
     * ajoutées par la migration 004 mais absentes des vieilles instances).
     *
     * @return array<string,int> nombre de lignes supprimées par table
     */
    public static function deleteUserData(int $userId): array
    {
        return Db::transaction(static function (PDO $pdo) use ($userId): array {
            $run = static function (string $sql) use ($pdo, $userId): int {
                $st = $pdo->prepare($sql);
                $st->execute([$userId]);
                return $st->rowCount();
            };
            return [
                'dive_runtime_state' => $run('DELETE FROM dive_runtime_state WHERE dive_id IN (SELECT id FROM dives WHERE user_id=?)'),
                'dives'              => $run('DELETE FROM dives WHERE user_id=?'),
                'divers'             => $run('DELETE FROM divers WHERE user_id=?'),
                'sites'              => $run('DELETE FROM sites WHERE user_id=?'),
                'sessions'           => $run('DELETE FROM sessions WHERE user_id=?'),
                'users'              => $run('DELETE FROM users WHERE id=?'),
            ];
        });
    }

    public static function otherAdminCount(int $userId): int
    {
        $row = Db::row("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND id<>?", [$userId]);
        return (int)($row['n'] ?? 0);
    }
}
