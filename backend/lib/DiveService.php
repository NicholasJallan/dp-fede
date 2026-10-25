<?php
declare(strict_types=1);

/**
 * Écritures des plongées (POST / PATCH /api/dives) : cycle de vie
 * prepared → in_progress → archived, fiche figée à l'archivage (A322-72).
 *
 * Chaque écriture se fait dans une transaction ; le PATCH verrouille la ligne
 * (SELECT … FOR UPDATE) : un archivage concurrent ne peut plus être suivi
 * d'une réécriture d'answers / palanquees. Les refus lèvent DiveRefusal,
 * traduite en réponse JSON par la route.
 */
final class DiveService
{
    /**
     * Palanquées et réponses à valider (règles dures) pour cette transition,
     * ou null. Vers 'archived' : toujours, sur l'état fusionné (corps, sinon
     * stocké) — un PATCH {status:'archived'} seul ne fige plus une fiche non
     * validée. Vers 'in_progress' (mise à l'eau) : seulement si le corps porte
     * les palanquées, une mise à l'eau n'est jamais refusée sinon.
     *
     * @param array{answers?: ?string, palanquees?: ?string} $stored
     * @return array{palanquees: array, answers: array}|null
     */
    public static function rulesInput(string $curStatus, ?string $newStatus, array $body, array $stored): ?array
    {
        if ($curStatus === 'archived') return null;
        if ($newStatus === 'archived' || ($newStatus === 'in_progress' && isset($body['palanquees']))) {
            return [
                'palanquees' => array_key_exists('palanquees', $body)
                    ? (array)$body['palanquees']
                    : self::decodeList($stored['palanquees'] ?? null),
                'answers' => !empty($body['answers'])
                    ? (array)$body['answers']
                    : self::decodeList($stored['answers'] ?? null),
            ];
        }
        return null;
    }

    /**
     * Erreurs bloquantes des règles (Rules::validateDive) avec les plongeurs
     * du club et le niveau encadrant du cadre (associatif / SCA) ; null si OK.
     */
    public static function rulesErrors(array $palanquees, array $answers, string $clubId): ?string
    {
        if (empty($palanquees)) return null;

        $ids = [];
        foreach ($palanquees as $pal) {
            foreach ($pal['membres'] ?? [] as $m) {
                if (empty($m['_bapteme']) && !empty($m['diverId'])) $ids[(string)$m['diverId']] = true;
            }
        }
        $club     = Db::row('SELECT jurisdiction, structure_type FROM clubs WHERE id=?', [$clubId]);
        $cadrePro = Encadrement::isCadrePro($club['structure_type'] ?? null);

        // Réglementation du lieu : le pays du site enregistré prime sur ce
        // que le client a déduit (answers.jurisdiction n'est jamais lu).
        $site = !empty($answers['site_id'])
            ? Db::row('SELECT pays_code FROM sites WHERE id=? AND club_id=?', [(string)$answers['site_id'], $clubId])
            : null;
        $answers['jurisdiction'] = self::diveJurisdiction($site, $answers, $club);

        $diversById = [];
        if ($ids) {
            $ids  = array_keys($ids);
            $phs  = implode(',', array_fill(0, count($ids), '?'));
            $rows = Db::all(
                "SELECT id, nom, prenom, niveau_plongeur, niveau_encadrant,
                        aptitudes_sup, qualifs, medical, date_naissance
                   FROM divers
                  WHERE id IN ({$phs}) AND club_id=? AND deleted_at IS NULL",
                [...$ids, $clubId]
            );
            foreach ($rows as $row) {
                $row = self::withGasQualifs(Encadrement::applyToRow($row, $cadrePro));
                $row['aptitudes_sup'] = json_decode($row['aptitudes_sup'] ?? '[]', true) ?? [];
                $diversById[$row['id']] = $row;
            }
            // Plongeur supprimé de l'annuaire ou créé hors ligne et pas encore
            // synchronisé : pas de refus (la fiche doit pouvoir être archivée,
            // A322-72), mais il échappe à la validation → journalisé.
            $unknown = count(array_diff($ids, array_keys($diversById)));
            if ($unknown > 0) Log::action('dive.unknown_divers', ['club_id' => $clubId, 'count' => $unknown]);
        }

        $dp = null;
        if (!empty($answers['dp_id'])) {
            $dpRow = Db::row(
                'SELECT id, niveau_encadrant, qualifs, aptitudes_sup
                   FROM divers WHERE id=? AND club_id=? AND deleted_at IS NULL',
                [$answers['dp_id'], $clubId]
            );
            if ($dpRow) $dp = self::withGasQualifs(Encadrement::applyToRow($dpRow, $cadrePro));
        }
        // DP absent de l'annuaire : niveau déclaré dans la plongée.
        if (!$dp && !empty($answers['dp_qual'])) {
            $dp = ['niveau_encadrant' => $answers['dp_qual'], 'nitrox' => [], 'trimix' => []];
        }

        $rules  = RulesFor::forJurisdiction($answers['jurisdiction']);
        $result = $rules::validateDive($palanquees, $diversById, $answers, $dp);
        return $result['ok'] ? null : implode(' | ', $result['errors']);
    }

