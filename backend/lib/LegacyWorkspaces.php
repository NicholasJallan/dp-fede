<?php
declare(strict_types=1);

/**
 * Structures partagées de la production (migration 002_workspaces) → clubs.
 *
 * La reprise elle-même est faite en SQL par la migration 007_clubs.sql ; ce
 * module en est la spécification exécutable :
 *   - règles pures (rôle, adhésion conservée, club courant, auteur) testées
 *     et vérifiées contre le SQL (LegacyWorkspacesTest) ;
 *   - plan() calcule, depuis l'état AVANT migration, le résultat attendu
 *     (clubs, membres, club courant, lignes par club et par auteur) ;
 *   - verify() compare ce plan à la base APRÈS migration.
 * bin/workspaces-plan.php enchaîne les deux autour de bin/migrate.php (cf.
 * deploy/deploy-backend.sh) : une reprise qui ne donne pas exactement le
 * résultat prévu bloque la bascule du code.
 *
 * Clés de club du plan : « perso:<user_id> » (club personnel) et
 * « ws:<workspace_id> » (club issu d'une structure).
 */
final class LegacyWorkspaces
{
    /** users.kind du compte technique qui portait les données d'une structure. */
    public const TECHNICAL_KIND = 'workspace';

    /** workspace_members.role → club_members.role */
    public const ROLE_MAP = ['owner' => 'responsable', 'member' => 'dp'];

    /** Compte-structure : jamais connectable, jamais membre ni auteur. */
    public static function isTechnicalAccount(?array $user): bool
    {
        return ($user['kind'] ?? 'person') === self::TECHNICAL_KIND;
    }

    public static function clubRole(string $workspaceRole): string
    {
        return self::ROLE_MAP[$workspaceRole] ?? 'dp';
    }

    /** Structure archivée : ses membres n'y avaient plus accès, seuls les owners restent. */
    public static function keepsMembership(string $workspaceRole, bool $archived): bool
    {
        return !$archived || $workspaceRole === 'owner';
    }

    /**
     * Structure à ouvrir pour un membre : celle active sur sa session la plus
     * récente non expirée, s'il en reste membre ; sinon null (club personnel).
     *
     * @param list<array{expires_at:int, workspace_id:?int}> $sessions
     * @param list<int> $eligibleWorkspaceIds structures actives dont il reste membre
     */
    public static function currentWorkspace(array $sessions, array $eligibleWorkspaceIds, int $now): ?int
    {
        $live = array_values(array_filter($sessions, static fn(array $s): bool => $s['expires_at'] > $now));
        if (!$live) return null;
        $last = max(array_column($live, 'expires_at'));
        foreach ($live as $s) {
            $ws = $s['workspace_id'] ?? null;
            if ($s['expires_at'] === $last && $ws !== null && in_array((int)$ws, $eligibleWorkspaceIds, true)) {
                return (int)$ws;
            }
        }
        return null;
    }

    /**
     * Auteur d'une ligne de structure : created_by s'il désigne un compte
     * personne existant et sans conflit d'unicité, sinon null (inconnu).
     *
     * @param array<int,true> $personIds
     */
    public static function author(?int $createdBy, array $personIds, bool $conflict = false): ?int
    {
        if ($createdBy === null || !isset($personIds[$createdBy]) || $conflict) return null;
        return $createdBy;
    }

