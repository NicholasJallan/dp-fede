<?php
declare(strict_types=1);

/**
 * Socle « club » : club courant d'un utilisateur, rôle, contrôle d'accès.
 *
 * Toutes les données métier (divers, sites, dives) sont rattachées à un club
 * (club_id) ; user_id ne désigne plus que l'auteur. Un utilisateur peut être
 * membre de plusieurs clubs ; le club « courant » est users.current_club_id,
 * surchargeable requête par requête par l'en-tête X-DP-Club (utile à l'outbox
 * hors-ligne : une écriture mise en file pour le club A ne doit pas atterrir
 * dans le club B après un changement de club courant).
 *
 * Les fonctions « can / isRole / profileOverlay / … » sont pures (testées) ;
 * les autres accèdent à MariaDB.
 */
class Club
{
    public const ROLES = ['responsable', 'dp', 'encadrant', 'lecture'];

    public const STRUCTURE_TYPES = ['club', 'sca', 'csa', 'autre'];

    /** Numéro d'urgence affiché quand le club n'en a pas défini. */
    public const DEFAULT_URGENCE = '18';

    private const ALL = ['responsable', 'dp', 'encadrant', 'lecture'];

    /**
     * Matrice des permissions (action → rôles autorisés).
     * Cf. docs/api-club.md pour la description fonctionnelle.
     */
    public const PERMISSIONS = [
        'club.read'          => self::ALL,
        'club.manage'        => ['responsable'],          // infos club, membres, invitations, suppression
        'members.read'       => self::ALL,
        'divers.read'        => self::ALL,
        'divers.write'       => ['responsable', 'dp'],
        'divers.import'      => ['responsable', 'dp'],
        'sites.read'         => self::ALL,
        'sites.write'        => ['responsable', 'dp'],
        'dives.read'         => self::ALL,
        'dives.write'        => ['responsable', 'dp'],
        'documents.read'     => self::ALL,
        'documents.generate' => ['responsable', 'dp'],
        'alerts.read'        => ['responsable', 'dp', 'encadrant'],
        'stats.read'         => self::ALL,
    ];

    /** Champs du club exposés sous leur ancien nom users.club_* (compatibilité /api/auth/me). */
    private const LEGACY_FIELD_MAP = [
        'club_nom'         => 'nom',
        'club_numero'      => 'numero_ffessm',
        'club_siret'       => 'siret',
        'structure_type'   => 'structure_type',
        'president_prenom' => 'president_prenom',
        'president_nom'    => 'president_nom',
        'president_tel'    => 'president_tel',
        'urgence_defaut'   => 'urgence_defaut',
    ];

    /** Champs modifiables du club, avec leur longueur maximale. */
    public const EDITABLE_FIELDS = [
        'nom'              => 200,
        'numero_ffessm'    => 50,
        'siret'            => 50,
        'structure_type'   => 20,
        'president_prenom' => 100,
        'president_nom'    => 100,
        'president_tel'    => 30,
        'urgence_defaut'   => 20,
    ];

    // ── Fonctions pures ────────────────────────────────────────────────────

    public static function isRole(?string $role): bool
    {
        return $role !== null && in_array($role, self::ROLES, true);
    }

    /** Vrai si le rôle autorise l'action (action inconnue → refus). */
    public static function can(?string $role, string $action): bool
    {
        $allowed = self::PERMISSIONS[$action] ?? null;
        return $allowed !== null && $role !== null && in_array($role, $allowed, true);
    }

    /**
     * Superpose les informations du club aux anciens champs users.club_*
     * (le front actuel lit club_nom, president_nom… dans /api/auth/me).
     */
    public static function profileOverlay(array $user, ?array $club, ?string $role, int $clubCount): array
    {
        if ($club !== null) {
            foreach (self::LEGACY_FIELD_MAP as $legacy => $field) {
                $user[$legacy] = $club[$field] ?? null;
            }
            // Même repli que les fiches PDF (DivePdf::clubProfile).
            $user['urgence_defaut'] = ($club['urgence_defaut'] ?? null) ?: self::DEFAULT_URGENCE;
        }
        $user['club_id']    = $club['id'] ?? null;
        $user['club_role']  = $role;
        $user['club_count'] = $clubCount;
        return $user;
    }

