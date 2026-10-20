<?php
declare(strict_types=1);

/**
 * Import de l'annuaire des plongeurs (CSV ou JSON) — partie pure :
 * lecture CSV, reconnaissance des en-têtes, normalisation des lignes.
 * Le rapprochement avec l'annuaire existant et l'écriture sont dans
 * DiverImportPlan. Format documenté dans docs/import-plongeurs.md.
 */
class DiverImport
{
    public const MAX_ROWS  = 2000;
    public const MAX_BYTES = 1048576; // 1 Mo

    public const PROFILES = ['auto', 'vpdive'];

    /** Champ canonique → alias d'en-têtes (après normalisation, cf. headerKey). */
    private const BASE_ALIASES = [
        'nom'              => ['nom', 'nom_de_famille', 'last_name', 'lastname', 'surname'],
        'prenom'           => ['prenom', 'first_name', 'firstname', 'prenoms'],
        'licence'          => ['licence', 'license', 'n_licence', 'no_licence', 'num_licence', 'numero_licence',
                               'numero_de_licence', 'licence_ffessm', 'n_de_licence', 'n_licence_ffessm'],
        'date_naissance'   => ['date_naissance', 'date_de_naissance', 'naissance', 'ne_le', 'nee_le',
                               'ne_e_le', 'birthdate', 'date_of_birth', 'ddn'],
        'niveau'           => ['niveau', 'niveau_plongeur', 'brevet', 'niveau_technique', 'niveau_de_plongee'],
        'niveau_encadrant' => ['niveau_encadrant', 'encadrant', 'niveau_d_encadrement', 'niveau_encadrement',
                               'qualification_encadrant', 'monitorat', 'encadrement'],
        'nitrox'           => ['nitrox', 'qualification_nitrox', 'qualif_nitrox'],
        'trimix'           => ['trimix', 'qualification_trimix', 'qualif_trimix'],
        'caci'             => ['caci', 'date_caci', 'certificat_medical', 'date_certificat_medical',
                               'date_du_certificat_medical', 'cm', 'date_cm', 'medical', 'certificat',
                               'date_certificat'],
        'licence_fin'      => ['fin_de_licence', 'fin_licence', 'date_fin_licence', 'date_de_fin_de_licence',
                               'validite_licence', 'licence_valide_jusqu_au', 'expiration_licence', 'licence_fin'],
        'external_id'      => ['identifiant_externe', 'id_externe', 'external_id', 'externalid', 'identifiant'],
        'source'           => ['source'],
        'representant_legal'            => ['representant_legal', 'responsable_legal'],
        'autorisation_parentale_saison' => ['autorisation_parentale', 'autorisation_parentale_saison'],
    ];

    /**
     * Alias supplémentaires du profil « vpdive ». HYPOTHÈSE à valider avec un
     * export réel de VPDive (noms de colonnes non documentés publiquement).
     */
    private const VPDIVE_ALIASES = [
        'external_id'      => ['id', 'id_adherent', 'code_adherent', 'numero_adherent', 'n_adherent', 'no_adherent',
                               'num_adherent', 'reference_adherent', 'ref_adherent'],
        'niveau'           => ['niveau_fede', 'niveau_federal', 'niveau_ffessm', 'brevet_ffessm'],
        'niveau_encadrant' => ['niveau_moniteur', 'qualification_moniteur', 'niveau_enseignement'],
        'caci'             => ['date_certif_medical', 'date_certificat_med', 'certif_medical', 'date_visite_medicale'],
        'licence_fin'      => ['date_validite_licence', 'licence_valable_jusqu_au', 'fin_validite_licence'],
    ];

    // ── Lecture du fichier ─────────────────────────────────────────────────

