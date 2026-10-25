<?php
declare(strict_types=1);

/**
 * Demandes d'adhésion : un utilisateur demande à rejoindre un club de
 * l'annuaire ; un responsable du club l'accepte (en choisissant le rôle) ou
 * la refuse. Une seule demande en attente par (club, utilisateur) — index
 * UNIQUE uq_club_join_pending (migration 014).
 *
 * À l'acceptation, le club rejoint devient le club courant du demandeur
 * s'il n'en a pas, ou si c'est son club personnel jamais nommé. Ce club
 * personnel n'est PAS supprimé : l'acceptation est l'action d'un tiers, et
 * l'appareil du demandeur peut encore avoir des saisies hors ligne en file
 * pour ce club (vide côté serveur) ; supprimé, ces saisies seraient refusées
 * (403 CLUB_NOT_MEMBER) puis retirées de l'outbox.
 */
class ClubJoinRequest
{
    public const MAX_PENDING_PER_USER = 10;
    public const MAX_PENDING_PER_CLUB = 50;
    public const MESSAGE_MAX = 500;
    /** Demandes traitées encore affichées au demandeur. */
    public const RECENT_DAYS = 30;

    // ── Fonctions pures ────────────────────────────────────────────────────

    /**
     * Message facultatif joint à la demande.
     *
     * @return array{0: ?string, 1: ?string} [message normalisé, erreur]
     */
    public static function sanitizeMessage($raw): array
    {
        if ($raw === null) return [null, null];
        if (!is_string($raw)) return [null, 'message : valeur invalide'];
        $v = trim($raw);
        if (mb_strlen($v) > self::MESSAGE_MAX) {
            return [null, 'Le message ne doit pas dépasser ' . self::MESSAGE_MAX . ' caractères'];
        }
        return [$v === '' ? null : $v, null];
    }

    /** Demande vue par le responsable du club (identité du demandeur). */
    public static function publicForClub(array $r): array
    {
        return [
            'id'         => (string)$r['id'],
            'user_id'    => (int)$r['user_id'],
            'nom'        => $r['nom'] ?? null,
            'prenom'     => $r['prenom'] ?? null,
            'email'      => $r['email'] ?? null,
            'avatar_url' => $r['avatar_url'] ?? null,
            'message'    => $r['message'] ?? null,
            'created_at' => SyncHelpers::toIso($r['created_at'] ?? null),
        ];
    }

