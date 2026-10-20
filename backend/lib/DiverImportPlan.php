<?php
declare(strict_types=1);

/**
 * Import de l'annuaire — rapprochement avec l'annuaire du club et écriture.
 *
 * Rapprochement d'une ligne (dans cet ordre) :
 *   1. (source, external_id) — y compris une fiche supprimée, qui est réactivée ;
 *   2. n° de licence (normalisé) parmi les fiches actives ;
 *   3. nom + prénom (sans accents ni casse) parmi les fiches actives, si
 *      unique, et seulement si la ligne n'a ni identifiant externe ni licence,
 *      ou si les deux dates de naissance sont connues et égales.
 * Sinon : création. Une valeur vide dans le fichier ne modifie jamais la fiche.
 *
 * plan() est pur (testé) ; fetchExisting() et apply() accèdent à MariaDB.
 */
class DiverImportPlan
{
    /** Champs scalaires comparés / écrits. */
    private const SCALAR_FIELDS = [
        'nom', 'prenom', 'licence', 'date_naissance', 'medical', 'licence_fin',
        'representant_legal', 'autorisation_parentale_saison',
    ];

    /**
     * @param list<array{line:int, record: array}> $records lignes valides (DiverImport::normalize)
     * @param list<array> $existing fiches du club (cf. fetchExisting)
     * @return list<array{line:int, action:string, diver_id:?string, changes: array<string,array{0:mixed,1:mixed}>, record: array, error?: string}>
     */
    public static function plan(array $records, array $existing): array
    {
        $byExternal = [];
        $byLicence  = [];
        $byName     = [];
        foreach ($existing as $e) {
            if (($e['external_id'] ?? null) !== null && $e['external_id'] !== '') {
                $byExternal[self::extKey((string)$e['source'], (string)$e['external_id'])] = $e;
            }
            if (!empty($e['deleted_at'])) continue;
            $lic = DiverImport::normalizeLicence((string)($e['licence'] ?? ''));
            if ($lic !== '') $byLicence[$lic][] = $e;
            $byName[self::nameKey((string)$e['nom'], (string)($e['prenom'] ?? ''))][] = $e;
        }

        $out      = [];
        $usedIds  = [];
        $usedKeys = [];
        foreach ($records as $r) {
            $rec  = $r['record'];
            $line = $r['line'];
            $item = ['line' => $line, 'action' => 'create', 'diver_id' => null, 'changes' => [], 'record' => $rec];

            // Doublons à l'intérieur du fichier.
            $fileKeys = [];
            if ($rec['external_id'] !== null) $fileKeys[] = 'x:' . self::extKey($rec['source'], $rec['external_id']);
            if ($rec['licence'] !== null)     $fileKeys[] = 'l:' . $rec['licence'];
            $dupOf = null;
            foreach ($fileKeys as $k) {
                if (isset($usedKeys[$k])) { $dupOf = $usedKeys[$k]; break; }
            }
            if ($dupOf !== null) {
                $item['action'] = 'error';
                $out[] = $item + ['error' => "Doublon de la ligne {$dupOf} (même identifiant ou licence)"];
                continue;
            }

            [$match, $error] = self::match($rec, $byExternal, $byLicence, $byName);
            if ($error === null && $match !== null && isset($usedIds[$match['id']])) {
                $error = "Même plongeur que la ligne {$usedIds[$match['id']]}";
            }
            if ($error !== null) {
                $item['action'] = 'error';
                $out[] = $item + ['error' => $error];
                continue;
            }
            foreach ($fileKeys as $k) $usedKeys[$k] = $line;

            if ($match === null) {
                $item['changes'] = self::diff([], $rec);
            } else {
                $usedIds[$match['id']] = $line;
                $item['diver_id'] = (string)$match['id'];
                $item['changes']  = self::diff($match, $rec);
                $item['action']   = $item['changes'] ? 'update' : 'unchanged';
            }
            $out[] = $item;
        }
        return $out;
    }

    /** @return array{0: ?array, 1: ?string} [fiche, erreur] */
    private static function match(array $rec, array $byExternal, array $byLicence, array $byName): array
    {
        if ($rec['external_id'] !== null) {
            $hit = $byExternal[self::extKey($rec['source'], $rec['external_id'])] ?? null;
            if ($hit !== null) return [$hit, null];
        }
        if ($rec['licence'] !== null && isset($byLicence[$rec['licence']])) {
            $hits = $byLicence[$rec['licence']];
            if (count($hits) > 1) return [null, "Licence {$rec['licence']} portée par plusieurs fiches de l'annuaire"];
            $hit = $hits[0];
            if ($rec['external_id'] !== null && ($hit['external_id'] ?? null) !== null
                && $hit['source'] === $rec['source'] && (string)$hit['external_id'] !== $rec['external_id']) {
                return [null, "Licence {$rec['licence']} déjà rattachée à l'identifiant externe {$hit['external_id']}"];
            }
            return [$hit, null];
        }
        $hits = $byName[self::nameKey($rec['nom'], $rec['prenom'])] ?? [];
        if (!$hits) return [null, null];
        $strong = array_values(array_filter($hits, static fn(array $e): bool =>
            $rec['date_naissance'] !== null && ($e['date_naissance'] ?? null) === $rec['date_naissance']));
        if (count($strong) === 1) return [$strong[0], null];
        if ($rec['external_id'] === null && $rec['licence'] === null) {
            if (count($hits) === 1) return [$hits[0], null];
            return [null, 'Plusieurs fiches portent ce nom : ajouter la licence ou l\'identifiant externe'];
        }
        return [null, null];
    }

