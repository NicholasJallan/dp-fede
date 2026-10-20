<?php
declare(strict_types=1);

/**
 * Invitations à rejoindre un club : lien à usage unique, valable 7 jours.
 *
 * Le jeton (256 bits aléatoires, 64 caractères hexadécimaux) n'est renvoyé
 * qu'une seule fois, à la création ; seul son SHA-256 est stocké. Pas d'envoi
 * d'e-mail : le responsable copie le lien et le transmet lui-même. Le lien
 * porte le jeton dans le fragment (#invitation=…) : il n'est jamais envoyé au
 * serveur par le navigateur ni journalisé par nginx.
 *
 * L'acceptation exige que l'e-mail du compte Google connecté soit celui de
 * l'invitation (insensible à la casse) : un lien qui fuite ne suffit pas.
 */
class ClubInvitation
{
    public const TTL_SECONDS     = 604800; // 7 jours
    public const MAX_PENDING     = 50;     // invitations en attente par club
    private const TOKEN_BYTES    = 32;

    // ── Fonctions pures ────────────────────────────────────────────────────

    public static function newToken(): string
    {
        return bin2hex(random_bytes(self::TOKEN_BYTES));
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function isTokenFormat(string $token): bool
    {
        return (bool)preg_match('/^[0-9a-f]{64}$/', $token);
    }

    public static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    public static function isValidEmail(string $email): bool
    {
        return mb_strlen($email) <= 255 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function expiresAt(DateTimeImmutable $now): string
    {
        return $now->modify('+' . self::TTL_SECONDS . ' seconds')->format('Y-m-d H:i:s');
    }

    /** Lien à transmettre à l'invité (jeton dans le fragment). */
    public static function link(string $domain, string $token): string
    {
        return 'https://' . $domain . '/#invitation=' . $token;
    }

    /** État d'une invitation : pending / accepted / revoked / expired. */
    public static function status(array $inv, DateTimeImmutable $now): string
    {
        if (!empty($inv['accepted_at'])) return 'accepted';
        if (!empty($inv['revoked_at']))  return 'revoked';
        $exp = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)($inv['expires_at'] ?? ''));
        if (!$exp || $exp <= $now) return 'expired';
        return 'pending';
    }

    /**
     * Motif de refus d'une acceptation, ou null si elle est recevable.
     *
     * @return array{0:int,1:string}|null [code HTTP, message]
     */
    public static function acceptError(array $inv, string $userEmail, DateTimeImmutable $now): ?array
    {
        switch (self::status($inv, $now)) {
            case 'accepted': return [410, 'Cette invitation a déjà été utilisée'];
            case 'revoked':  return [410, 'Cette invitation a été annulée'];
            case 'expired':  return [410, 'Cette invitation a expiré : demandez-en une nouvelle au responsable du club'];
        }
        if (self::normalizeEmail((string)($inv['email'] ?? '')) !== self::normalizeEmail($userEmail)) {
            return [403, 'Cette invitation est destinée à une autre adresse e-mail'];
        }
        return null;
    }

    /** Représentation publique (jamais le hash du jeton). */
    public static function publicInvitation(array $inv, DateTimeImmutable $now): array
    {
        return [
            'id'          => $inv['id'],
            'email'       => $inv['email'],
            'role'        => $inv['role'],
            'status'      => self::status($inv, $now),
            'expires_at'  => SyncHelpers::toIso($inv['expires_at'] ?? null),
            'created_at'  => SyncHelpers::toIso($inv['created_at'] ?? null),
            'accepted_at' => SyncHelpers::toIso($inv['accepted_at'] ?? null),
            'invited_by'  => isset($inv['invited_by']) ? (int)$inv['invited_by'] : null,
        ];
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    /**
     * Crée une invitation (remplace une invitation en attente pour le même
     * e-mail). Retourne la ligne + le jeton en clair (seule occurrence).
     *
     * @return array{invitation: array, token: string}
     */
    public static function create(string $clubId, string $email, string $role, int $invitedBy): array
    {
        $now   = new DateTimeImmutable('now');
        $token = self::newToken();
        $id    = Db::uuid();

        Db::transaction(static function (PDO $pdo) use ($clubId, $email, $role, $invitedBy, $now, $token, $id): void {
            $pdo->prepare(
                'UPDATE club_invitations SET revoked_at=NOW()
                  WHERE club_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL'
            )->execute([$clubId, $email]);
            $pdo->prepare(
                'INSERT INTO club_invitations (id, club_id, email, role, token_hash, invited_by, expires_at)
                 VALUES (?,?,?,?,?,?,?)'
            )->execute([$id, $clubId, $email, $role, self::hashToken($token), $invitedBy, self::expiresAt($now)]);
        });

        $row = Db::row('SELECT * FROM club_invitations WHERE id=?', [$id]) ?? [];
        return ['invitation' => $row, 'token' => $token];
    }

    /** Heure de référence PHP (même horloge que expiresAt() et status()). */
    private static function nowSql(): string
    {
        return (new DateTimeImmutable('now'))->format('Y-m-d H:i:s');
    }

    public static function pendingCount(string $clubId): int
    {
        $r = Db::row(
            'SELECT COUNT(*) AS n FROM club_invitations
              WHERE club_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?',
            [$clubId, self::nowSql()]
        );
        return (int)($r['n'] ?? 0);
    }

    public static function listForClub(string $clubId): array
    {
        $now  = new DateTimeImmutable('now');
        $rows = Db::all(
            'SELECT * FROM club_invitations
              WHERE club_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
              ORDER BY created_at DESC',
            [$clubId, $now->format('Y-m-d H:i:s')]
        );
        return array_map(static fn(array $r): array => self::publicInvitation($r, $now), $rows);
    }

    /** Invitation + nom du club, par jeton en clair (null si inconnu). */
    public static function findByToken(string $token): ?array
    {
        if (!self::isTokenFormat($token)) return null;
        return Db::row(
            'SELECT i.*, c.nom AS club_nom FROM club_invitations i
               JOIN clubs c ON c.id = i.club_id AND c.deleted_at IS NULL
              WHERE i.token_hash=?',
            [self::hashToken($token)]
        );
    }

    /**
     * Accepte l'invitation (déjà contrôlée par acceptError) : marque l'usage
     * unique, inscrit le membre (sans rétrograder un membre existant) et en
     * fait le club courant. Retourne false si l'invitation a été consommée
     * entre-temps (course).
     */
    public static function accept(array $inv, int $userId): bool
    {
        $now = self::nowSql();
        return Db::transaction(static function (PDO $pdo) use ($inv, $userId, $now): bool {
            $st = $pdo->prepare(
                'UPDATE club_invitations SET accepted_at=?, accepted_by=?
                  WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?'
            );
            $st->execute([$now, $userId, $inv['id'], $now]);
            if ($st->rowCount() !== 1) return false;

            $pdo->prepare(
                'INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE role = role'
            )->execute([$inv['club_id'], $userId, $inv['role']]);
            $pdo->prepare('UPDATE users SET current_club_id=? WHERE id=?')
                ->execute([$inv['club_id'], $userId]);
            return true;
        });
    }

    public static function revoke(string $clubId, string $invitationId): bool
    {
        return Db::q(
            'UPDATE club_invitations SET revoked_at=NOW()
              WHERE id=? AND club_id=? AND accepted_at IS NULL AND revoked_at IS NULL',
            [$invitationId, $clubId]
        )->rowCount() === 1;
    }
}
