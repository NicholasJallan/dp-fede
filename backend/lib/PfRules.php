<?php
declare(strict_types=1);

/**
 * Validation d'une palanquée en Polynésie française (loi du pays n° 2017-44,
 * arrêté n° 199 CM) : plongée à l'air, annexes X et XI ; mélanges dans
 * PfGasRules (annexes XII à XV).
 * Portage de src/domain/pf/pf-rules.js : cas communs dans
 * tests/fixtures/pal-rules-pf.json (PfRulesFixturesTest, tests/pal-rules-pf.test.js).
 * Issues : ['tone', 'code', 'text', 'ref', 'ids'], comme Rules.
 */
final class PfRules
{
    private const int AIR_MAX = 50;            // art. 4
    private const int AIR_FORMATION_MAX = 60;  // art. 4 et 26
    private const int AGE_AUTONOMIE = 18;      // LP 4
    private const int AUTONOMIE_MAX = 3;       // LP 4

    private const array EXPLORATION_SPACES = [12, 20, 30, 40, 50];
    private const array FORMATION_SPACES = [6, 12, 20, 30, 40, 50];

    /** Annexe X — effectif maximal des plongeurs encadrés. */
    private const array EXPLORATION_EFFECTIF = [12 => 4, 20 => 5, 30 => 5, 40 => 5, 50 => 4];

    /** Annexe XI — effectif, ENS minimal et encadrant supplémentaire (notes b à e). */
    private const array FORMATION = [
        6  => ['max' => 2, 'ens' => 6, 'extraEns' => 20, 'extraGp' => true],
        12 => ['max' => 4, 'ens' => 20, 'extraEns' => 20, 'extraGp' => true],
        20 => ['max' => 4, 'ens' => 20, 'extraEns' => 20, 'extraGp' => true],
        30 => ['max' => 4, 'ens' => 30, 'extraEns' => 30, 'extraGp' => true],
        40 => ['max' => 4, 'ens' => 40, 'extraEns' => 40, 'extraGp' => true],
        50 => ['max' => 2, 'ens' => 50, 'extraEns' => 50, 'extraGp' => false],
    ];

    /** Annexe XI — espace maximal d'un élève selon l'aptitude qu'il détient. */
    private const array FORMATION_MAX_PAR_ROLE = [
        'Baptême' => 6, 'Débutant' => 12,
        'PE-12' => 20, 'PA-12' => 20,
        'PE-20' => 40, 'PA-20' => 40, 'PE-30' => 40, 'PA-30' => 40,
        'PE-40' => 50, 'PA-40' => 50, 'PE-50' => 50, 'PA-50' => 50,
    ];

    /** Même retour que Rules::validateDive. */
    public static function validateDive(array $palanquees, array $diversById, array $answers, ?array $dp): array
    {
        $errors   = [];
        $warnings = [];
        $all      = [];
        foreach (array_values($palanquees) as $i => $pal) {
            $label = 'P' . ($i + 1);
            foreach (self::validatePal(is_array($pal) ? $pal : [], $diversById, $answers, $dp) as $issue) {
                $msg = "{$label} : {$issue['text']}";
                if ($issue['tone'] === 'err')  $errors[]   = $msg;
                if ($issue['tone'] === 'warn') $warnings[] = $msg;
                if ($issue['tone'] !== 'ok')   $all[]      = $issue + ['pal' => $label];
            }
        }
        return ['ok' => empty($errors), 'errors' => $errors, 'warnings' => $warnings, 'issues' => $all];
    }

