<?php
declare(strict_types=1);

/**
 * Archivage serveur d'une plongée (A322-72 : conservation 1 an par
 * l'établissement).
 *
 * Au passage en status 'archived' :
 *   1. dive_participants est rempli immédiatement (dans la requête) ;
 *   2. documents_status passe à 'pending' ; la fiche et la check-list PDF
 *      sont générées APRÈS l'envoi de la réponse (fastcgi_finish_request),
 *      pour ne pas ralentir l'archivage sur le Raspberry Pi ;
 *   3. succès → fichiers hors web root + dive_documents (SHA-256),
 *      documents_status 'ok' ; échec → journalisé (Log + error_log),
 *      documents_status 'error', relançable (POST /api/dives/:id/documents,
 *      bin/documents.php).
 *
 * Les écritures de documents_status préservent dives.updated_at (curseur de
 * synchronisation), comme dive_runtime_state.
 */
class DiveArchive
{
    public const DEFAULT_ROOT = '/var/lib/dp-fede/documents';

    private const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    // ── Participants (pur) ─────────────────────────────────────────────────

    /**
     * Lignes dive_participants d'une plongée (sans dive_id / club_id).
     *
     * @return list<array{diver_id:?string, palanquee:?int, pal_type:?string, role:string, aptitude:?string,
     *                    prof_max_prevue:?float, prof_max_realisee:?float, duree_realisee:?int}>
     */
    public static function buildParticipants(array $palanquees, array $renderState, array $answers): array
    {
        $realises = is_array($renderState['realises'] ?? null) ? $renderState['realises'] : [];
        $debuts   = is_array($renderState['heuresDebut'] ?? null) ? $renderState['heuresDebut'] : [];
        $fins     = is_array($renderState['heuresFin'] ?? null) ? $renderState['heuresFin'] : [];
        $out      = [];

        $dpId = $answers['dp_id'] ?? null;
        if (is_string($dpId) && $dpId !== '') {
            $out[] = [
                'diver_id' => $dpId, 'palanquee' => null, 'pal_type' => null, 'role' => 'dp',
                'aptitude' => is_scalar($answers['dp_qual'] ?? null) ? (string)$answers['dp_qual'] : null,
                'prof_max_prevue' => null, 'prof_max_realisee' => null, 'duree_realisee' => null,
            ];
        }

        foreach (array_values($palanquees) as $i => $p) {
            if (!is_array($p)) continue;
            $membres = array_values(array_filter((array)($p['membres'] ?? []), 'is_array'));
            if (!$membres) continue;
            $palId   = is_scalar($p['id'] ?? null) ? (string)$p['id'] : '';
            $real    = is_array($realises[$palId] ?? null) ? $realises[$palId] : [];
            $duree   = self::toMinutes($real['duree'] ?? null)
                ?? self::durationBetween($debuts[$palId] ?? null, $fins[$palId] ?? null);
            $palType = Rules::getPalType($membres, is_string($p['mode'] ?? null) ? $p['mode'] : null);

            foreach ($membres as $m) {
                $isBapteme = !empty($m['_bapteme']);
                $aptitude  = is_scalar($m['aptitude'] ?? null) ? (string)$m['aptitude'] : null;
                $out[] = [
                    'diver_id'          => (!$isBapteme && is_string($m['diverId'] ?? null) && $m['diverId'] !== '') ? $m['diverId'] : null,
                    'palanquee'         => $i + 1,
                    'pal_type'          => $palType,
                    'role'              => self::roleFor($aptitude, $isBapteme),
                    'aptitude'          => $aptitude !== null ? mb_substr($aptitude, 0, 20) : null,
                    'prof_max_prevue'   => self::toDepth($p['profMax'] ?? null),
                    'prof_max_realisee' => self::toDepth($real['profMax'] ?? null),
                    'duree_realisee'    => $duree,
                ];
            }
        }
        return $out;
    }