    /**
     * Juridiction d'une plongée : pays du site enregistré (même vide : on
     * retombe alors sur le club, pas sur le client) ; site inconnu du serveur
     * (créé hors ligne, pas encore synchronisé) : pays recopié dans
     * answers.site_pays_code ; sinon juridiction du club.
     *
     * @param array{pays_code?: ?string}|null $site
     * @param array{jurisdiction?: ?string}|null $club
     */
    public static function diveJurisdiction(?array $site, array $answers, ?array $club): string
    {
        $pays = $site !== null
            ? ($site['pays_code'] ?? null)
            : (isset($answers['site_pays_code']) ? (string)$answers['site_pays_code'] : null);
        return Jurisdiction::resolve($pays, $club['jurisdiction'] ?? null);
    }

    /**
     * POST /api/dives (après le contrôle d'idempotence du client_uuid).
     * @return array{id: string, documents_status: ?string}
     */
    public static function create(string $clubId, string $userId, array $body, ?callable $onArchived = null): array
    {
        $clientUuid = isset($body['client_uuid']) && SyncHelpers::isValidUuid((string)$body['client_uuid'])
            ? (string)$body['client_uuid'] : null;
        $status = (DiveStatus::fromInput($body['status'] ?? null) ?? DiveStatus::Prepared)->value;
        $date   = DiveDates::toMysql(self::str($body, 'date_plongee'));

        // Plongée créée en cours ou archivée (synchro hors-ligne d'une session
        // déjà commencée) : mêmes règles qu'au PATCH.
        if (!empty($body['palanquees']) && $status !== 'prepared') {
            $err = self::rulesErrors((array)$body['palanquees'], (array)($body['answers'] ?? []), $clubId);
            if ($err !== null) throw new DiveRefusal(422, $err);
        }
        $rsJson   = !empty($body['render_state']) ? self::renderStateJson($body['render_state']) : null;
        $archived = $status === 'archived';
        $id       = Db::uuid();

        Db::transaction(static function (PDO $pdo) use ($id, $clubId, $userId, $clientUuid, $status, $date, $body, $rsJson, $archived): void {
            // closed_at = heure SERVEUR (base de la conservation légale).
            $pdo->prepare(
                'INSERT INTO dives
                 (id, club_id, user_id, client_uuid, status, site_nom, date_plongee, planned_at,
                  dp_nom, dp_qual, activite, answers, palanquees, drive_link, closed_at, documents_status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,' . ($archived ? "NOW(),'pending'" : 'NULL,NULL') . ')'
            )->execute([
                $id, $clubId, $userId, $clientUuid, $status,
                mb_substr(self::str($body, 'site_nom'), 0, 255),
                $date,
                $date, // planned_at = date_plongee à la création
                mb_substr(self::str($body, 'dp_nom'), 0, 200),
                mb_substr(self::str($body, 'dp_qual'), 0, 20),
                mb_substr(self::str($body, 'activite'), 0, 50),
                json_encode($body['answers'] ?? [], JSON_UNESCAPED_UNICODE),
                json_encode($body['palanquees'] ?? [], JSON_UNESCAPED_UNICODE),
                mb_substr(self::str($body, 'drive_link'), 0, 500),
            ]);
            if ($rsJson !== null) {
                $pdo->prepare('INSERT INTO dive_runtime_state (dive_id, state) VALUES (?,?)')->execute([$id, $rsJson]);
            }
        });

        Log::action('dive.created', ['dive_id' => $id, 'club_id' => $clubId]);
        if ($archived) {
            Log::action('dive.archived', ['dive_id' => $id, 'club_id' => $clubId]);
            ($onArchived ?? DiveArchive::onArchived(...))($id);
        }
        return ['id' => $id, 'documents_status' => $archived ? 'pending' : null];
    }