    /** @return list<array{tone: string, code: string, text: string, ref: ?string, ids: list<string>}> */
    public static function validatePal(array $pal, array $diversById, array $answers, ?array $dp): array
    {
        $issues = [];
        $add = static function (string $tone, string $code, string $text, ?string $ref = null, array $ids = []) use (&$issues): void {
            $issues[] = ['tone' => $tone, 'code' => $code, 'text' => $text, 'ref' => $ref, 'ids' => array_values($ids)];
        };

        $membres = self::resolveMembres($pal, $diversById);
        if (!self::checkGeneric($pal, $membres, $add)) return $issues;

        $ctx = self::buildContext($pal, $membres, $answers, $dp, $add);
        self::checkJustified($ctx, $add);
        self::checkAirDepth($ctx, $add);
        if ($ctx['gas']['trimix']) {
            PfGasRules::checkTrimix($ctx, $add);
        } else {
            if ($ctx['mode'] === 'enseignement') {
                self::checkFormation($ctx, $add);
            } elseif (array_filter($membres, static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude']))) {
                self::checkExplorationEncadree($ctx, $add);
            } else {
                self::checkAutonomie($ctx, $add);
            }
            if ($ctx['gas']['nitrox']) PfGasRules::checkNitrox($ctx, $add);
        }
        PfGasRules::checkPressures($ctx, $add);
        self::checkMedical($ctx, $add);

        if (!array_filter($issues, static fn(array $i): bool => $i['tone'] === 'err')) {
            $add('ok', 'OK', 'Composition conforme à la réglementation de la Polynésie française.');
        }
        return $issues;
    }

    // ── Contrôles ───────────────────────────────────────────────────────────

    private static function checkGeneric(array $pal, array $membres, callable $add): bool
    {
        if (!$membres) {
            $add('warn', 'PAL_EMPTY', 'Palanquée vide.');
            return false;
        }
        if (count($membres) === 1) $add('err', 'PAL_SOLO', 'Une palanquée compte au moins deux plongeurs.', 'LP 4');
        $sans = array_values(array_filter($membres, static fn(array $m): bool => $m['aptitude'] === ''));
        if ($sans) {
            $add('err', 'APT_MISSING',
                count($sans) . ' membre(s) sans aptitude sélectionnée — veuillez compléter avant de continuer.',
                null, PfRoles::ids($sans));
            return false;
        }
        if (!(self::num($pal['profMax'] ?? null) > 0)) {
            $add('err', 'PROF_MISSING',
                "Profondeur maximale prévue non renseignée : l'espace d'évolution ne peut pas être contrôlé.",
                'art. 2');
            return false;
        }
        return true;
    }

    private static function checkJustified(array $ctx, callable $add): void
    {
        foreach ($ctx['membres'] as $m) {
            if ($m['_bapteme'] || PfRoles::isNovice($m['aptitude'])) continue;
            $roles = [...$m['profile']['aptitudes'], ...$m['profile']['fonctions']];
            if (!in_array($m['aptitude'], $roles, true)) {
                $add('err', 'PF_APT_NOT_JUSTIFIED',
                    PfRoles::memberName($m) . " : {$m['aptitude']} ne figure pas dans ses aptitudes reconnues.",
                    'LP 13', [PfRoles::memberId($m)]);
            }
        }
    }

    private static function checkAirDepth(array $ctx, callable $add): void
    {
        $derog = !empty($ctx['pal']['derogation_formation_60']);
        if ($derog && $ctx['mode'] !== 'enseignement') {
            $add('err', 'PF_DEROG_FORMATION_ONLY',
                'La dérogation de 10 m au-delà de 50 m est réservée aux plongées de formation.', 'art. 26');
        }
        if ($ctx['gas']['trimix']) return;
        $p = $ctx['profMax'];
        if ($p > self::AIR_FORMATION_MAX) {
            $add('err', 'PF_AIR_60', 'Air ou nitrox : ' . PfRoles::fmt($p) . ' m dépasse le maximum absolu de 60 m.', 'art. 4');
        } elseif ($p > self::AIR_MAX && !($ctx['mode'] === 'enseignement' && $derog)) {
            $add('err', 'PF_AIR_50',
                'Air ou nitrox limité à 50 m (palanquée à ' . PfRoles::fmt($p)
                . " m) ; jusqu'à 60 m seulement en formation, si les standards de l'organisme l'exigent.",
                'art. 4');
        }
    }

    private static function checkDp(array $ctx, string $required, callable $add): void
    {
        if ($ctx['dpProfile'] === null) {
            $add('warn', 'DP_MISSING', 'Directeur de plongée non désigné.', 'LP 8');
            return;
        }
        if (!PfRoles::hasDp($ctx['dpProfile'], $required)) {
            $add('err', 'PF_DP_LEVEL',
                "Directeur de plongée {$required} au minimum pour cette palanquée ({$ctx['mode']}, " . PfRoles::fmt($ctx['profMax']) . ' m).',
                'ann. I');
        }
    }

    private static function checkExplorationEncadree(array $ctx, callable $add): void
    {
        $encadrants = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude'])));
        $guide      = $ctx['guide'];
        if ($guide === null) {
            $add('err', 'PF_GP_REQUIRED',
                'En exploration, la palanquée est encadrée par un guide de palanquée (GP-40 ou GP-50).',
                'ann. X', PfRoles::ids($encadrants));
            return;
        }
        $space = $ctx['space'];
        if ($space === null) return;
        if ($space === 50 && PfRoles::gpLevel($guide['aptitude']) < 50) {
            $add('err', 'PF_GP_LEVEL', "Exploration dans l'espace 0-50 m : guide GP-50 requis.", 'ann. X', [PfRoles::memberId($guide)]);
        }
        $encadres = array_values(array_filter($ctx['membres'], static fn(array $m): bool => !PfRoles::isEncadrantRole($m['aptitude'])));
        self::checkAptitudesForSpace($encadres, $space, 'ann. X', $add);
        $extras  = array_values(array_filter($encadrants, static fn(array $m): bool => $m['_idx'] !== $guide['_idx']));
        $extraOk = $space <= 40 && (bool)array_filter($extras,
            static fn(array $m): bool => PfRoles::gpLevel($m['aptitude']) >= 40 || PfRoles::ensLevel($m['aptitude']) >= 40);
        $effectif = count($encadres) + count($extras) - ($extraOk ? 1 : 0);
        $max      = self::EXPLORATION_EFFECTIF[$space];
        if ($effectif > $max) {
            $add('err', 'PF_EFFECTIF',
                "Exploration 0-{$space} m : {$max} plongeurs encadrés au plus ({$effectif} dans la palanquée).",
                'ann. X', PfRoles::ids($encadres));
        }
        self::checkDp($ctx, $space === 50 ? 'DP-60' : 'DP-40', $add);
    }

    private static function checkAptitudesForSpace(array $membres, int $space, string $ref, callable $add): void
    {
        $short = array_values(array_filter($membres, static fn(array $m): bool => PfRoles::airLevel($m['aptitude']) < $space));
        if ($short) {
            $add('err', 'PF_APT_DEPTH',
                implode(', ', array_map([PfRoles::class, 'memberName'], $short)) . " : aptitude insuffisante pour l'espace 0-{$space} m.",
                $ref, PfRoles::ids($short));
        }
    }

    private static function checkAutonomie(array $ctx, callable $add): void
    {
        $encadres = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::level($m['aptitude'], 'PE') > 0));
        if ($encadres) {
            $add('err', 'PF_ENCADRANT_REQUIRED',
                implode(', ', array_map([PfRoles::class, 'memberName'], $encadres)) . ' : aptitude PE, plongée encadrée par un guide de palanquée.',
                'art. 23', PfRoles::ids($encadres));
        }
        $n = count($ctx['membres']);
        if ($n > self::AUTONOMIE_MAX) {
            $add('err', 'PF_AUTONOMIE_EFFECTIF',
                'Plongée en autonomie : ' . self::AUTONOMIE_MAX . " plongeurs au plus ({$n} dans la palanquée).",
                'LP 4', PfRoles::ids($ctx['membres']));
        }
        $autonomes = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::level($m['aptitude'], 'PA') > 0));
        if ($ctx['space'] !== null) self::checkAptitudesForSpace($autonomes, $ctx['space'], 'art. 24', $add);
        foreach ($autonomes as $m) {
            $age = PfRoles::ageAt(self::strOrNull($m['diver']['date_naissance'] ?? null), $ctx['date']);
            if ($age === null) {
                $add('warn', 'AGE_UNKNOWN',
                    PfRoles::memberName($m) . ' : date de naissance non renseignée — autonomie réservée aux majeurs.',
                    'LP 4', [PfRoles::memberId($m)]);
            } elseif ($age < self::AGE_AUTONOMIE) {
                $add('err', 'PF_AUTONOMIE_MAJEUR',
                    PfRoles::memberName($m) . " ({$age} ans) : les mineurs ne plongent pas en autonomie.",
                    'LP 4', [PfRoles::memberId($m)]);
            }
        }
        if ($ctx['space'] !== null) self::checkDp($ctx, $ctx['space'] === 50 ? 'DP-60' : 'DP-40', $add);
    }

    private static function checkFormation(array $ctx, callable $add): void
    {
        $encadrants = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude'])));
        $enseignant = $ctx['enseignant'];
        if ($enseignant === null) {
            $add('err', 'PF_ENS_REQUIRED',
                'En formation, la palanquée est encadrée par un enseignant (ENS-06 à ENS-50).',
                'ann. XI', PfRoles::ids($encadrants));
        }
        $space = $ctx['space'];
        if ($space === null) return;
        $row = self::FORMATION[$space];
        if ($enseignant !== null && PfRoles::ensLevel($enseignant['aptitude']) < $row['ens']) {
            $add('err', 'PF_ENS_LEVEL',
                "Formation dans l'espace 0-{$space} m : enseignant ENS-" . sprintf('%02d', $row['ens']) . ' au minimum.',
                'ann. XI', [PfRoles::memberId($enseignant)]);
        }
        $eleves = array_values(array_filter($ctx['membres'], static fn(array $m): bool => !PfRoles::isEncadrantRole($m['aptitude'])));
        // Au nitrox, l'élève évolue dans l'espace de son aptitude air (annexe XIII).
        $nitrox = $ctx['gas']['nitrox'];
        $short  = array_values(array_filter($eleves, static fn(array $m): bool =>
            ($nitrox ? PfGasRules::nitroxEleveMax($m['aptitude']) : (self::FORMATION_MAX_PAR_ROLE[$m['aptitude']] ?? 0)) < $space));
        if ($short) {
            $add('err', 'PF_APT_DEPTH',
                implode(', ', array_map([PfRoles::class, 'memberName'], $short)) . " : aptitude insuffisante pour une formation dans l'espace 0-{$space} m.",
                'ann. XI', PfRoles::ids($short));
        }
        $extras = array_values(array_filter($encadrants,
            static fn(array $m): bool => $enseignant === null || $m['_idx'] !== $enseignant['_idx']));
        $extraOk = (bool)array_filter($extras, static fn(array $m): bool =>
            PfRoles::ensLevel($m['aptitude']) >= $row['extraEns'] || ($row['extraGp'] && PfRoles::gpLevel($m['aptitude']) >= 40));
        $effectif = count($eleves) + count($extras) - ($extraOk ? 1 : 0);
        if ($effectif > $row['max']) {
            $add('err', 'PF_EFFECTIF',
                "Formation 0-{$space} m : {$row['max']} élèves au plus par enseignant ({$effectif} dans la palanquée).",
                'ann. XI', PfRoles::ids($eleves));
        }
        self::checkDp($ctx, $space === 6 ? 'DP-40' : 'DP-60', $add);
    }

    private static function checkMedical(array $ctx, callable $add): void
    {
        foreach ($ctx['membres'] as $m) {
            if ($m['_bapteme']) continue;
            $certificat = self::validWithinYear($m['diver']['medical'] ?? null, $ctx['date']);
            if (PfRoles::isEncadrantRole($m['aptitude'])) {
                if (!$certificat) {
                    $add('err', 'PF_MEDICAL_ENCADRANT',
                        PfRoles::memberName($m) . ' : encadrant sans certificat médical de moins de 12 mois (surveillance médicale renforcée).',
                        'art. 13', [PfRoles::memberId($m)]);
                }
            } elseif (!$certificat && !self::validWithinYear($m['profile']['attestation'], $ctx['date'])) {
                $add('warn', 'PF_ATTESTATION_MISSING',
                    PfRoles::memberName($m) . ' : ni attestation de condition physique ni certificat médical de moins de 12 mois.',
                    'art. 12', [PfRoles::memberId($m)]);
            }
        }
        if ($ctx['dp'] !== null && !self::validWithinYear($ctx['dp']['medical'] ?? null, $ctx['date'])) {
            $add('err', 'PF_MEDICAL_DP',
                'Directeur de plongée sans certificat médical de moins de 12 mois (surveillance médicale renforcée).',
                'art. 13');
        }
    }

    // ── Contexte ────────────────────────────────────────────────────────────

    private static function resolveMembres(array $pal, array $diversById): array
    {
        $out = [];
        foreach (is_array($pal['membres'] ?? null) ? $pal['membres'] : [] as $m) {
            if (!is_array($m)) continue;
            $bapteme = !empty($m['_bapteme']);
            $diver   = $bapteme ? null : ($diversById[(string)($m['diverId'] ?? '')] ?? null);
            if (!$bapteme && !is_array($diver)) continue;
            $out[] = [
                'aptitude' => is_string($m['aptitude'] ?? null) ? $m['aptitude'] : '',
                '_bapteme' => $bapteme,
                'diver'    => $diver,
                'profile'  => $bapteme ? null : PfProfile::effective($diver),
                '_idx'     => count($out), // identité stable (équivalent de !== en JS)
            ] + $m;
        }
        return $out;
    }

    private static function buildContext(array $pal, array $membres, array $answers, ?array $dp, callable $add): array
    {
        $profMax = self::num($pal['profMax'] ?? null);
        $profMax = is_nan($profMax) ? 0.0 : $profMax;
        $mode    = self::palMode($pal, $membres, $add);
        $gas     = self::gasOf($pal);
        $derog   = $mode === 'enseignement' && !empty($pal['derogation_formation_60']);
        $limit   = $derog ? self::AIR_FORMATION_MAX : self::AIR_MAX;
        $space   = null;
        if ($gas['trimix']) {
            $space = $profMax > PfGasRules::TRIMIX_MAX ? null : self::spaceIn(PfGasRules::TRIMIX_SPACES, $profMax);
        } elseif ($profMax <= $limit) {
            $space = self::spaceIn($mode === 'enseignement' ? self::FORMATION_SPACES : self::EXPLORATION_SPACES, $profMax) ?? 50;
        }
        $encadrants = array_values(array_filter($membres, static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude'])));
        $dpQual    = self::strOrNull($answers['dp_qual'] ?? null);
        $dpProfile = $dp !== null ? PfProfile::effective($dp)
            : ($dpQual !== null ? PfProfile::effective(['niveau_encadrant' => $dpQual]) : null);
        return [
            'pal'       => $pal,
            'membres'   => $membres,
            'dp'        => $dp,
            'dpProfile' => $dpProfile,
            'profMax'   => $profMax,
            'mode'      => $mode,
            'gas'       => $gas,
            'space'     => $space,
            'guide'     => PfRoles::best(array_values(array_filter($encadrants,
                static fn(array $m): bool => PfRoles::gpLevel($m['aptitude']) > 0)), [PfRoles::class, 'gpLevel']),
            'enseignant' => PfRoles::best(array_values(array_filter($encadrants,
                static fn(array $m): bool => PfRoles::ensLevel($m['aptitude']) > 0)), [PfRoles::class, 'ensLevel']),
            'date'      => self::parseDiveDate($answers['date'] ?? null),
        ];
    }

    private static function palMode(array $pal, array $membres, callable $add): string
    {
        $roles   = array_column($membres, 'aptitude');
        $novices = (bool)array_filter($roles, [PfRoles::class, 'isNovice']);
        $mode    = $pal['mode'] ?? null;
        if ($mode === 'exploration' && $novices) {
            $add('warn', 'MODE_BAPTEME',
                'Un baptême ou un débutant relève de la formation : palanquée traitée en formation.', 'art. 25');
            return 'enseignement';
        }
        if ($mode === 'enseignement' || $mode === 'exploration') return $mode;
        $ens = (bool)array_filter($roles, static fn(string $r): bool => PfRoles::ensLevel($r) > 0);
        return $novices || $ens ? 'enseignement' : 'exploration';
    }

    /** Même lecture des mélanges que Rules (palGas en JS). */
    private static function gasOf(array $pal): array
    {
        $list       = is_array($pal['melanges'] ?? null) ? array_values($pal['melanges']) : [];
        $nx40       = in_array('Nx ≤ 40%', $list, true);
        $nx40plus   = in_array('Nx > 40%', $list, true);
        $trimix     = in_array('Tx', $list, true);
        $decoNitrox = $nx40plus && (in_array('Air', $list, true) || $nx40 || $trimix);
        return [
            'nitrox'       => $nx40 || $nx40plus,
            'trimix'       => $trimix,
            'nx40plus'     => $nx40plus,
            'bottomNitrox' => !$trimix && ($nx40 || ($nx40plus && !$decoNitrox)),
            'bottomO2Max'  => $nx40plus && !$decoNitrox ? 100 : 40,
        ];
    }

    private static function spaceIn(array $spaces, float $profMax): ?int
    {
        foreach ($spaces as $sp) if ($profMax <= $sp) return $sp;
        return null;
    }

    // ── Utilitaires ─────────────────────────────────────────────────────────




    /** Pièce datée de moins d'un an à la date de plongée. */
    private static function validWithinYear(mixed $iso, ?DateTimeImmutable $date): bool
    {
        if (!is_string($iso) || $iso === '' || $date === null) return false;
        $issued = PfRoles::parseCalendarDate($iso);
        return $issued !== null && $issued->modify('+1 year') >= $date;
    }


    private static function parseDiveDate(mixed $raw): ?DateTimeImmutable
    {
        if ($raw === null || $raw === '') return new DateTimeImmutable('now');
        if (!is_string($raw)) return null;
        try {
            return new DateTimeImmutable($raw);
        } catch (\Exception) {
            return null;
        }
    }


    private static function strOrNull(mixed $v): ?string
    {
        return is_string($v) && $v !== '' ? $v : null;
    }

    private static function num(mixed $v): float
    {
        if (is_int($v) || is_float($v)) return (float)$v;
        if (is_string($v) && is_numeric(trim($v))) return (float)trim($v);
        return 0.0;
    }

}