    public static function roleFor(?string $aptitude, bool $isBapteme): string
    {
        if ($isBapteme || $aptitude === 'Baptême') return 'bapteme';
        if (in_array($aptitude, ['E1', 'E2', 'E3', 'E4'], true)) return 'encadrant';
        if ($aptitude === 'GP') return 'guide';
        return 'plongeur';
    }

    /** Minutes entre deux heures « HH:MM » (passage de minuit toléré). */
    public static function durationBetween($start, $end): ?int
    {
        $a = self::clockMinutes($start);
        $b = self::clockMinutes($end);
        if ($a === null || $b === null) return null;
        $d = $b - $a;
        if ($d < 0) $d += 1440;
        return $d > 0 && $d <= 600 ? $d : null;
    }

    private static function clockMinutes($v): ?int
    {
        if (!is_string($v) || !preg_match('/(\d{1,2}):(\d{2})/', $v, $m)) return null;
        $h = (int)$m[1];
        $i = (int)$m[2];
        return ($h < 24 && $i < 60) ? $h * 60 + $i : null;
    }

    private static function toMinutes($v): ?int
    {
        if (!is_numeric($v)) return null;
        $n = (int)round((float)$v);
        return $n > 0 && $n <= 600 ? $n : null;
    }

    private static function toDepth($v): ?float
    {
        if (!is_numeric($v)) return null;
        $f = round((float)$v, 1);
        return $f > 0 && $f < 1000 ? $f : null;
    }

    // ── Stockage (chemins) ─────────────────────────────────────────────────

    public static function storageRoot(): string
    {
        try {
            $cfg = Config::get('documents');
        } catch (\RuntimeException $e) {
            $cfg = null; // configuration absente (tests) : valeur par défaut
        }
        return self::rootFromConfig(is_array($cfg) ? $cfg : null);
    }

    /** Racine de stockage depuis la section 'documents' de la config (pure). */
    public static function rootFromConfig(?array $cfg): string
    {
        $path = $cfg !== null && !empty($cfg['path']) && is_string($cfg['path']) ? $cfg['path'] : self::DEFAULT_ROOT;
        return rtrim($path, '/');
    }

    /**
     * Chemin RELATIF d'un document : {club_id}/{AAAA}/{dive_id}-{type}.pdf.
     * Les identifiants sont des UUID générés par le serveur ; on les revérifie.
     */
    public static function relativePath(string $clubId, string $diveId, string $type, ?string $date): string
    {
        if (!preg_match(self::UUID_RE, $clubId) || !preg_match(self::UUID_RE, $diveId)
            || !in_array($type, DivePdf::TYPES, true)) {
            throw new InvalidArgumentException('Identifiant de document invalide');
        }
        $year = ($date !== null && preg_match('/^(\d{4})/', $date, $m)) ? $m[1] : date('Y');
        return strtolower($clubId) . '/' . $year . '/' . strtolower($diveId) . '-' . $type . '.pdf';
    }

    /** Chemin absolu sûr (refuse toute sortie de la racine). */
    public static function absolutePath(string $relative): string
    {
        if (!preg_match('#^[0-9a-f-]{36}/\d{4}/[0-9a-f-]{36}-(fiche|checklist)\.pdf$#i', $relative)) {
            throw new InvalidArgumentException('Chemin de document invalide');
        }
        return self::storageRoot() . '/' . $relative;
    }

    // ── Archivage ──────────────────────────────────────────────────────────

    /**
     * À appeler dans la requête qui fait passer la plongée en 'archived'.
     * Remplit les participants puis programme la génération des PDF après
     * l'envoi de la réponse.
     */
    public static function onArchived(string $diveId): void
    {
        try {
            self::refreshParticipants($diveId);
        } catch (\Throwable $e) {
            self::logFailure($diveId, 'participants', $e);
        }
        self::setStatus($diveId, 'pending');
        register_shutdown_function(static function () use ($diveId): void {
            if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
            ignore_user_abort(true);
            // Borné par request_terminate_timeout du pool FPM : si le worker est
            // tué, la plongée reste 'pending' et bin/documents.php --retry
            // (cron horaire, OBLIGATOIRE) la reprend.
            self::generateDocuments($diveId);
        });
    }