    /**
     * Traduit les anciens champs users.club_* d'un corps PATCH /api/auth/account
     * en champs du club (seulement ceux présents dans le corps).
     *
     * @return array<string,string|null>
     */
    public static function fieldsFromLegacyBody(array $body): array
    {
        $out = [];
        foreach (self::LEGACY_FIELD_MAP as $legacy => $field) {
            if (array_key_exists($legacy, $body)) {
                $out[$field] = $body[$legacy] === null ? null : trim((string)$body[$legacy]);
            }
        }
        return $out;
    }

    /**
     * Valide et normalise une mise à jour des informations du club.
     *
     * @return array{0: array<string,string|null>, 1: string[]} [champs, erreurs]
     */
    public static function sanitizeClubFields(array $input): array
    {
        $fields = [];
        $errors = [];
        foreach (self::EDITABLE_FIELDS as $field => $max) {
            if (!array_key_exists($field, $input)) continue;
            $raw = $input[$field];
            if ($raw !== null && !is_scalar($raw)) {
                $errors[] = "{$field} : valeur invalide";
                continue;
            }
            $v = $raw === null ? '' : trim((string)$raw);
            if (mb_strlen($v) > $max) {
                $errors[] = "{$field} ne doit pas dépasser {$max} caractères";
                continue;
            }
            if ($field === 'structure_type') {
                $fields[$field] = in_array($v, self::STRUCTURE_TYPES, true) ? $v : null;
                continue;
            }
            $nullable = !in_array($field, ['nom', 'numero_ffessm', 'siret'], true);
            $fields[$field] = ($v === '' && $nullable) ? null : $v;
        }
        return [$fields, $errors];
    }

    /** Vrai si la mise à jour modifie au moins un champ du club. */
    public static function differs(array $club, array $fields): bool
    {
        return self::changedFields($club, $fields) !== [];
    }

    /**
     * Champs réellement modifiés. Un numéro d'urgence égal à la valeur par
     * défaut ('18') alors que le club n'en a pas n'est pas une modification :
     * le front actuel renvoie le formulaire entier, pré-rempli avec ce repli.
     */
    public static function changedFields(array $club, array $fields): array
    {
        $out = [];
        foreach ($fields as $k => $v) {
            $old = (string)($club[$k] ?? '');
            $new = (string)($v ?? '');
            if ($k === 'urgence_defaut' && $old === '' && $new === self::DEFAULT_URGENCE) continue;
            if ($old !== $new) $out[$k] = $v;
        }
        return $out;
    }

    // ── Contexte de la requête ─────────────────────────────────────────────

    /**
     * Ajoute club_id et club_role à l'utilisateur authentifié.
     * Crée un club personnel si l'utilisateur n'appartient à aucun club.
     */
    public static function withContext(array $user): array
    {
        [$clubId, $role] = self::context($user);
        $user['club_id']   = $clubId;
        $user['club_role'] = $role;
        return $user;
    }

    /** @return array{0:string,1:string} [club_id, rôle] */
    public static function context(array $user): array
    {
        $uid         = (int)$user['id'];
        $memberships = self::membershipRoles($uid);

        $requested = self::requestedClubId();
        if ($requested !== null) {
            if (!isset($memberships[$requested])) {
                Json::abort(403, 'Vous n\'êtes pas membre de ce club', 'CLUB_NOT_MEMBER');
            }
            return [$requested, $memberships[$requested]];
        }

        $current = (string)($user['current_club_id'] ?? '');
        if ($current !== '' && isset($memberships[$current])) {
            return [$current, $memberships[$current]];
        }
        if ($memberships) {
            $first = (string)array_key_first($memberships);
            Db::q('UPDATE users SET current_club_id=? WHERE id=?', [$first, $uid]);
            return [$first, $memberships[$first]];
        }
        return [self::createPersonalClub($user), 'responsable'];
    }