    /**
     * PATCH /api/dives/:id. Tant que la plongée n'est pas archivée, tous les
     * champs sont modifiables ; archivée (fiche figée, A322-72), seul
     * drive_link l'est, un render_state différent du stocké est refusé et un
     * rejeu du PATCH d'archivage réussit sans rien écrire. closed_at est posé
     * par le SERVEUR (base de la conservation légale).
     *
     * @return array{id: string, status: string, drive_link: ?string, documents_status: ?string}
     */
    public static function patch(string $clubId, string $idOrUuid, array $body, ?callable $onArchived = null): array
    {
        $newStatus = DiveStatus::fromInput($body['status'] ?? null)?->value;

        $id = Db::transaction(static function (PDO $pdo) use ($clubId, $idOrUuid, $body, $newStatus): array {
            $st = $pdo->prepare(
                'SELECT id, status, answers, palanquees FROM dives
                  WHERE (id=? OR client_uuid=?) AND club_id=? AND deleted_at IS NULL
                  ORDER BY (id = ?) DESC LIMIT 1 FOR UPDATE'
            );
            $st->execute([$idOrUuid, $idOrUuid, $clubId, $idOrUuid]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row) throw new DiveRefusal(404, 'Plongée introuvable');

            $diveId    = (string)$row['id'];
            $curStatus = (string)$row['status'];
            $archived  = $curStatus === 'archived';
            if ($archived && $newStatus !== null && $newStatus !== 'archived') {
                throw new DiveRefusal(422, "Impossible de modifier le statut d'une plongée archivée", DivePolicy::ARCHIVED_IMMUTABLE);
            }

            $hasRenderState = isset($body['render_state']);
            if ($archived) {
                $violation = DivePolicy::archivedPatchViolation($body, DiveStore::storedRenderState($diveId));
                if ($violation !== null) throw new DiveRefusal(422, $violation, DivePolicy::ARCHIVED_IMMUTABLE);
                $hasRenderState = false; // état identique (rejeu) : rien à écrire
            }

            [$sets, $params] = $archived ? [[], []] : self::mutableSets($body, $newStatus);
            if (isset($body['drive_link'])) {
                $sets[]   = 'drive_link=?';
                $params[] = mb_substr(self::str($body, 'drive_link'), 0, 500);
            }
            $archivedReplay = $archived && $newStatus === 'archived';
            if (!$sets && !$hasRenderState && !$archivedReplay) {
                throw new DiveRefusal(422, 'Aucun champ à mettre à jour');
            }

            $input = self::rulesInput($curStatus, $newStatus, $body, $row);
            if ($input !== null) {
                $err = self::rulesErrors($input['palanquees'], $input['answers'], $clubId);
                if ($err !== null) throw new DiveRefusal(422, $err);
            }

            // Un client qui aurait ouvert la plongée sans son contenu (hors
            // ligne) ne doit pas vider une composition existante.
            if (!$archived && self::isEmptyPayload($body) && self::decodeList($row['palanquees'] ?? null)) {
                throw new DiveRefusal(409, 'Mise à jour refusée : elle viderait une plongée existante', 'EMPTY_OVERWRITE_REFUSED');
            }

            if ($hasRenderState && !DiveStore::writeRuntimeStateUnlessArchived($diveId, self::renderStateJson($body['render_state']))) {
                throw new DiveRefusal(422, DivePolicy::ARCHIVED_MESSAGE, DivePolicy::ARCHIVED_IMMUTABLE);
            }
            if ($sets) {
                $pdo->prepare('UPDATE dives SET ' . implode(',', $sets) . ' WHERE id=? AND club_id=?')
                    ->execute([...$params, $diveId, $clubId]);
            }
            return ['id' => $diveId, 'archiving' => !$archived && $newStatus === 'archived'];
        });

        if ($id['archiving']) {
            Log::action('dive.archived', ['dive_id' => $id['id'], 'club_id' => $clubId]);
            ($onArchived ?? DiveArchive::onArchived(...))($id['id']);
        }
        return Db::row('SELECT id, status, drive_link, documents_status FROM dives WHERE id=?', [$id['id']])
            ?? ['id' => $id['id'], 'status' => null, 'drive_link' => null, 'documents_status' => null];
    }