    /** Recalcule les lignes dive_participants d'une plongée. */
    public static function refreshParticipants(string $diveId): int
    {
        $dive = Db::row(
            'SELECT d.id, d.club_id, d.date_plongee, d.answers, d.palanquees,
                    COALESCE(r.state, d.render_state) AS render_state
               FROM dives d LEFT JOIN dive_runtime_state r ON r.dive_id = d.id
              WHERE d.id=?',
            [$diveId]
        );
        if (!$dive) return 0;
        $rows = self::buildParticipants(
            (array)Account::decodeJson($dive['palanquees'] ?? null, []),
            (array)Account::decodeJson($dive['render_state'] ?? null, []),
            (array)Account::decodeJson($dive['answers'] ?? null, [])
        );
        return Db::transaction(static function (PDO $pdo) use ($dive, $rows): int {
            $pdo->prepare('DELETE FROM dive_participants WHERE dive_id=?')->execute([$dive['id']]);
            $st = $pdo->prepare(
                'INSERT INTO dive_participants
                   (dive_id, club_id, diver_id, palanquee, pal_type, role, aptitude,
                    prof_max_prevue, prof_max_realisee, duree_realisee, date_plongee)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            );
            foreach ($rows as $r) {
                $st->execute([
                    $dive['id'], $dive['club_id'], $r['diver_id'], $r['palanquee'], $r['pal_type'], $r['role'],
                    $r['aptitude'], $r['prof_max_prevue'], $r['prof_max_realisee'], $r['duree_realisee'],
                    $dive['date_plongee'],
                ]);
            }
            return count($rows);
        });
    }

    /**
     * Génère et stocke fiche + check-list. Ne lève jamais d'exception :
     * l'issue est reflétée dans documents_status et journalisée.
     */
    public static function generateDocuments(string $diveId): bool
    {
        try {
            $dive = Db::row(
                "SELECT d.*, COALESCE(r.state, d.render_state) AS render_state
                   FROM dives d LEFT JOIN dive_runtime_state r ON r.dive_id = d.id
                  WHERE d.id=? AND d.status='archived'",
                [$diveId]
            );
            if (!$dive) throw new RuntimeException('Plongée archivée introuvable');

            $clubId  = (string)$dive['club_id'];
            $profile = DivePdf::clubProfile($clubId);
            foreach (DivePdf::TYPES as $type) {
                $pdf = DivePdf::render($dive, $type, $profile);
                self::store($dive, $type, $pdf);
            }
            self::setStatus($diveId, 'ok');
            Log::action('dive.documents_stored', ['dive_id' => $diveId]);
            return true;
        } catch (\Throwable $e) {
            self::logFailure($diveId, 'documents', $e);
            try {
                self::setStatus($diveId, 'error');
            } catch (\Throwable $e2) {
                error_log('[dp-fede] documents_status non mis à jour pour ' . $diveId . ' : ' . $e2->getMessage());
            }
            return false;
        }
    }

