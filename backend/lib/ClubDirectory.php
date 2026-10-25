<?php
declare(strict_types=1);

/**
 * Annuaire des clubs : liste des clubs existants (pour demander à les
 * rejoindre) et création d'un nouveau club.
 *
 * Unicité (migration 014) : un club actif ne partage ni son nom (comparé
 * sans casse ni accents par la collation), ni son numéro de club, ni son
 * SIRET / N° TAHITI avec un autre club actif. identityConflict() donne le
 * motif lisible ; les index UNIQUE tranchent les créations simultanées
 * (Club::identityConflictFromException).
 *
 * Les clubs personnels jamais nommés (créés à la première connexion) ne
 * figurent pas dans l'annuaire.
 */
class ClubDirectory
{
    public const MAX_RESULTS = 500;
    public const MAX_QUERY_LENGTH = 100;

    // ── Fonctions pures ────────────────────────────────────────────────────

    /** Motif LIKE « contient » ($q échappé : %, _ et \ sont littéraux). */
    public static function likePattern(string $q): string
    {
        return '%' . addcslashes($q, '%_\\') . '%';
    }

    /** Ligne SQL de l'annuaire → représentation publique. */
    public static function publicEntry(array $r): array
    {
        return [
            'club_id'            => (string)$r['club_id'],
            'nom'                => (string)$r['nom'],
            'numero_ffessm'      => (string)($r['numero_ffessm'] ?? ''),
            'structure_type'     => $r['structure_type'] ?? null,
            'jurisdiction'       => Jurisdiction::normalize($r['jurisdiction'] ?? null) ?? Jurisdiction::DEFAULT,
            'members_count'      => (int)($r['members_count'] ?? 0),
            'is_member'          => (bool)(int)($r['is_member'] ?? 0),
            'pending_request_id' => isset($r['pending_request_id']) ? (string)$r['pending_request_id'] : null,
        ];
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    /**
     * Clubs nommés et actifs, par nom ; $q filtre sur le nom (sans casse ni
     * accents) ou le numéro de club.
     *
     * @return list<array>
     */
    public static function search(int $userId, string $q = ''): array
    {
        $q      = Club::normalizeName(mb_substr($q, 0, self::MAX_QUERY_LENGTH));
        $where  = "c.deleted_at IS NULL AND c.nom <> ''";
        $params = [$userId, $userId];
        if ($q !== '') {
            // Numéro cherché seulement s'il reste un caractère une fois normalisé
            // (« - » donnerait LIKE '%%' : tous les clubs).
            $numero   = Club::normalizeIdentifier($q);
            $where   .= $numero !== '' ? ' AND (c.nom LIKE ? OR c.numero_ffessm LIKE ?)' : ' AND c.nom LIKE ?';
            $params[] = self::likePattern($q);
            if ($numero !== '') $params[] = self::likePattern($numero);
        }
        $rows = Db::all(
            "SELECT c.id AS club_id, c.nom, c.numero_ffessm, c.structure_type, c.jurisdiction,
                    (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS members_count,
                    EXISTS(SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.user_id = ?) AS is_member,
                    (SELECT r.id FROM club_join_requests r
                      WHERE r.club_id = c.id AND r.user_id = ? AND r.status = 'pending' LIMIT 1) AS pending_request_id
               FROM clubs c
              WHERE {$where}
              ORDER BY c.nom
              LIMIT " . self::MAX_RESULTS,
            $params
        );
        return array_map([self::class, 'publicEntry'], $rows);
    }

    /**
     * Premier champ d'identité (nom, numéro, SIRET) déjà porté par un autre
     * club actif, ou null. Les valeurs vides ne sont pas contrôlées.
     *
     * @param array<string,string|null> $fields champs normalisés (sanitizeClubFields)
     * @return array{code:string, message:string}|null
     */
    public static function identityConflict(array $fields, ?string $exceptClubId = null): ?array
    {
        foreach (Club::IDENTITY_FIELDS as $col => $refusal) {
            $value = (string)($fields[$col] ?? '');
            if ($value === '') continue;
            $sql    = "SELECT id FROM clubs WHERE deleted_at IS NULL AND {$col} = ?";
            $params = [$value];
            if ($exceptClubId !== null) {
                $sql     .= ' AND id <> ?';
                $params[] = $exceptClubId;
            }
            if (Db::row($sql . ' LIMIT 1', $params)) return $refusal;
        }
        return null;
    }

    /**
     * Met à jour les informations du club en refusant (409) un nom, un numéro
     * de club ou un SIRET déjà porté par un autre club actif. Seuls les champs
     * réellement modifiés sont contrôlés : un club garde ses valeurs actuelles.
     */
    public static function updateOrAbort(string $clubId, array $fields): void
    {
        $changed = Club::changedFields(Club::find($clubId) ?? [], $fields);
        // Un nom modifié garde la longueur minimale (vidé, le club sortirait de
        // l'annuaire) ; un nom inchangé, même vide (club personnel), passe.
        if (array_key_exists('nom', $changed) && mb_strlen((string)$changed['nom']) < Club::MIN_NAME_LENGTH) {
            Json::abort(422, 'Nom du club obligatoire (' . Club::MIN_NAME_LENGTH . ' caractères au moins)');
        }
        $conflict = self::identityConflict($changed, $clubId);
        if ($conflict) Json::abort(409, $conflict['message'], $conflict['code']);
        try {
            Club::update($clubId, $fields);
        } catch (PDOException $e) {
            $conflict = Club::identityConflictFromException($e);
            if (!$conflict) throw $e;
            Json::abort(409, $conflict['message'], $conflict['code']);
        }
    }

    /**
     * Crée un club (champs validés par Club::sanitizeNewClub) : le créateur
     * en devient responsable et c'est son nouveau club courant. Une violation
     * d'unicité simultanée remonte en PDOException (code 23000).
     */
    public static function create(int $userId, array $fields): string
    {
        $id   = Db::uuid();
        $cols = array_values(array_filter(
            array_keys($fields),
            static fn(string $c): bool => array_key_exists($c, Club::EDITABLE_FIELDS)
        ));
        Db::transaction(static function (PDO $pdo) use ($id, $userId, $fields, $cols): void {
            $pdo->prepare(
                'INSERT INTO clubs (id' . implode('', array_map(static fn(string $c): string => ", {$c}", $cols)) . ')
                 VALUES (?' . str_repeat(',?', count($cols)) . ')'
            )->execute(array_merge([$id], array_map(static fn(string $c) => $fields[$c], $cols)));
            $pdo->prepare("INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,'responsable')")
                ->execute([$id, $userId]);
            $pdo->prepare('UPDATE users SET current_club_id=? WHERE id=?')->execute([$id, $userId]);
        });
        return $id;
    }
}