    /**
     * Résultat attendu de la reprise.
     *
     * @param array{
     *   now:int,
     *   users: list<array{id:int, kind:string}>,
     *   workspaces: list<array{id:int, name:string, data_user_id:int, created_by:?int, archived:bool}>,
     *   members: list<array{workspace_id:int, user_id:int, role:string}>,
     *   sessions: list<array{user_id:int, expires_at:int, workspace_id:?int}>,
     *   rows: array<string, list<array{user_id:?int, created_by:?int, client_uuid?:?string}>>
     * } $s
     * @return array{
     *   clubs: array<string, array{members: array<int,string>}>,
     *   current: array<int,string>,
     *   rows: array<string, array<string,int>>,
     *   warnings: list<string>
     * }
     */
    public static function plan(array $s): array
    {
        $persons = [];
        $technical = [];
        foreach ($s['users'] as $u) {
            if (self::isTechnicalAccount($u)) $technical[(int)$u['id']] = true;
            else $persons[(int)$u['id']] = true;
        }

        $clubs = [];
        foreach (array_keys($persons) as $id) $clubs["perso:{$id}"] = ['members' => [$id => 'responsable']];

        $wsByDataUser = [];
        $eligible = [];   // user_id → structures actives où il reste membre
        foreach ($s['workspaces'] as $w) {
            $key = 'ws:' . (int)$w['id'];
            $wsByDataUser[(int)$w['data_user_id']] = $key;
            $members = [];
            foreach ($s['members'] as $m) {
                if ((int)$m['workspace_id'] !== (int)$w['id'] || !isset($persons[(int)$m['user_id']])) continue;
                if (!self::keepsMembership($m['role'], (bool)$w['archived'])) continue;
                $members[(int)$m['user_id']] = self::clubRole($m['role']);
                if (!$w['archived']) $eligible[(int)$m['user_id']][] = (int)$w['id'];
            }
            $creator = $w['created_by'] === null ? null : (int)$w['created_by'];
            if (!in_array('responsable', $members, true) && $creator !== null && isset($persons[$creator])) {
                $members[$creator] = 'responsable';
                if (!$w['archived']) $eligible[$creator][] = (int)$w['id'];
            }
            ksort($members);
            $clubs[$key] = ['members' => $members];
        }

        $warnings = [];
        $blocking = [];   // avertissements qui feraient échouer la migration
        foreach ($clubs as $key => $c) {
            if (!in_array('responsable', $c['members'], true)) $warnings[] = "{$key} : aucun responsable (à désigner après migration)";
        }
        foreach (array_keys($technical) as $id) {
            if (!isset($wsByDataUser[$id])) {
                $msg = "compte-structure {$id} sans structure : ses lignes resteraient sans club (la migration échouerait)";
                $warnings[] = $msg;
                $blocking[] = $msg;
            }
        }

        $current = [];
        foreach (array_keys($persons) as $id) {
            $sessions = array_values(array_filter($s['sessions'], static fn(array $x): bool => (int)$x['user_id'] === $id));
            $ws = self::currentWorkspace($sessions, $eligible[$id] ?? [], $s['now']);
            $current[$id] = $ws === null ? "perso:{$id}" : "ws:{$ws}";
        }

        // Plongées de structure de même (auteur, client_uuid) : seule celle de
        // plus petit id garde l'auteur (miroir du LEFT JOIN « sib » de 007).
        $firstSibling = [];
        foreach ($s['rows']['dives'] ?? [] as $i => $r) {
            if ($r['user_id'] === null || !isset($wsByDataUser[(int)$r['user_id']])) continue;
            if ($r['created_by'] === null || ($r['client_uuid'] ?? null) === null) continue;
            $k = (int)$r['created_by'] . '|' . $r['client_uuid'];
            $id = (string)($r['id'] ?? sprintf('%020d', $i));
            if (!isset($firstSibling[$k]) || strcmp($id, $firstSibling[$k]) < 0) $firstSibling[$k] = $id;
        }

        // Plongées personnelles (auteur, client_uuid) : conflit d'unicité possible.
        $personalDives = [];
        foreach ($s['rows']['dives'] ?? [] as $r) {
            if ($r['user_id'] !== null && isset($persons[(int)$r['user_id']]) && ($r['client_uuid'] ?? null) !== null) {
                $personalDives[(int)$r['user_id'] . '|' . $r['client_uuid']] = true;
            }
        }

        $rows = [];
        foreach ($s['rows'] as $table => $list) {
            $rows[$table] = [];
            $orphans = 0;
            foreach ($list as $i => $r) {
                $uid = $r['user_id'] === null ? null : (int)$r['user_id'];
                if ($uid !== null && isset($wsByDataUser[$uid])) {
                    $by = $r['created_by'] === null ? null : (int)$r['created_by'];
                    $siblingKey = $by . '|' . ($r['client_uuid'] ?? '');
                    $conflict = $table === 'dives' && $by !== null && ($r['client_uuid'] ?? null) !== null
                        && (isset($personalDives[$siblingKey])
                            || ($firstSibling[$siblingKey] ?? null) !== (string)($r['id'] ?? sprintf('%020d', $i)));
                    $bucket = $wsByDataUser[$uid] . '|' . (self::author($by, $persons, $conflict) ?? 'null');
                } elseif ($uid !== null && isset($persons[$uid])) {
                    $bucket = "perso:{$uid}|{$uid}";
                } elseif ($uid !== null && isset($technical[$uid])) {
                    continue;   // compte-structure sans structure : déjà signalé
                } else {
                    $orphans++;
                    continue;
                }
                $rows[$table][$bucket] = ($rows[$table][$bucket] ?? 0) + 1;
            }
            ksort($rows[$table]);
            if ($orphans > 0) $warnings[] = "{$table} : {$orphans} ligne(s) sans propriétaire existant, supprimées par la migration 005";
        }

        ksort($clubs);
        ksort($current);
        return ['clubs' => $clubs, 'current' => $current, 'rows' => $rows, 'warnings' => $warnings, 'blocking' => $blocking];
    }