    /** Vrai si le corps porte answers ET palanquees vides (état jamais chargé). */
    public static function isEmptyPayload(array $body): bool
    {
        if (!array_key_exists('answers', $body) || !array_key_exists('palanquees', $body)) return false;
        return empty($body['answers']) && empty($body['palanquees']);
    }

    /**
     * Colonnes modifiables tant que la plongée n'est pas archivée.
     * @return array{0: list<string>, 1: list<mixed>}
     */
    private static function mutableSets(array $body, ?string $newStatus): array
    {
        $sets = [];
        $params = [];
        foreach (['answers', 'palanquees'] as $k) {
            if (isset($body[$k])) {
                $sets[]   = "{$k}=?";
                $params[] = json_encode($body[$k], JSON_UNESCAPED_UNICODE);
            }
        }
        foreach (['site_nom' => 255, 'dp_nom' => 200, 'dp_qual' => 20, 'activite' => 50] as $k => $max) {
            if (isset($body[$k])) {
                $sets[]   = "{$k}=?";
                $params[] = mb_substr(self::str($body, $k), 0, $max);
            }
        }
        foreach (['date_plongee', 'planned_at', 'started_at'] as $k) {
            if (isset($body[$k])) {
                $sets[]   = "{$k}=?";
                $params[] = DiveDates::toMysql(self::str($body, $k));
            }
        }
        if ($newStatus !== null) {
            $sets[]   = 'status=?';
            $params[] = $newStatus;
            if ($newStatus === 'archived') {
                $sets[] = 'closed_at=NOW()';
                // Posé avec le statut : une plongée archivée n'a jamais
                // documents_status NULL (bin/documents.php --retry la reprend).
                $sets[] = "documents_status='pending'";
            }
        }
        return [$sets, $params];
    }

    /** @return list<mixed> */
    private static function decodeList(?string $json): array
    {
        $v = $json === null ? null : json_decode($json, true);
        return is_array($v) ? $v : [];
    }

    private static function str(array $body, string $key): string
    {
        $v = $body[$key] ?? '';
        return is_scalar($v) ? (string)$v : '';
    }

    private static function renderStateJson(mixed $value): string
    {
        try {
            return Validate::encodeJsonObject($value, DivePolicy::RENDER_STATE_MAX_BYTES, 'render_state');
        } catch (InvalidArgumentException $e) {
            throw new DiveRefusal(422, $e->getMessage());
        }
    }

    /** qualifs JSON → listes nitrox / trimix (même lecture que routes/divers.php). */
    private static function withGasQualifs(array $row): array
    {
        $raw = json_decode($row['qualifs'] ?? '[]', true) ?? [];
        if (isset($raw['nitrox']) || isset($raw['trimix'])) {
            $row['nitrox'] = $raw['nitrox'] ?? [];
            $row['trimix'] = $raw['trimix'] ?? [];
        } else {
            $row['nitrox'] = array_values(array_intersect((array)$raw, ['PN', 'PN-C']));
            $row['trimix'] = array_values(array_intersect((array)$raw, ['PTH-40', 'PTH-70', 'PTH-120']));
        }
        return $row;
    }
}