    /**
     * Champs modifiés par la ligne (valeurs non vides uniquement).
     *
     * @return array<string,array{0:mixed,1:mixed}> champ → [avant, après]
     */
    public static function diff(array $existing, array $rec): array
    {
        $changes = [];
        foreach (self::SCALAR_FIELDS as $f) {
            $new = $rec[$f] ?? null;
            if ($new === null || $new === '') continue;
            $old = $existing[$f] ?? null;
            $cmpOld = $f === 'licence' ? DiverImport::normalizeLicence((string)$old) : (string)$old;
            if ($cmpOld !== (string)$new) $changes[$f] = [$old, $new];
        }
        if ($rec['levels'] !== null) {
            foreach (['niveau_plongeur', 'niveau_encadrant'] as $f) {
                $old = $existing[$f] ?? null;
                $new = $rec['levels'][$f];
                if ((string)$old !== (string)$new) $changes[$f] = [$old, $new];
            }
        }
        $qualifs = self::decodeQualifs($existing['qualifs'] ?? null);
        foreach (['nitrox', 'trimix'] as $f) {
            if ($rec[$f] === null) continue;
            if ($qualifs[$f] !== $rec[$f]) $changes[$f] = [$qualifs[$f], $rec[$f]];
        }
        if ($existing && $rec['external_id'] !== null
            && (($existing['external_id'] ?? null) !== $rec['external_id'] || ($existing['source'] ?? null) !== $rec['source'])) {
            $changes['external_id'] = [$existing['external_id'] ?? null, $rec['external_id']];
            $changes['source']      = [$existing['source'] ?? null, $rec['source']];
        }
        if ($existing && !empty($existing['deleted_at'])) {
            $changes['deleted_at'] = [$existing['deleted_at'], null];
        }
        return $changes;
    }

    /** @return array{nitrox: string[], trimix: string[], raw: array} */
    public static function decodeQualifs($raw): array
    {
        $q = is_array($raw) ? $raw : (json_decode((string)($raw ?? ''), true) ?: []);
        if (isset($q['nitrox']) || isset($q['trimix'])) {
            return ['nitrox' => array_values((array)($q['nitrox'] ?? [])), 'trimix' => array_values((array)($q['trimix'] ?? [])), 'raw' => $q];
        }
        // Ancien format : tableau plat.
        $flat = array_values(array_filter((array)$q, 'is_string'));
        return [
            'nitrox' => array_values(array_intersect(['PN', 'PN-C'], $flat)),
            'trimix' => array_values(array_intersect(['PTH-40', 'PTH-70', 'PTH-120'], $flat)),
            'raw'    => ['nitrox' => [], 'trimix' => [], 'recycleurs' => [], 'diplome' => null,
                         'rifap' => in_array('RIFAP', $flat, true), 'tiv' => in_array('TIV', $flat, true)],
        ];
    }

    /**
     * Rapport renvoyé au client.
     *
     * @param list<array{line:int, errors:string[]}> $invalid lignes rejetées à la normalisation
     * @param list<array{line:int, message:string}> $warnings
     */
    public static function report(array $plan, array $invalid, array $warnings, bool $dryRun, array $meta): array
    {
        $counts = ['created' => 0, 'updated' => 0, 'unchanged' => 0];
        $errors = [];
        $items  = [];
        foreach ($invalid as $inv) {
            foreach ($inv['errors'] as $msg) $errors[] = ['line' => $inv['line'], 'message' => $msg];
        }
        foreach ($plan as $p) {
            if ($p['action'] === 'error') {
                $errors[] = ['line' => $p['line'], 'message' => $p['error'] ?? 'Erreur'];
                continue;
            }
            $key = ['create' => 'created', 'update' => 'updated', 'unchanged' => 'unchanged'][$p['action']];
            $counts[$key]++;
            $items[] = [
                'line'     => $p['line'],
                'action'   => $p['action'],
                'diver_id' => $p['diver_id'],
                'nom'      => $p['record']['nom'],
                'prenom'   => $p['record']['prenom'],
                'changes'  => array_keys($p['changes']),
            ];
        }
        usort($errors, static fn(array $a, array $b): int => $a['line'] <=> $b['line']);
        return $meta + [
            'dry_run'   => $dryRun,
            'total'     => count($plan) + count($invalid),
            'created'   => $counts['created'],
            'updated'   => $counts['updated'],
            'unchanged' => $counts['unchanged'],
            'errors'    => $errors,
            'warnings'  => $warnings,
            'items'     => $items,
        ];
    }

