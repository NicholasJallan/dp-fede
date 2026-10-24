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
    public const EXPORT_FORMAT       = 'dp-assistant-export/2';

    // ── Fonctions pures ────────────────────────────────────────────────────

    /**
     * Vérifie qu'une demande de suppression de compte est recevable.
     *
     * @param array $user             utilisateur courant (ligne users)
     * @param array $body             corps JSON de la requête
     * @param int   $otherAdminCount  nombre d'AUTRES comptes role='admin'
     * @param list<array{club_id:string,nom:string}> $clubBlockers clubs partagés dont
     *        l'utilisateur est le seul responsable (cf. clubBlockers)
     * @return array{0:int,1:string,2?:string}|null [code HTTP, message, code stable] ou null si OK
     */
    public static function deletionError(array $user, array $body, int $otherAdminCount, array $clubBlockers = []): ?array
    {
        if (($body['confirm'] ?? null) !== self::DELETE_CONFIRMATION) {
            return [422, 'Confirmation requise : envoyer { "confirm": "' . self::DELETE_CONFIRMATION . '" }'];
        }
        $isAdmin = ($user['role'] ?? '') === 'admin' || Auth::isSuperAdmin($user);
        if ($isAdmin && $otherAdminCount < 1) {
            return [409, 'Vous êtes le seul administrateur : promouvez un autre administrateur avant de supprimer votre compte', 'LAST_ADMIN'];
        }
        if ($clubBlockers) {
            return [409, self::clubBlockerMessage($clubBlockers), 'LAST_RESPONSABLE'];
        }
        return null;
    }

    /** @param list<array{club_id:string,nom:string}> $clubBlockers */
    public static function clubBlockerMessage(array $clubBlockers): string
    {
        $names = implode(', ', array_map(
            static fn(array $c): string => '« ' . ($c['nom'] !== '' ? $c['nom'] : 'club sans nom') . ' »',
            $clubBlockers
        ));
        return "Vous êtes le seul responsable du club {$names}, qui compte d'autres membres : "
            . 'confiez le rôle de responsable à un autre membre ou supprimez le club avant de supprimer votre compte';
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
        string $generatedAt,
        array $clubs = [],
        array $invitations = []
    ): array {
        unset($user['google_sub']);
        return [
            'format'       => self::EXPORT_FORMAT,
            'generated_at' => $generatedAt,
            'account'      => $user,
            'clubs'        => $clubs,
            'invitations'  => array_map([self::class, 'exportInvitation'], $invitations),
            'divers'       => array_map([self::class, 'exportDiver'], $divers),
            'sites'        => array_map([self::class, 'exportSite'], $sites),
            'dives'        => array_map([self::class, 'exportDive'], $dives),
            'sessions'     => array_map([self::class, 'exportSession'], $sessions),
        ];
    }

    /** Invitation envoyée par l'utilisateur, sans le hash du jeton. */
    public static function exportInvitation(array $i): array
    {
        unset($i['token_hash']);
        return $i;
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

    /**
     * Données personnelles du compte : profil, adhésions aux clubs (avec les
     * informations du club), invitations envoyées, et les fiches dont il est
     * l'AUTEUR (plongeurs, sites, plongées + métadonnées des PDF archivés).
     * Les données d'un club saisies par d'autres membres relèvent du club.
     */
    public static function fetchExport(int $userId): array
    {
        $user  = Db::row('SELECT * FROM users WHERE id=?', [$userId]) ?? [];
        $clubs = Db::all(
            'SELECT m.role, m.created_at AS joined_at, c.id AS club_id, c.nom, c.numero_ffessm, c.siret,
                    c.structure_type, c.president_prenom, c.president_nom, c.president_tel, c.urgence_defaut
               FROM club_members m JOIN clubs c ON c.id = m.club_id
              WHERE m.user_id=? ORDER BY m.created_at',
            [$userId]
        );
        $invitations = Db::all('SELECT * FROM club_invitations WHERE invited_by=? ORDER BY created_at', [$userId]);
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
        $docs = Db::all(
            'SELECT dd.dive_id, dd.type, dd.sha256, dd.bytes, dd.created_at
               FROM dive_documents dd JOIN dives d ON d.id = dd.dive_id
              WHERE d.user_id=?',
            [$userId]
        );
        $docsByDive = [];
        foreach ($docs as $doc) $docsByDive[$doc['dive_id']][] = $doc;
        $dives = array_map(static function (array $dv) use ($docsByDive): array {
            $dv['documents'] = $docsByDive[$dv['id']] ?? [];
            return $dv;
        }, $dives);
        $sessions = Db::all(
            'SELECT id, ip_addr, user_agent, created_at, expires_at FROM sessions WHERE user_id=? ORDER BY created_at',
            [$userId]
        );
        return self::buildExport($user, $divers, $sites, $dives, $sessions, date('c'), $clubs, $invitations);
    }

    /**
     * Clubs partagés (au moins un autre membre) dont l'utilisateur est le
     * SEUL responsable : la suppression du compte y est bloquée.
     *
     * @return list<array{club_id:string,nom:string}>
     */
    public static function clubBlockers(int $userId): array
    {
        return Db::all(
            "SELECT c.id AS club_id, c.nom
               FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL
              WHERE m.user_id=? AND m.role='responsable'
                AND EXISTS (SELECT 1 FROM club_members o WHERE o.club_id = c.id AND o.user_id <> m.user_id)
                AND NOT EXISTS (SELECT 1 FROM club_members r
                                 WHERE r.club_id = c.id AND r.user_id <> m.user_id AND r.role='responsable')",
            [$userId]
        );
    }

    /** @return string[] clubs dont l'utilisateur est l'unique membre */
    public static function soloClubIds(int $userId): array
    {
        return array_column(Db::all(
            'SELECT m.club_id FROM club_members m
              WHERE m.user_id=?
                AND NOT EXISTS (SELECT 1 FROM club_members o WHERE o.club_id = m.club_id AND o.user_id <> m.user_id)',
            [$userId]
        ), 'club_id');
    }

    /**
     * Supprime le compte, dans une transaction :
     *   - les clubs dont il est l'UNIQUE membre sont supprimés avec
     *     conservation légale (ClubRetention) : les fiches archivées de moins
     *     d'un an et les données qu'elles référencent sont conservées dans un
     *     club soft-deleted, tout le reste est supprimé ;
     *   - ses adhésions, ses invitations en attente (annulées) et ses sessions ;
     *   - ses contributions aux clubs partagés RESTENT au club : l'auteur
     *     (user_id) est remis à NULL.
     * L'appelant vérifie au préalable clubBlockers() (seul responsable d'un
     * club partagé). Suppressions explicites : ne dépendent pas des FK.
     *
     * @return array{counts: array<string,int>, retained: array{fiches:int, until:?string, clubs:int}}
     */
    public static function deleteUserData(int $userId): array
    {
        $now   = new DateTimeImmutable('now');
        $plans = [];
        $paths = [];
        foreach (self::soloClubIds($userId) as $clubId) {
            $plan = ClubRetention::planForClub((string)$clubId, $now);
            $plans[(string)$clubId] = $plan;
            $paths = array_merge($paths, ClubRetention::pathsToDelete((string)$clubId, $plan));
        }

        $counts = Db::transaction(static function (PDO $pdo) use ($userId, $plans): array {
            $out = ['clubs_deleted' => 0];
            foreach ($plans as $clubId => $plan) {
                foreach (ClubRetention::retireClubRows($pdo, (string)$clubId, $plan) as $table => $n) {
                    $out[$table] = ($out[$table] ?? 0) + $n;
                }
                $out['clubs_deleted']++;
            }
            $run = static function (string $sql) use ($pdo, $userId): int {
                $st = $pdo->prepare($sql);
                $st->execute([$userId]);
                return $st->rowCount();
            };
            // « updated_at = updated_at » : l'anonymisation ne doit pas faire
            // re-télécharger ces lignes par tous les clients du club.
            $out['divers_anonymized']   = $run('UPDATE divers SET user_id=NULL, updated_at=updated_at WHERE user_id=?');
            $out['sites_anonymized']    = $run('UPDATE sites SET user_id=NULL, updated_at=updated_at WHERE user_id=?');
            $out['dives_anonymized']    = $run('UPDATE dives SET user_id=NULL, updated_at=updated_at WHERE user_id=?');
            $out['invitations_revoked'] = $run('UPDATE club_invitations SET revoked_at=NOW() WHERE invited_by=? AND accepted_at IS NULL AND revoked_at IS NULL');
            $out['club_members']        = ($out['club_members'] ?? 0) + $run('DELETE FROM club_members WHERE user_id=?');
            $out['sessions']            = $run('DELETE FROM sessions WHERE user_id=?');
            $out['users']               = $run('DELETE FROM users WHERE id=?');
            return $out;
        });

        $counts['files'] = DiveArchive::unlinkDocuments($paths);
        foreach ($plans as $clubId => $plan) {
            if ($plan['count'] === 0) DiveArchive::removeClubDirectory((string)$clubId);
        }
        return ['counts' => $counts, 'retained' => ClubRetention::merge(array_values($plans))];
    }

    public static function otherAdminCount(int $userId): int
    {
        $row = Db::row("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND id<>?", [$userId]);
        return (int)($row['n'] ?? 0);
    }
}