    /** Écrit le fichier (écriture atomique) et enregistre dive_documents. */
    private static function store(array $dive, string $type, string $pdf): void
    {
        $relative = self::relativePath((string)$dive['club_id'], (string)$dive['id'], $type, $dive['date_plongee'] ?? null);
        $absolute = self::absolutePath($relative);
        $dir      = dirname($absolute);
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new RuntimeException("Création du répertoire impossible : {$dir}");
        }
        $tmp = $absolute . '.tmp-' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $pdf, LOCK_EX) !== strlen($pdf)) {
            @unlink($tmp);
            throw new RuntimeException("Écriture impossible : {$tmp}");
        }
        @chmod($tmp, 0640);
        if (!@rename($tmp, $absolute)) {
            @unlink($tmp);
            throw new RuntimeException("Renommage impossible : {$absolute}");
        }
        Db::q(
            'INSERT INTO dive_documents (id, dive_id, club_id, type, path, sha256, bytes)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE path=VALUES(path), sha256=VALUES(sha256),
                                     bytes=VALUES(bytes), created_at=NOW()',
            [Db::uuid(), $dive['id'], $dive['club_id'], $type, $relative, hash('sha256', $pdf), strlen($pdf)]
        );
    }

    /** documents_status sans toucher dives.updated_at (curseur de sync). */
    public static function setStatus(string $diveId, string $status): void
    {
        Db::q(
            'UPDATE dives SET documents_status=?, documents_updated_at=NOW(), updated_at=updated_at WHERE id=?',
            [$status, $diveId]
        );
    }

    private static function logFailure(string $diveId, string $step, \Throwable $e): void
    {
        error_log("[dp-fede] archivage {$step} {$diveId} : " . get_class($e) . ': ' . $e->getMessage());
        Log::action('dive.documents_failed', ['dive_id' => $diveId, 'step' => $step, 'error' => mb_substr($e->getMessage(), 0, 300)]);
    }

    // ── Lecture ────────────────────────────────────────────────────────────

    /** Métadonnées des documents d'une plongée (sans le chemin disque). */
    public static function listForDive(string $diveId): array
    {
        $rows = Db::all(
            'SELECT type, sha256, bytes, created_at FROM dive_documents WHERE dive_id=? ORDER BY type',
            [$diveId]
        );
        return array_map(static function (array $r): array {
            $r['bytes']      = (int)$r['bytes'];
            $r['created_at'] = SyncHelpers::toIso($r['created_at']);
            return $r;
        }, $rows);
    }

    /**
     * Contenu d'un document après vérification d'intégrité (SHA-256).
     *
     * @return array{content: string, row: array}|null null si aucun document
     * @throws RuntimeException fichier absent ou altéré
     */
    public static function read(string $diveId, string $type): ?array
    {
        $row = Db::row('SELECT * FROM dive_documents WHERE dive_id=? AND type=?', [$diveId, $type]);
        if (!$row) return null;
        $abs = self::absolutePath((string)$row['path']);
        $content = is_file($abs) ? @file_get_contents($abs) : false;
        if ($content === false) {
            throw new RuntimeException("Document archivé introuvable sur le disque : {$row['path']}");
        }
        if (!hash_equals((string)$row['sha256'], hash('sha256', $content))) {
            throw new RuntimeException("Empreinte SHA-256 invalide : {$row['path']}");
        }
        return ['content' => $content, 'row' => $row];
    }

    // ── Suppression des fichiers ───────────────────────────────────────────

    /** @return string[] chemins relatifs */
    public static function documentPathsForClub(string $clubId): array
    {
        return array_column(Db::all('SELECT path FROM dive_documents WHERE club_id=?', [$clubId]), 'path');
    }

    /**
     * Chemins des documents des plongées vérifiant $where (fragment SQL
     * interne sur la table dives, jamais d'entrée utilisateur).
     *
     * @return string[]
     */
    public static function documentPathsWhere(string $where, array $params): array
    {
        return array_column(
            Db::all("SELECT path FROM dive_documents WHERE dive_id IN (SELECT id FROM dives WHERE {$where})", $params),
            'path'
        );
    }

    /** Supprime des fichiers (chemins relatifs). Retourne le nombre supprimé. */
    public static function unlinkDocuments(array $paths): int
    {
        $n = 0;
        foreach ($paths as $p) {
            try {
                $abs = self::absolutePath((string)$p);
            } catch (\InvalidArgumentException $e) {
                continue;
            }
            if (is_file($abs) && @unlink($abs)) $n++;
        }
        return $n;
    }

    /** Supprime les répertoires vides d'un club ({racine}/{club_id}/AAAA). */
    public static function removeClubDirectory(string $clubId): void
    {
        if (!preg_match(self::UUID_RE, $clubId)) return;
        $dir = self::storageRoot() . '/' . strtolower($clubId);
        if (!is_dir($dir)) return;
        foreach (glob($dir . '/*', GLOB_ONLYDIR) ?: [] as $sub) @rmdir($sub);
        @rmdir($dir);
    }
}