    /**
     * Décode le contenu brut : retire le BOM UTF-8 ; un contenu qui n'est pas
     * de l'UTF-8 valide est supposé Windows-1252 (export Excel français).
     *
     * @return array{0:string,1:string} [texte UTF-8, encodage détecté]
     */
    public static function decode(string $raw): array
    {
        if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) {
            return [substr($raw, 3), 'UTF-8 (BOM)'];
        }
        if (mb_check_encoding($raw, 'UTF-8')) {
            return [$raw, 'UTF-8'];
        }
        return [mb_convert_encoding($raw, 'UTF-8', 'Windows-1252'), 'Windows-1252'];
    }

    /** Séparateur le plus fréquent hors guillemets sur la ligne d'en-tête (; , ou tabulation). */
    public static function detectSeparator(string $text): string
    {
        $firstLine = strtok($text, "\r\n") ?: '';
        $counts    = [';' => 0, ',' => 0, "\t" => 0];
        $inQuote   = false;
        $len       = strlen($firstLine);
        for ($i = 0; $i < $len; $i++) {
            $c = $firstLine[$i];
            if ($c === '"') { $inQuote = !$inQuote; continue; }
            if (!$inQuote && isset($counts[$c])) $counts[$c]++;
        }
        arsort($counts);
        $best = (string)array_key_first($counts);
        return $counts[$best] > 0 ? $best : ';';
    }

    /**
     * Découpe un CSV (RFC 4180 : champs entre guillemets, guillemets doublés,
     * retours à la ligne dans les champs). Les lignes vides sont ignorées.
     *
     * @return list<array{line:int, cells: string[]}> numéro de ligne physique (1 = en-tête)
     */
    public static function parseCsv(string $text, string $separator): array
    {
        $fh = fopen('php://temp', 'r+');
        if ($fh === false) throw new RuntimeException('Flux temporaire indisponible');
        fwrite($fh, $text);
        rewind($fh);

        $rows = [];
        $line = 1;
        while (($cells = fgetcsv($fh, 0, $separator, '"', '')) !== false) {
            $start = $line;
            foreach ($cells as $c) $line += substr_count((string)$c, "\n");
            $line++;
            if ($cells === [null] || implode('', array_map('strval', $cells)) === '') continue;
            $rows[] = ['line' => $start, 'cells' => array_map(static fn($c): string => trim((string)$c), $cells)];
        }
        fclose($fh);
        return $rows;
    }

    // ── En-têtes ───────────────────────────────────────────────────────────

    /** « N° de licence » → « n_de_licence », « Prénom » → « prenom ». */
    public static function headerKey(string $header): string
    {
        $s = mb_strtolower(LevelMapper::fold($header));
        $s = preg_replace('/[^a-z0-9]+/', '_', $s) ?? '';
        return trim($s, '_');
    }

    /**
     * Associe chaque colonne à un champ canonique.
     *
     * @param string[] $headers
     * @return array{map: array<int,string>, recognized: array<string,string>, ignored: string[], errors: string[]}
     */
    public static function mapHeaders(array $headers, string $profile = 'auto'): array
    {
        $aliases = self::aliasesFor($profile);
        $map = [];
        $recognized = [];
        $ignored = [];
        $taken = [];
        foreach ($headers as $i => $h) {
            $key   = self::headerKey((string)$h);
            $field = $aliases[$key] ?? null;
            if ($field === null || isset($taken[$field])) {
                if (trim((string)$h) !== '') $ignored[] = (string)$h;
                continue;
            }
            $taken[$field]  = true;
            $map[$i]        = $field;
            $recognized[(string)$h] = $field;
        }
        $errors = isset($taken['nom']) ? [] : ['Colonne « nom » introuvable dans l\'en-tête'];
        return ['map' => $map, 'recognized' => $recognized, 'ignored' => $ignored, 'errors' => $errors];
    }

    /** @return array<string,string> alias normalisé → champ */
    private static function aliasesFor(string $profile): array
    {
        $out = [];
        $sets = [self::BASE_ALIASES];
        if ($profile === 'vpdive') $sets[] = self::VPDIVE_ALIASES;
        foreach ($sets as $set) {
            foreach ($set as $field => $list) {
                foreach ($list as $alias) $out[$alias] = $field;
            }
        }
        return $out;
    }

    /**
     * Lignes CSV → enregistrements bruts (champ canonique → valeur).
     *
     * @param list<array{line:int, cells: string[]}> $rows lignes de données (sans l'en-tête)
     * @param array<int,string> $map
     * @return list<array{line:int, data: array<string,string>}>
     */
    public static function rowsToRecords(array $rows, array $map): array
    {
        $out = [];
        foreach ($rows as $r) {
            $data = [];
            foreach ($map as $i => $field) $data[$field] = $r['cells'][$i] ?? '';
            $out[] = ['line' => $r['line'], 'data' => $data];
        }
        return $out;
    }

    /**
     * Enregistrements JSON (tableau d'objets) → enregistrements bruts.
     * Les clés sont reconnues avec les mêmes alias que les en-têtes CSV.
     *
     * @return list<array{line:int, data: array<string,string>}>
     */
    public static function jsonToRecords(array $items, string $profile = 'auto'): array
    {
        $aliases = self::aliasesFor($profile);
        $out = [];
        foreach (array_values($items) as $n => $item) {
            $data = [];
            if (is_array($item)) {
                foreach ($item as $k => $v) {
                    $field = $aliases[self::headerKey((string)$k)] ?? null;
                    if ($field === null || isset($data[$field])) continue;
                    $data[$field] = is_scalar($v) ? trim((string)$v) : '';
                }
            }
            $out[] = ['line' => $n + 1, 'data' => $data];
        }
        return $out;
    }

    // ── Normalisation d'une ligne ──────────────────────────────────────────

    /**
     * Valide et normalise un enregistrement brut.
     * Une valeur vide signifie « ne pas modifier » (null dans le résultat).
     *
     * @return array{record: ?array, errors: string[], warnings: string[]}
     */
    public static function normalize(array $data, string $defaultSource, DateTimeImmutable $today): array
    {
        $errors   = [];
        $warnings = [];
        $get = static fn(string $k): string => trim((string)($data[$k] ?? ''));

        $nom = $get('nom');
        if ($nom === '') $errors[] = 'Nom manquant';
        foreach (['nom' => 100, 'prenom' => 100, 'licence' => 50, 'external_id' => 64, 'representant_legal' => 200] as $k => $max) {
            if (mb_strlen($get($k)) > $max) $errors[] = "{$k} : {$max} caractères maximum";
        }

        $rec = [
            'nom'         => $nom,
            'prenom'      => $get('prenom'),
            'licence'     => $get('licence') !== '' ? self::normalizeLicence($get('licence')) : null,
            'external_id' => $get('external_id') !== '' ? $get('external_id') : null,
            'source'      => self::normalizeSource($get('source') !== '' ? $get('source') : $defaultSource),
            'representant_legal' => $get('representant_legal') !== '' ? $get('representant_legal') : null,
        ];
        if ($rec['source'] === null) $errors[] = 'Source invalide (lettres, chiffres, - et _, 20 caractères max.)';

        foreach (['date_naissance' => true, 'caci' => false, 'licence_fin' => false] as $k => $isBirth) {
            $raw = $get($k);
            $rec[$k === 'caci' ? 'medical' : $k] = null;
            if ($raw === '') continue;
            $d = self::parseDate($raw, $isBirth, $today);
            if ($d === null) {
                $errors[] = "Date invalide pour {$k} : « {$raw} »";
                continue;
            }
            if (($isBirth || $k === 'caci') && $d > $today->format('Y-m-d')) {
                $errors[] = "Date dans le futur pour {$k} : « {$raw} »";
                continue;
            }
            $rec[$k === 'caci' ? 'medical' : $k] = $d;
        }

        $rec['levels'] = null;
        if ($get('niveau') !== '' || $get('niveau_encadrant') !== '') {
            $lv = LevelMapper::mapLevels($get('niveau'), $get('niveau_encadrant'));
            array_push($errors, ...$lv['errors']);
            array_push($warnings, ...$lv['warnings']);
            $rec['levels'] = ['niveau_plongeur' => $lv['niveau_plongeur'], 'niveau_encadrant' => $lv['niveau_encadrant']];
        }

        $rec['nitrox'] = null;
        $rec['trimix'] = null;
        if ($get('nitrox') !== '') {
            $nx = LevelMapper::mapNitrox($get('nitrox'));
            if ($nx['error']) $errors[] = $nx['error']; else $rec['nitrox'] = $nx['value'];
        }
        if ($get('trimix') !== '') {
            $tx = LevelMapper::mapTrimix($get('trimix'));
            if ($tx['error']) {
                $errors[] = $tx['error'];
            } else {
                $rec['trimix'] = $tx['value'];
                if ($tx['value'] && $rec['nitrox'] !== ['PN', 'PN-C']) {
                    $rec['nitrox'] = ['PN', 'PN-C'];
                    $warnings[] = 'Qualification trimix : PN-C ajouté (prérequis)';
                }
            }
        }

        $rec['autorisation_parentale_saison'] = null;
        $ap = $get('autorisation_parentale_saison');
        if ($ap !== '') {
            $folded = LevelMapper::fold($ap);
            if (in_array($folded, ['OUI', 'X', 'O', '1', 'YES', 'VRAI'], true)) {
                $rec['autorisation_parentale_saison'] = ClubAlerts::seasonFor($today);
            } elseif (in_array($folded, ['NON', '0', 'N', 'NO', 'FAUX'], true)) {
                $rec['autorisation_parentale_saison'] = null;
            } else {
                $season = ClubAlerts::normalizeSeason($ap);
                if ($season === null) $errors[] = "Saison d'autorisation parentale invalide : « {$ap} » (attendu AAAA-AAAA)";
                $rec['autorisation_parentale_saison'] = $season;
            }
        }

        return ['record' => $errors ? null : $rec, 'errors' => $errors, 'warnings' => $warnings];
    }

    /** Licence : majuscules, sans espaces. */
    public static function normalizeLicence(string $s): string
    {
        return strtoupper(preg_replace('/\s+/', '', $s) ?? '');
    }

    public static function normalizeSource(string $s): ?string
    {
        $s = strtolower(trim($s));
        return preg_match('/^[a-z0-9_-]{1,20}$/', $s) ? $s : null;
    }

    /**
     * Date tolérante → AAAA-MM-JJ, ou null si invalide.
     * Formats : AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ/MM/AA,
     * AAAA/MM/JJ, date + heure, numéro de série Excel (5 chiffres).
     * Année sur 2 chiffres : pour une date de naissance, 19AA si AA > année
     * courante, sinon 20AA ; pour les autres dates, toujours 20AA.
     */
    public static function parseDate(string $raw, bool $isBirth, DateTimeImmutable $today): ?string
    {
        $s = trim($raw);
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/', $s, $m)) {
            [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
        } elseif (preg_match('/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/', $s, $m)) {
            [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
        } elseif (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})(?:\s.*)?$/', $s, $m)) {
            [$d, $mo, $y] = [(int)$m[1], (int)$m[2], (int)$m[3]];
            if (strlen($m[3]) === 2) {
                $cur = (int)$today->format('y');
                $y = ($isBirth && $y > $cur) ? 1900 + $y : 2000 + $y;
            }
        } elseif (preg_match('/^\d{5}$/', $s) && (int)$s >= 10000 && (int)$s <= 80000) {
            return (new DateTimeImmutable('1899-12-30'))->modify('+' . (int)$s . ' days')->format('Y-m-d');
        } else {
            return null;
        }
        if ($y < 1900 || $y > 2100 || !checkdate($mo, $d, $y)) return null;
        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    }
}