    /** Demande vue par le demandeur. */
    public static function publicForUser(array $r): array
    {
        return [
            'id'         => (string)$r['id'],
            'club_id'    => (string)$r['club_id'],
            'club_nom'   => (string)($r['club_nom'] ?? ''),
            'status'     => (string)$r['status'],
            'role'       => $r['role'] ?? null,
            'message'    => $r['message'] ?? null,
            'created_at' => SyncHelpers::toIso($r['created_at'] ?? null),
            'decided_at' => SyncHelpers::toIso($r['decided_at'] ?? null),
        ];
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    /** Club ouvert aux demandes (actif et nommé), ou null. */
    public static function joinableClub(string $clubId): ?array
    {
        return Db::row("SELECT id, nom FROM clubs WHERE id=? AND deleted_at IS NULL AND nom <> ''", [$clubId]);
    }

    public static function pendingCountForUser(int $userId): int
    {
        $r = Db::row("SELECT COUNT(*) AS n FROM club_join_requests WHERE user_id=? AND status='pending'", [$userId]);
        return (int)($r['n'] ?? 0);
    }

    public static function pendingCountForClub(string $clubId): int
    {
        $r = Db::row("SELECT COUNT(*) AS n FROM club_join_requests WHERE club_id=? AND status='pending'", [$clubId]);
        return (int)($r['n'] ?? 0);
    }

    /**
     * Enregistre une demande en attente. Retourne null si une demande est
     * déjà en attente pour ce club (index UNIQUE, y compris en concurrence).
     */
    public static function create(string $clubId, int $userId, ?string $message): ?array
    {
        $id = Db::uuid();
        try {
            Db::q(
                'INSERT INTO club_join_requests (id, club_id, user_id, message) VALUES (?,?,?,?)',
                [$id, $clubId, $userId, $message]
            );
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000' && strpos($e->getMessage(), 'uq_club_join_pending') !== false) return null;
            throw $e;
        }
        return Db::row(
            'SELECT r.*, c.nom AS club_nom FROM club_join_requests r JOIN clubs c ON c.id = r.club_id WHERE r.id=?',
            [$id]
        );
    }

    /** Demandes en attente du club, les plus anciennes d'abord. */
    public static function listForClub(string $clubId): array
    {
        $rows = Db::all(
            "SELECT r.id, r.user_id, r.message, r.created_at, u.nom, u.prenom, u.email, u.avatar_url
               FROM club_join_requests r JOIN users u ON u.id = r.user_id
              WHERE r.club_id=? AND r.status='pending'
              ORDER BY r.created_at, r.id",
            [$clubId]
        );
        return array_map([self::class, 'publicForClub'], $rows);
    }

    /** Demandes du demandeur : en attente, et traitées depuis moins de RECENT_DAYS jours. */
    public static function listForUser(int $userId): array
    {
        $rows = Db::all(
            "SELECT r.*, c.nom AS club_nom
               FROM club_join_requests r JOIN clubs c ON c.id = r.club_id AND c.deleted_at IS NULL
              WHERE r.user_id=? AND r.status <> 'cancelled'
                AND (r.status = 'pending' OR r.decided_at >= DATE_SUB(NOW(), INTERVAL " . self::RECENT_DAYS . ' DAY))
              ORDER BY r.created_at DESC',
            [$userId]
        );
        return array_map([self::class, 'publicForUser'], $rows);
    }

    /** Le demandeur retire sa demande en attente. */
    public static function cancel(int $userId, string $requestId): bool
    {
        return Db::q(
            "UPDATE club_join_requests SET status='cancelled', decided_at=NOW()
              WHERE id=? AND user_id=? AND status='pending'",
            [$requestId, $userId]
        )->rowCount() === 1;
    }

    /**
     * Accepte une demande en attente du club : inscrit le demandeur avec le
     * rôle choisi (un membre existant garde le sien). Demande verrouillée le
     * temps de la décision : deux responsables ne la traitent pas deux fois.
     *
     * @return int|null identifiant du demandeur, null si la demande n'est plus en attente
     */
    public static function accept(string $clubId, string $requestId, string $role, int $deciderId): ?int
    {
        $userId = Db::transaction(static function (PDO $pdo) use ($clubId, $requestId, $role, $deciderId): ?int {
            $st = $pdo->prepare(
                "SELECT user_id FROM club_join_requests WHERE id=? AND club_id=? AND status='pending' FOR UPDATE"
            );
            $st->execute([$requestId, $clubId]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row) return null;
            $userId = (int)$row['user_id'];
            $pdo->prepare(
                'INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE role = role'
            )->execute([$clubId, $userId, $role]);
            $pdo->prepare(
                "UPDATE club_join_requests SET status='accepted', role=?, decided_by=?, decided_at=NOW() WHERE id=?"
            )->execute([$role, $deciderId, $requestId]);
            return $userId;
        });
        if ($userId === null) return null;
        Db::q(
            "UPDATE users SET current_club_id=?
              WHERE id=? AND (current_club_id IS NULL
                    OR current_club_id IN (SELECT id FROM clubs WHERE auto_created_for=? AND nom=''))",
            [$clubId, $userId, $userId]
        );
        return $userId;
    }

    /** Refuse une demande en attente du club. */
    public static function refuse(string $clubId, string $requestId, int $deciderId): bool
    {
        return Db::q(
            "UPDATE club_join_requests SET status='refused', decided_by=?, decided_at=NOW()
              WHERE id=? AND club_id=? AND status='pending'",
            [$deciderId, $requestId, $clubId]
        )->rowCount() === 1;
    }
}