    /** En-tête X-DP-Club (UUID) ou null. Un en-tête mal formé est refusé. */
    private static function requestedClubId(): ?string
    {
        $raw = trim((string)($_SERVER['HTTP_X_DP_CLUB'] ?? ''));
        if ($raw === '') return null;
        if (!SyncHelpers::isValidUuid($raw)) Json::abort(400, 'En-tête X-DP-Club invalide');
        return strtolower($raw);
    }

    /**
     * Abandonne la requête (403) si le rôle n'autorise pas l'action.
     * $user doit provenir de Auth::require() (club_role renseigné).
     */
    public static function requirePermission(array $user, string $action): void
    {
        if (!self::can($user['club_role'] ?? null, $action)) {
            Json::abort(403, 'Action non autorisée pour votre rôle dans le club', 'CLUB_ROLE_FORBIDDEN');
        }
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    /** @return array<string,string> club_id → rôle, du plus ancien au plus récent */
    public static function membershipRoles(int $userId): array
    {
        $rows = Db::all(
            'SELECT m.club_id, m.role FROM club_members m
               JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL
              WHERE m.user_id=? ORDER BY m.created_at, m.club_id',
            [$userId]
        );
        $out = [];
        foreach ($rows as $r) $out[(string)$r['club_id']] = (string)$r['role'];
        return $out;
    }

    /** Clubs de l'utilisateur, avec son rôle et l'indicateur « courant ». */
    public static function memberships(int $userId, ?string $currentClubId): array
    {
        $rows = Db::all(
            'SELECT c.id AS club_id, c.nom, c.numero_ffessm, m.role, m.created_at AS joined_at,
                    (SELECT COUNT(*) FROM club_members m2 WHERE m2.club_id = c.id) AS members_count
               FROM club_members m
               JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL
              WHERE m.user_id=?
              ORDER BY m.created_at, c.id',
            [$userId]
        );
        return array_map(static function (array $r) use ($currentClubId): array {
            $r['members_count'] = (int)$r['members_count'];
            $r['joined_at']     = SyncHelpers::toIso($r['joined_at'] ?? null);
            $r['current']       = $currentClubId !== null && $r['club_id'] === $currentClubId;
            return $r;
        }, $rows);
    }

    public static function find(string $clubId): ?array
    {
        return Db::row('SELECT * FROM clubs WHERE id=? AND deleted_at IS NULL', [$clubId]);
    }

    /** Représentation publique d'un club (sans marqueurs de reprise, dates ISO). */
    public static function publicClub(array $club): array
    {
        unset($club['auto_created_for'], $club['legacy_workspace_id'], $club['deleted_at'], $club['retention_until']);
        foreach (['created_at', 'updated_at'] as $k) {
            if (array_key_exists($k, $club)) $club[$k] = SyncHelpers::toIso($club[$k]);
        }
        return $club;
    }

    /**
     * Crée le club personnel d'un utilisateur sans club (nouveau compte, ou
     * compte retiré de tous ses clubs). Reprend les anciens champs users.club_*.
     * Robuste aux requêtes concurrentes grâce à UNIQUE(auto_created_for).
     */
    public static function createPersonalClub(array $user): string
    {
        $uid = (int)$user['id'];
        $id  = Db::uuid();
        $st  = Db::q(
            'INSERT IGNORE INTO clubs
               (id, nom, numero_ffessm, siret, structure_type,
                president_prenom, president_nom, president_tel, urgence_defaut, auto_created_for)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            self::personalClubParams($id, $user, $uid)
        );

        if ($st->rowCount() === 0) {
            // Requête concurrente qui a déjà inscrit l'utilisateur quelque part.
            $roles = self::membershipRoles($uid);
            if ($roles) return (string)array_key_first($roles);
            // Un club personnel existe déjà pour ce compte.
            $existing = Db::row(
                'SELECT c.id,
                        (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS n
                   FROM clubs c WHERE c.auto_created_for=?',
                [$uid]
            );
            if ($existing && (int)$existing['n'] === 0) {
                // Requête concurrente qui n'a pas encore inscrit le membre.
                $id = (string)$existing['id'];
            } else {
                // Le compte a été retiré de son ancien club personnel (désormais
                // partagé) : nouveau club, sans marqueur.
                $id = Db::uuid();
                Db::q(
                    'INSERT INTO clubs
                       (id, nom, numero_ffessm, siret, structure_type,
                        president_prenom, president_nom, president_tel, urgence_defaut, auto_created_for)
                     VALUES (?,?,?,?,?,?,?,?,?,?)',
                    self::personalClubParams($id, $user, null)
                );
            }
        }

        Db::q(
            "INSERT IGNORE INTO club_members (club_id, user_id, role) VALUES (?,?,'responsable')",
            [$id, $uid]
        );
        Db::q('UPDATE users SET current_club_id=? WHERE id=?', [$id, $uid]);
        Log::action('club.created', ['club_id' => $id, 'personal' => true]);
        return $id;
    }

    private static function personalClubParams(string $id, array $user, ?int $autoFor): array
    {
        return [
            $id,
            (string)($user['club_nom'] ?? ''),
            (string)($user['club_numero'] ?? ''),
            (string)($user['club_siret'] ?? ''),
            $user['structure_type'] ?? null,
            $user['president_prenom'] ?? null,
            $user['president_nom'] ?? null,
            $user['president_tel'] ?? null,
            $user['urgence_defaut'] ?? null,
            $autoFor,
        ];
    }

    /** Met à jour les informations du club (champs déjà validés). */
    public static function update(string $clubId, array $fields): void
    {
        if (!$fields) return;
        $sets   = [];
        $params = [];
        foreach ($fields as $col => $v) {
            if (!array_key_exists($col, self::EDITABLE_FIELDS)) continue; // liste blanche
            $sets[]   = "{$col}=?";
            $params[] = $v;
        }
        if (!$sets) return;
        $params[] = $clubId;
        Db::q('UPDATE clubs SET ' . implode(', ', $sets) . ' WHERE id=?', $params);
    }

    public static function memberRole(string $clubId, int $userId): ?string
    {
        $r = Db::row(
            'SELECT m.role FROM club_members m JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL
              WHERE m.club_id=? AND m.user_id=?',
            [$clubId, $userId]
        );
        return $r ? (string)$r['role'] : null;
    }

    /**
     * Le club garde toujours au moins un responsable (pur, testé).
     * $newRole null = retrait du membre.
     *
     * @param list<array{user_id: int|string, role: string}> $members
     * @return 'not_member'|'last_responsable'|null
     */
    public static function lastResponsableViolation(array $members, int $targetId, ?string $newRole): ?string
    {
        $current = null;
        $responsables = 0;
        foreach ($members as $m) {
            if ($m['role'] === 'responsable') $responsables++;
            if ((int)$m['user_id'] === $targetId) $current = (string)$m['role'];
        }
        if ($current === null) return 'not_member';
        if ($current === 'responsable' && $newRole !== 'responsable' && $responsables <= 1) return 'last_responsable';
        return null;
    }

    /**
     * Change le rôle d'un membre. Les adhésions du club sont verrouillées
     * (SELECT … FOR UPDATE) le temps du contrôle « dernier responsable » et
     * de l'écriture : deux rétrogradations simultanées ne peuvent pas
     * laisser le club sans responsable.
     *
     * @return 'not_member'|'last_responsable'|null null = effectué
     */
    public static function changeMemberRole(string $clubId, int $targetId, string $role): ?string
    {
        return Db::transaction(static function (PDO $pdo) use ($clubId, $targetId, $role): ?string {
            $violation = self::lastResponsableViolation(self::lockMembers($pdo, $clubId), $targetId, $role);
            if ($violation !== null) return $violation;
            $pdo->prepare('UPDATE club_members SET role=? WHERE club_id=? AND user_id=?')->execute([$role, $clubId, $targetId]);
            return null;
        });
    }

    /**
     * Retire un membre (ou le membre lui-même quitte le club), même
     * verrouillage que changeMemberRole.
     *
     * @return 'not_member'|'last_responsable'|null null = effectué
     */
    public static function removeMember(string $clubId, int $targetId): ?string
    {
        return Db::transaction(static function (PDO $pdo) use ($clubId, $targetId): ?string {
            $violation = self::lastResponsableViolation(self::lockMembers($pdo, $clubId), $targetId, null);
            if ($violation !== null) return $violation;
            $pdo->prepare('DELETE FROM club_members WHERE club_id=? AND user_id=?')->execute([$clubId, $targetId]);
            $pdo->prepare('UPDATE users SET current_club_id=NULL WHERE id=? AND current_club_id=?')->execute([$targetId, $clubId]);
            return null;
        });
    }

    /** Adhésions du club, verrouillées jusqu'à la fin de la transaction. */
    private static function lockMembers(PDO $pdo, string $clubId): array
    {
        $st = $pdo->prepare('SELECT user_id, role FROM club_members WHERE club_id=? FOR UPDATE');
        $st->execute([$clubId]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Vrai si le club n'a aucune donnée (même supprimée logiquement). */
    public static function isEmpty(string $clubId): bool
    {
        foreach (['divers', 'sites', 'dives'] as $table) {
            if (Db::row("SELECT 1 FROM {$table} WHERE club_id=? LIMIT 1", [$clubId])) return false;
        }
        return true;
    }

    /**
     * Supprime les lignes d'un club SANS gérer la transaction (à appeler dans
     * Db::transaction) ; les fichiers PDF sont supprimés par l'appelant après
     * validation (cf. deleteClub, Account::deleteUserData).
     *
     * @return array<string,int>
     */
    public static function deleteClubRows(PDO $pdo, string $clubId): array
    {
        $run = static function (string $sql) use ($pdo, $clubId): int {
            $st = $pdo->prepare($sql);
            $st->execute([$clubId]);
            return $st->rowCount();
        };
        return [
            'dive_participants'  => $run('DELETE FROM dive_participants WHERE club_id=?'),
            'dive_documents'     => $run('DELETE FROM dive_documents WHERE club_id=?'),
            'dive_runtime_state' => $run('DELETE FROM dive_runtime_state WHERE dive_id IN (SELECT id FROM dives WHERE club_id=?)'),
            'dives'              => $run('DELETE FROM dives WHERE club_id=?'),
            'divers'             => $run('DELETE FROM divers WHERE club_id=?'),
            'sites'              => $run('DELETE FROM sites WHERE club_id=?'),
            'club_invitations'   => $run('DELETE FROM club_invitations WHERE club_id=?'),
            'users_current'      => $run('UPDATE users SET current_club_id=NULL WHERE current_club_id=?'),
            'club_members'       => $run('DELETE FROM club_members WHERE club_id=?'),
            'clubs'              => $run('DELETE FROM clubs WHERE id=?'),
        ];
    }

    /**
     * Supprime DÉFINITIVEMENT un club, toutes ses données et ses PDF archivés,
     * sans conservation légale : réservé à la purge des clubs dont la
     * conservation est échue et aux clubs vides. Suppression demandée par un
     * utilisateur → ClubRetention::retire.
     *
     * @return array<string,int>
     */
    public static function deleteClub(string $clubId): array
    {
        $paths  = DiveArchive::documentPathsForClub($clubId);
        $counts = Db::transaction(static fn(PDO $pdo): array => self::deleteClubRows($pdo, $clubId));
        $counts['files'] = DiveArchive::unlinkDocuments($paths);
        DiveArchive::removeClubDirectory($clubId);
        return $counts;
    }

    /**
     * Supprime les clubs personnels VIDES de l'utilisateur dont il est le seul
     * membre (appelé après l'acceptation d'une invitation : le club créé
     * automatiquement à la première connexion n'a plus d'objet).
     *
     * @return string[] identifiants des clubs supprimés
     */
    public static function removeEmptyPersonalClubs(int $userId, string $keepClubId): array
    {
        $rows = Db::all(
            'SELECT c.id FROM clubs c
               JOIN club_members m ON m.club_id = c.id AND m.user_id = ?
              WHERE c.auto_created_for = ? AND c.id <> ?
                AND (SELECT COUNT(*) FROM club_members m2 WHERE m2.club_id = c.id) = 1',
            [$userId, $userId, $keepClubId]
        );
        $removed = [];
        foreach ($rows as $r) {
            $id = (string)$r['id'];
            if (!self::isEmpty($id)) continue;
            self::deleteClub($id);
            $removed[] = $id;
        }
        return $removed;
    }
}