    private static function extKey(string $source, string $externalId): string
    {
        return $source . "\x1F" . $externalId;
    }

    private static function nameKey(string $nom, string $prenom): string
    {
        return LevelMapper::fold(trim($nom)) . "\x1F" . LevelMapper::fold(trim($prenom));
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    public static function fetchExisting(string $clubId): array
    {
        return Db::all(
            'SELECT id, nom, prenom, licence, date_naissance, niveau_plongeur, niveau_encadrant, qualifs,
                    medical, licence_fin, source, external_id, representant_legal,
                    autorisation_parentale_saison, deleted_at
               FROM divers WHERE club_id=?',
            [$clubId]
        );
    }

    /**
     * Applique le plan dans une transaction. Les lignes 'unchanged' et
     * 'error' sont ignorées.
     */
    public static function apply(array $plan, array $existing, string $clubId, int $authorId): void
    {
        $byId = [];
        foreach ($existing as $e) $byId[(string)$e['id']] = $e;

        Db::transaction(static function (PDO $pdo) use ($plan, $byId, $clubId, $authorId): void {
            foreach ($plan as $p) {
                if ($p['action'] === 'create') {
                    self::insert($pdo, $p['record'], $clubId, $authorId);
                } elseif ($p['action'] === 'update') {
                    self::update($pdo, $byId[$p['diver_id']], $p['record'], $p['changes'], $clubId);
                }
            }
        });
    }

    private static function insert(PDO $pdo, array $rec, string $clubId, int $authorId): void
    {
        $np = $rec['levels']['niveau_plongeur'] ?? null;
        $ne = $rec['levels']['niveau_encadrant'] ?? null;
        $qualifs = [
            'nitrox' => $rec['nitrox'] ?? [], 'trimix' => $rec['trimix'] ?? [], 'recycleurs' => [],
            'diplome' => null, 'rifap' => $ne !== null, 'tiv' => false,
        ];
        $pdo->prepare(
            'INSERT INTO divers
               (id, club_id, user_id, nom, prenom, licence, niveau, niveau_plongeur, niveau_encadrant,
                qualifs, aptitudes_sup, medical, notes, date_naissance, source, external_id,
                licence_fin, representant_legal, autorisation_parentale_saison)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            Db::uuid(), $clubId, $authorId, $rec['nom'], $rec['prenom'], $rec['licence'] ?? '',
            $ne ?: ($np ?: ''), $np, $ne,
            json_encode($qualifs, JSON_UNESCAPED_UNICODE), '[]',
            $rec['medical'], '', $rec['date_naissance'], $rec['source'], $rec['external_id'],
            $rec['licence_fin'], $rec['representant_legal'], $rec['autorisation_parentale_saison'],
        ]);
    }

    private static function update(PDO $pdo, array $existing, array $rec, array $changes, string $clubId): void
    {
        $sets   = [];
        $params = [];
        foreach (self::SCALAR_FIELDS as $f) {
            if (!isset($changes[$f])) continue;
            $sets[]   = "{$f}=?";
            $params[] = $rec[$f];
        }
        if (isset($changes['niveau_plongeur']) || isset($changes['niveau_encadrant'])) {
            $np = $rec['levels']['niveau_plongeur'];
            $ne = $rec['levels']['niveau_encadrant'];
            array_push($sets, 'niveau_plongeur=?', 'niveau_encadrant=?', 'niveau=?');
            array_push($params, $np, $ne, $ne ?: ($np ?: ''));
        }
        if (isset($changes['nitrox']) || isset($changes['trimix'])) {
            $q = self::decodeQualifs($existing['qualifs'] ?? null)['raw'];
            if (isset($changes['nitrox'])) $q['nitrox'] = $rec['nitrox'];
            if (isset($changes['trimix'])) $q['trimix'] = $rec['trimix'];
            $sets[]   = 'qualifs=?';
            $params[] = json_encode($q, JSON_UNESCAPED_UNICODE);
        }
        if (isset($changes['external_id'])) {
            array_push($sets, 'external_id=?', 'source=?');
            array_push($params, $rec['external_id'], $rec['source']);
        }
        if (isset($changes['deleted_at'])) $sets[] = 'deleted_at=NULL';
        if (!$sets) return;
        $params[] = $existing['id'];
        $params[] = $clubId;
        $pdo->prepare('UPDATE divers SET ' . implode(', ', $sets) . ' WHERE id=? AND club_id=?')->execute($params);
    }
}