    /**
     * État de la base AVANT reprise (schéma 002 : users.kind, workspaces…).
     * Lecture seule.
     */
    public static function snapshot(PDO $pdo, ?int $now = null): array
    {
        $all = static fn(string $sql): array => $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        $int = static fn($v): ?int => $v === null ? null : (int)$v;
        $rows = [];
        foreach (['divers', 'sites', 'dives'] as $t) {
            $cols = $t === 'dives' ? 'id, user_id, created_by, client_uuid' : 'user_id, created_by';
            $rows[$t] = array_map(static fn(array $r): array => [
                'id' => isset($r['id']) ? (string)$r['id'] : null,
                'user_id' => $int($r['user_id']), 'created_by' => $int($r['created_by']),
                'client_uuid' => $r['client_uuid'] ?? null,
            ], $all("SELECT {$cols} FROM {$t}"));
        }
        return [
            'now'        => $now ?? (int)$pdo->query('SELECT UNIX_TIMESTAMP()')->fetchColumn(),
            'users'      => array_map(static fn(array $r): array => ['id' => (int)$r['id'], 'kind' => (string)$r['kind']], $all('SELECT id, kind FROM users')),
            'workspaces' => array_map(static fn(array $r): array => [
                'id' => (int)$r['id'], 'name' => (string)$r['name'], 'data_user_id' => (int)$r['data_user_id'],
                'created_by' => $int($r['created_by']), 'archived' => $r['archived_at'] !== null,
            ], $all('SELECT id, name, data_user_id, created_by, archived_at FROM workspaces')),
            'members'    => array_map(static fn(array $r): array => [
                'workspace_id' => (int)$r['workspace_id'], 'user_id' => (int)$r['user_id'], 'role' => (string)$r['role'],
            ], $all('SELECT workspace_id, user_id, role FROM workspace_members')),
            'sessions'   => array_map(static fn(array $r): array => [
                'user_id' => (int)$r['user_id'], 'expires_at' => (int)$r['exp'], 'workspace_id' => $int($r['workspace_id']),
            ], $all('SELECT user_id, UNIX_TIMESTAMP(expires_at) AS exp, workspace_id FROM sessions')),
            'rows'       => $rows,
        ];
    }

    /**
     * Écarts entre le plan et la base APRÈS migration (liste vide = conforme).
     *
     * @return list<string>
     */
    public static function verify(array $plan, PDO $pdo): array
    {
        $all = static fn(string $sql): array => $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        $key = "COALESCE(CONCAT('perso:', c.auto_created_for), CONCAT('ws:', c.legacy_workspace_id))";
        $diff = [];

        $members = [];
        foreach ($all("SELECT {$key} AS k, m.user_id, m.role FROM club_members m JOIN clubs c ON c.id = m.club_id") as $r) {
            if ($r['k'] !== null) $members[$r['k']][(int)$r['user_id']] = $r['role'];
        }
        foreach ($plan['clubs'] as $k => $c) {
            $got = $members[$k] ?? null;
            if ($got === null) { $diff[] = "club {$k} absent"; continue; }
            ksort($got);
            if ($got != $c['members']) $diff[] = "club {$k} : membres " . json_encode($got) . ' au lieu de ' . json_encode($c['members']);
        }

        $current = [];
        foreach ($all("SELECT u.id, {$key} AS k FROM users u LEFT JOIN clubs c ON c.id = u.current_club_id WHERE u.kind = 'person'") as $r) {
            $current[(int)$r['id']] = $r['k'];
        }
        foreach ($plan['current'] as $uid => $k) {
            if (($current[$uid] ?? null) !== $k) $diff[] = "utilisateur {$uid} : club courant " . ($current[$uid] ?? 'aucun') . " au lieu de {$k}";
        }

        foreach ($plan['rows'] as $table => $expected) {
            $got = [];
            foreach ($all("SELECT {$key} AS k, x.user_id, COUNT(*) AS n FROM {$table} x JOIN clubs c ON c.id = x.club_id GROUP BY k, x.user_id") as $r) {
                $got[$r['k'] . '|' . ($r['user_id'] ?? 'null')] = (int)$r['n'];
            }
            ksort($got);
            if ($got != $expected) $diff[] = "{$table} : répartition " . json_encode($got) . ' au lieu de ' . json_encode($expected);
        }
        return $diff;
    }
}
