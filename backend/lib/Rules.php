<?php
declare(strict_types=1);

/**
 * Règles métier FFESSM / Code du sport — validation des palanquées.
 *
 * Portage fidèle de lib/cds-tables.js (annexes III-15 a à III-18 c),
 * lib/pal-rules.js (moteur validatePal) et des helpers de data.js
 * (getMilieuType, getDiverAptitudes, getFormationBonusAptitudes,
 * aptitudeMaxDepth, getDpMaxDepth, getPalType).
 *
 * Les codes d'issues sont stables et partagés avec le front ; les cas de
 * référence vivent dans tests/fixtures/pal-rules.json, exécutés côté JS
 * (tests/pal-rules.test.js) ET côté PHP (tests-php/RulesFixturesTest.php).
 *
 * PHP 8.5 (prod : pool PHP-FPM 8.5 dp-fede).
 */
class Rules
{
    // ── Tableaux réglementaires (lib/cds-tables.js) ─────────────────────────

    public const ENS_LEVELS = ['E1', 'E2', 'E3', 'E4'];

    private const ENS_RANK = ['E1' => 1, 'E2' => 2, 'E3' => 3, 'E4' => 4];

    /** Qualifications mélanges, de la moins à la plus étendue (III-17 a, III-18 a). */
    private const GAS_QUAL_RANK = ['PN' => 1, 'PN-C' => 2, 'PTH-40' => 3, 'PTH-70' => 4, 'PTH-120' => 5];

    /** A322-76 / A322-92 / A322-98 — limites absolues. */
    private const LIMIT_AIR_MAX = 60;
    private const LIMIT_BASSIN_DEROGATION_MAX = 6;
    private const LIMIT_PPO2_MAX = 1.6;

    /** A322-73 / A322-89 — âge minimal pour l'autonomie. */
    private const AUTONOMIE_AGE_MIN = [12 => 16, 20 => 16, 40 => 17, 60 => 18];

    /** Annexe III-16 b — plongée autonome : effectif maximal. */
    private const AUTONOMIE_MAX = 3;

    /** Annexe III-16 a — enseignement à l'air en milieu naturel. */
    private const AIR_ENSEIGNEMENT = [
        6  => ['minE' => 'E1', 'max' => 4, 'maxBapteme' => 1, 'extra' => true],
        12 => ['minE' => 'E2', 'max' => 4, 'extra' => true],
        20 => ['minE' => 'E2', 'max' => 4, 'extra' => true],
        40 => ['minE' => 'E3', 'max' => 4, 'extra' => true],
        60 => ['minE' => 'E4', 'max' => 4, 'extra' => false],
    ];

    /** Annexe III-16 b — exploration à l'air en milieu naturel (plongée encadrée). */
    private const AIR_EXPLORATION = [
        6  => ['minE' => 'E1', 'gp' => true,  'max' => 4, 'extra' => true, 'debutants' => true],
        12 => ['minE' => 'E2', 'gp' => true,  'max' => 4, 'extra' => true],
        20 => ['minE' => 'E2', 'gp' => true,  'max' => 4, 'extra' => true],
        40 => ['minE' => 'E3', 'gp' => true,  'max' => 4, 'extra' => true],
        60 => ['minE' => 'E4', 'gp' => false, 'max' => 4, 'extra' => false],
    ];

    /** Annexe III-17 b — enseignement au nitrox (encadrant + PN-C). */
    private const NITROX_ENSEIGNEMENT = [
        6  => ['minE' => 'E2', 'max' => 4, 'maxBapteme' => 1, 'extra' => true, 'elevePN' => false],
        12 => ['minE' => 'E2', 'max' => 4, 'extra' => true, 'elevePN' => false],
        20 => ['minE' => 'E2', 'max' => 4, 'extra' => true, 'elevePN' => false],
        40 => ['minE' => 'E3', 'max' => 4, 'extra' => true, 'elevePN' => true],
        60 => ['minE' => 'E4', 'max' => 4, 'extra' => false, 'elevePN' => true],
    ];

    /** Annexe III-17 c — exploration au nitrox (pas de ligne 0-6 m). */
    private const NITROX_EXPLORATION = [
        12 => ['minE' => 'E2', 'gp' => true,  'max' => 4, 'extra' => true],
        20 => ['minE' => 'E2', 'gp' => true,  'max' => 4, 'extra' => true],
        40 => ['minE' => 'E3', 'gp' => true,  'max' => 4, 'extra' => true],
        60 => ['minE' => 'E4', 'gp' => false, 'max' => 4, 'extra' => false],
    ];

    /** Annexe III-18 b — enseignement au trimix / héliox. */
    private const TRIMIX_ENSEIGNEMENT = [
        40 => ['minE' => 'E3', 'encadrantQual' => 'PTH-70',  'eleveAir' => 40, 'eleveQual' => 'PN-C',   'max' => 4],
        70 => ['minE' => 'E4', 'encadrantQual' => 'PTH-120', 'eleveAir' => 60, 'eleveQual' => 'PTH-40', 'max' => 4],
        80 => ['minE' => 'E4', 'encadrantQual' => 'PTH-120', 'eleveAir' => 60, 'eleveQual' => 'PTH-70', 'max' => 4],
    ];

    /** Annexe III-18 c — exploration au trimix / héliox. */
    private const TRIMIX_EXPLORATION = [
        40 => ['minE' => 'E3', 'encadrantQual' => 'PTH-40',  'air' => 40, 'qual' => 'PTH-40',  'max' => 4],
        70 => ['minE' => 'E4', 'encadrantQual' => 'PTH-70',  'air' => 60, 'qual' => 'PTH-70',  'max' => 4],
        80 => ['minE' => 'E4', 'encadrantQual' => 'PTH-120', 'air' => 60, 'qual' => 'PTH-120', 'max' => 4],
    ];

    private const TRIMIX_AUTONOMIE = [
        40  => ['air' => 40, 'qual' => 'PTH-40'],
        70  => ['air' => 60, 'qual' => 'PTH-70'],
        80  => ['air' => 60, 'qual' => 'PTH-120'],
        120 => ['air' => 60, 'qual' => 'PTH-120'],
    ];

    /** Annexe III-15 a (+ A322-98) — qualification minimale du directeur de plongée. */
    private const DP_QUALIF = [
        'N5' => ['naturel' => true,  'bassin' => false, 'enseignement' => false, 'trimix' => null],
        'E1' => ['naturel' => false, 'bassin' => true,  'enseignement' => true,  'trimix' => null],
        'E2' => ['naturel' => false, 'bassin' => true,  'enseignement' => true,  'trimix' => null],
        'E3' => ['naturel' => true,  'bassin' => true,  'enseignement' => true,  'trimix' => ['enseignement' => 40, 'exploration' => 70]],
        'E4' => ['naturel' => true,  'bassin' => true,  'enseignement' => true,  'trimix' => ['enseignement' => 80, 'exploration' => 120]],
    ];

    // ── Tables data.js ──────────────────────────────────────────────────────

    private const APT_MAX_DEPTH = [
        'Baptême' => 6,
        'PE12' => 12, 'PE20' => 20, 'PE40' => 40, 'PE60' => 60,
        'PA12' => 12, 'PA20' => 20, 'PA40' => 40, 'PA60' => 60,
        'GP'   => 40,
        'E1'   => 6,  'E2' => 20, 'E3' => 40, 'E4' => 60,
        'PTH70' => 70, 'PTH120' => 120,
    ];

    private const APT_ORDER = [
        'Baptême', 'PE12', 'PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60',
        'PTH70', 'PTH120', 'GP', 'E1', 'E2', 'E3', 'E4',
    ];

    // ── Helpers data.js ─────────────────────────────────────────────────────

    /** Normalise en 'mer' | 'lac' | 'piscine' | 'fosse' (insensible à la casse). */
    public static function getMilieuType(?string $milieu): string
    {
        if ($milieu === null || $milieu === '') return 'mer';
        $m = mb_strtolower($milieu, 'UTF-8');
        if (strpos($m, 'lac') !== false || strpos($m, 'carrière') !== false || strpos($m, 'carriere') !== false) return 'lac';
        if (strpos($m, 'piscine') !== false) return 'piscine';
        if (strpos($m, 'fosse') !== false) return 'fosse';
        return 'mer';
    }

    /** Profondeur max (m) associée à une aptitude ; inconnue → 0. */
    public static function aptitudeMaxDepth(string $aptitude): int
    {
        return self::APT_MAX_DEPTH[$aptitude] ?? 0;
    }

    /**
     * Type de palanquée : 'bapteme' | 'formation' | 'guidee' | 'exploration'.
     * @param array       $membres liste de membres { aptitude }
     * @param string|null $mode    choix du DP (pal.mode)
     */
    public static function getPalType(array $membres, ?string $mode = null): string
    {
        $apts = self::aptitudesOf($membres);
        if (in_array('Baptême', $apts, true)) return 'bapteme';
        $effective = self::derivePalMode(['membres' => $membres, 'mode' => $mode]);
        if ($effective === 'enseignement') return 'formation';
        foreach ($apts as $a) {
            if ($a === 'GP' || in_array($a, self::ENS_LEVELS, true)) return 'guidee';
        }
        return 'exploration';
    }

    /**
     * Profondeur max qu'un DP peut diriger pour un type de palanquée
     * (III-15 a, A322-76, A322-98). 0 = type interdit pour ce DP.
     */
    public static function getDpMaxDepth(string $palType, ?array $dp): int
    {
        $ne = self::str($dp['niveau_encadrant'] ?? null);
        $q  = self::DP_QUALIF[$ne] ?? null;
        if ($q === null) return 0;
        $isTraining = ($palType === 'formation' || $palType === 'bapteme');
        if ($isTraining && !$q['enseignement']) return 0;
        if (!$q['naturel']) return self::LIMIT_BASSIN_DEROGATION_MAX;
        $air = self::LIMIT_AIR_MAX;
        $hasPth120 = in_array('PTH-120', self::listOf($dp['trimix'] ?? null), true);
        if ($q['trimix'] === null || !$hasPth120) return $air;
        return max($air, $q['trimix'][$isTraining ? 'enseignement' : 'exploration']);
    }

    /**
     * Aptitudes visées en cours de formation (III-16 a) — uniquement en
     * enseignement, selon l'enseignant présent (E3 : 0-40 m, E4 : 0-60 m).
     */
    public static function getFormationBonusAptitudes(?array $diver, ?string $maxEnsLevel, ?string $mode = null): array
    {
        if (!$diver || !$maxEnsLevel || $mode === 'exploration') return [];
        $np  = self::str($diver['niveau_plongeur'] ?? null);
        $ne  = self::str($diver['niveau_encadrant'] ?? null);
        $sup = self::listOf($diver['aptitudes_sup'] ?? null);
        if ($ne !== '') return [];
        if ($np === 'N1' && in_array($maxEnsLevel, ['E3', 'E4'], true)) {
            return in_array('PA20', $sup, true) ? ['PE40', 'PA40'] : ['PE40'];
        }
        if ($np === 'N2' && $maxEnsLevel === 'E4') {
            return in_array('PA40', $sup, true) ? ['PE60', 'PA60'] : ['PE60'];
        }
        return [];
    }

    /**
     * Aptitudes disponibles pour un plongeur, dans l'ordre canonique.
     * @param array|null $palContext ['maxEnsLevel' => ?string, 'mode' => ?string]
     */
    public static function getDiverAptitudes(array $diver, bool $isExploration = false, ?array $palContext = null): array
    {
        $np     = self::str($diver['niveau_plongeur'] ?? null);
        $ne     = self::str($diver['niveau_encadrant'] ?? null);
        $trimix = self::listOf($diver['trimix'] ?? null);
        $sup    = self::listOf($diver['aptitudes_sup'] ?? null);
        $maxEns = isset($palContext['maxEnsLevel']) && $palContext['maxEnsLevel'] !== '' ? (string)$palContext['maxEnsLevel'] : null;
        $mode   = isset($palContext['mode']) ? (string)$palContext['mode'] : null;

        // Licencié débutant : baptême, ou formation vers PE-12 / PE-20 (III-16 a).
        if ($np === '' && $ne === '') return ['Baptême', 'PE12', 'PE20'];

        $apts = [];
        if ($np === 'N1') {
            $apts[] = 'PE20';
            if (in_array('PA12', $sup, true)) $apts[] = 'PA12';
            if (in_array('PA20', $sup, true)) $apts[] = 'PA20';
        }
        if ($np === 'N2') {
            array_push($apts, 'PE20', 'PE40', 'PA12', 'PA20');
            if (in_array('PA40', $sup, true)) $apts[] = 'PA40';
        }
        if ($np === 'N3') {
            array_push($apts, 'PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60');
        }

        // Encadrants : aptitudes plongeur N3 + rôle encadrant. Exception : un E1
        // (initiateur) peut n'être que N2 — ses aptitudes plongeur suivent alors
        // son niveau plongeur (III-14 b, A322-89), N2 par défaut.
        if ($ne === 'E1' && $np !== 'N3') {
            array_push($apts, 'PE20', 'PE40', 'PA12', 'PA20');
            if (in_array('PA40', $sup, true)) $apts[] = 'PA40';
        } elseif ($ne !== '') {
            array_push($apts, 'PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60');
        }
        if ($ne !== '') {
            if ($ne === 'N4') {
                $apts[] = 'GP';
            } elseif ($ne === 'E1') {
                if (in_array('GP', $sup, true)) $apts[] = 'GP';
                $apts[] = $ne;
            } elseif (in_array($ne, ['E2', 'E3', 'E4'], true)) {
                // III-15 b : E-2 = initiateur ET guide de palanquée.
                $apts[] = 'GP';
                $apts[] = $ne;
            }
            // N5 = DP plongeur, ni guide ni enseignant.
        }

        if (in_array('PTH-70', $trimix, true) || in_array('PTH-120', $trimix, true)) $apts[] = 'PTH70';
        if (in_array('PTH-120', $trimix, true)) $apts[] = 'PTH120';

        foreach (self::getFormationBonusAptitudes($diver, $maxEns, $mode) as $a) {
            $apts[] = $a;
        }

        return array_values(array_filter(self::APT_ORDER, function ($a) use ($apts) {
            return in_array($a, $apts, true);
        }));
    }

    // ── Helpers d'aptitude (lib/pal-rules.js) ───────────────────────────────

    /** Niveau enseignant le plus élevé parmi les membres ('E1'..'E4' ou null). */
    public static function getMaxEnsLevel(array $membres): ?string
    {
        $maxIdx = -1;
        foreach ($membres as $m) {
            $idx = array_search(self::aptOf($m), self::ENS_LEVELS, true);
            if ($idx !== false && $idx > $maxIdx) $maxIdx = $idx;
        }
        return $maxIdx >= 0 ? self::ENS_LEVELS[$maxIdx] : null;
    }

    /** PE12/PE20/PE40/PE60 → nombre, sinon null. */
    public static function peLevel(string $apt): ?int
    {
        return preg_match('/^PE(\d+)$/', $apt, $m) ? (int)$m[1] : null;
    }

    /** PA12/PA20/PA40/PA60 → nombre, sinon null. */
    public static function paLevel(string $apt): ?int
    {
        return preg_match('/^PA(\d+)$/', $apt, $m) ? (int)$m[1] : null;
    }

    /** Affichage canonique du nom d'un plongeur. */
    public static function diverFullName(?array $d): string
    {
        $prenom = self::str($d['prenom'] ?? null);
        $nom    = mb_strtoupper(self::str($d['nom'] ?? null), 'UTF-8');
        return trim($prenom . ' ' . $nom);
    }

    /** Vrai si le plongeur justifie au moins la qualification mélange `$req`. */
    public static function hasGasQual(?array $diver, string $req): bool
    {
        return self::gasQualRank($diver) >= (self::GAS_QUAL_RANK[$req] ?? PHP_INT_MAX);
    }

    /**
     * Mode de la palanquée : 'enseignement' ou 'exploration' (A322-75).
     * Baptême → enseignement ; sinon choix explicite du DP ; sinon présence
     * d'un enseignant → enseignement.
     */
    public static function derivePalMode(array $pal): string
    {
        $apts = self::aptitudesOf(self::listOf($pal['membres'] ?? null));
        if (in_array('Baptême', $apts, true)) return 'enseignement';
        $mode = $pal['mode'] ?? null;
        if ($mode === 'enseignement' || $mode === 'exploration') return $mode;
        return array_intersect($apts, self::ENS_LEVELS) ? 'enseignement' : 'exploration';
    }

    /** A322-98 : piscine ou fosse dont la profondeur n'excède pas 6 m. */
    public static function isBassinDerogation(array $answers, float $profMax): bool
    {
        $type = self::getMilieuType(self::strOrNull($answers['milieu'] ?? null));
        if ($type !== 'piscine' && $type !== 'fosse') return false;
        $siteMax = self::num($answers['site_prof_max'] ?? null);
        if ($siteMax > 0) return $siteMax <= self::LIMIT_BASSIN_DEROGATION_MAX;
        // Profondeur inconnue : fosse présumée > 6 m ; piscine ≤ 6 m si la plongée l'est.
        return $type === 'piscine' && $profMax <= self::LIMIT_BASSIN_DEROGATION_MAX;
    }

    // ── Point d'entrée ──────────────────────────────────────────────────────

    /**
     * Validation complète d'une palanquée.
     *
     * @param array      $pal        { membres, profMax, melanges, mode?, o2? }
     * @param array      $diversById diverId → plongeur
     * @param array      $answers    { milieu, date, dp_qual, site_prof_max, ... }
     * @param array|null $dp         plongeur DP { niveau_encadrant, nitrox, trimix }
     * @return list<array{tone:string, code:string, text:string, ref:?string, ids:string[]}>
     */
    public static function validatePal(array $pal, array $diversById, array $answers, ?array $dp): array
    {
        $issues = [];
        $add = function (string $tone, string $code, string $text, ?string $ref = null, array $ids = []) use (&$issues): void {
            $issues[] = ['tone' => $tone, 'code' => $code, 'text' => $text, 'ref' => $ref, 'ids' => array_values($ids)];
        };

        $membres = self::resolveMembres($pal, $diversById);
        if (count($membres) === 0) {
            $add('warn', 'PAL_EMPTY', 'Palanquée vide.');
            return $issues;
        }
        if (count($membres) === 1) {
            $add('err', 'PAL_SOLO', 'Une palanquée compte au moins deux plongeurs.', 'A322-73');
        }
        $sans = array_values(array_filter($membres, function ($m) {
            return self::aptOf($m) === '';
        }));
        if (count($sans) > 0) {
            $add('err', 'APT_MISSING', count($sans) . ' membre(s) sans aptitude sélectionnée — veuillez compléter avant de continuer.', null, self::ids($sans));
            return $issues;
        }
        if (count(self::listOf($pal['melanges'] ?? null)) === 0) {
            $add('warn', 'GAS_NONE', 'Aucun mélange respiratoire sélectionné : la palanquée est considérée à l\'air.');
        }

        $ctx = self::buildContext($pal, $membres, $answers, $dp);
        if (($pal['mode'] ?? null) === 'exploration' && $ctx['mode'] === 'enseignement') {
            $add('warn', 'MODE_BAPTEME', 'Un baptême relève de l\'enseignement : la palanquée est traitée en enseignement.', 'III-16 a');
        } elseif (!self::truthy($pal['mode'] ?? null) && $ctx['encadrant'] !== null
            && in_array(self::aptOf($ctx['encadrant']), self::ENS_LEVELS, true)
            && !in_array('Baptême', self::aptitudesOf($ctx['membres']), true)) {
            $add('warn', 'MODE_IMPLICIT', 'Préciser s\'il s\'agit d\'enseignement ou d\'exploration (traitée en enseignement par défaut).', 'A322-75');
        }
        self::checkAptitudesJustified($ctx, $add);
        self::checkMedical($ctx, $add);
        self::checkAirLimit($ctx, $add);
        self::checkLegacyTrimixRoles($ctx, $add);
        self::checkComposition($ctx, $add);
        self::checkNitroxQuals($ctx, $add);
        self::checkDp($ctx, $add);

        $hasErr = false;
        foreach ($issues as $i) {
            if ($i['tone'] === 'err') { $hasErr = true; break; }
        }
        if (!$hasErr) {
            $type = self::getPalType(self::listOf($pal['membres'] ?? null), $ctx['mode']);
            $labels = ['bapteme' => 'baptême', 'formation' => 'enseignement',
                'guidee' => 'exploration encadrée', 'exploration' => 'exploration en autonomie'];
            $add('ok', 'OK', 'Composition conforme — ' . ($labels[$type] ?? $type) . '.');
        }
        return $issues;
    }

    /**
     * Valide toutes les palanquées d'une plongée. Seules les issues 'err'
     * bloquent (ok=false) ; 'warn' est informatif, 'ok' ignoré.
     * @return array{ok:bool, errors:string[], warnings:string[], issues:array}
     */
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

    // ── Contexte de la palanquée ────────────────────────────────────────────

    private static function resolveMembres(array $pal, array $diversById): array
    {
        $out = [];
        foreach (self::listOf($pal['membres'] ?? null) as $m) {
            if (!is_array($m)) continue;
            if (self::truthy($m['_bapteme'] ?? null)) {
                $m['diver'] = null;
            } else {
                $key = self::str($m['diverId'] ?? null);
                $d   = $diversById[$key] ?? null;
                if (!is_array($d)) continue;
                $m['diver'] = $d;
            }
            $m['_idx'] = count($out); // identité stable (équivalent de !== en JS)
            $out[] = $m;
        }
        return $out;
    }

    private static function buildContext(array $pal, array $membres, array $answers, ?array $dp): array
    {
        $profMax    = self::num($pal['profMax'] ?? null);
        $profMax    = is_nan($profMax) ? 0.0 : $profMax;
        $mode       = self::derivePalMode($pal);
        $candidates = array_values(array_filter($membres, function ($m) {
            return self::isEncadrantRole(self::aptOf($m));
        }));
        $encadrant  = self::pickEncadrant($candidates, $mode);
        $encIdx     = $encadrant === null ? null : $encadrant['_idx'];
        $gas        = self::gasOf($pal);
        return [
            'pal'       => $pal,
            'answers'   => $answers,
            'dp'        => $dp,
            'membres'   => $membres,
            'profMax'   => $profMax,
            'mode'      => $mode,
            'gas'       => $gas,
            // III-17 b / III-18 b : au nitrox et au trimix, l'élève justifie déjà
            // l'aptitude PE de l'espace — pas de « formation vers » l'espace supérieur.
            'bonusMode' => ($mode === 'enseignement' && !$gas['nitrox'] && !$gas['trimix']) ? 'enseignement' : 'exploration',
            'bassin'    => self::isBassinDerogation($answers, $profMax),
            'encadrant' => $encadrant,
            'extras'    => array_values(array_filter($candidates, function ($m) use ($encIdx) {
                return $m['_idx'] !== $encIdx;
            })),
            'encadres'  => array_values(array_filter($membres, function ($m) {
                return !self::isEncadrantRole(self::aptOf($m));
            })),
            'date'      => self::parseDiveDate($answers['date'] ?? null),
        ];
    }

    private static function gasOf(array $pal): array
    {
        $list     = self::listOf($pal['melanges'] ?? null);
        $nx40     = in_array('Nx ≤ 40%', $list, true);
        $nx40plus = in_array('Nx > 40%', $list, true);
        $trimix   = in_array('Tx', $list, true);
        // Nx > 40 % avec un autre gaz = gaz de décompression (pas de MOD).
        $decoNitrox = $nx40plus && (in_array('Air', $list, true) || $nx40 || $trimix);
        return [
            'list'         => $list,
            'nitrox'       => $nx40 || $nx40plus,
            'trimix'       => $trimix,
            'nx40plus'     => $nx40plus,
            'air'          => in_array('Air', $list, true) || count($list) === 0,
            'bottomNitrox' => !$trimix && ($nx40 || ($nx40plus && !$decoNitrox)),
            'bottomO2Max'  => $nx40plus && !$decoNitrox ? 100 : 40,
            'decoNitrox'   => $decoNitrox,
        ];
    }

    /** Encadrant de la palanquée : le plus qualifié pour le mode (1er en cas d'égalité). */
    private static function pickEncadrant(array $candidates, string $mode): ?array
    {
        $score = function (array $m) use ($mode): float {
            if ($mode === 'enseignement') return (float)self::personRank($m);
            return max((float)self::personRank($m), self::isGpQualified($m) ? 2.5 : 0.0);
        };
        $best = null;
        foreach ($candidates as $m) {
            if ($mode === 'enseignement' && !in_array(self::aptOf($m), self::ENS_LEVELS, true)) continue;
            if ($best === null || $score($m) > $score($best)) $best = $m;
        }
        return $best;
    }

    // ── Règles transverses ──────────────────────────────────────────────────

    private static function checkAptitudesJustified(array $ctx, callable $add): void
    {
        $palContext = ['maxEnsLevel' => self::getMaxEnsLevel($ctx['membres']), 'mode' => $ctx['bonusMode']];
        foreach ($ctx['membres'] as $m) {
            if (self::isBapteme($m)) continue;
            $allowed = self::getDiverAptitudes($m['diver'], false, $palContext);
            $apt = self::aptOf($m);
            if (!in_array($apt, $allowed, true)) {
                $add('err', 'APT_NOT_JUSTIFIED',
                    self::memberName($m) . " : aptitude {$apt} non justifiée par ses brevets pour cette palanquée.",
                    'A322-77', [self::memberId($m)]);
            }
        }
    }

    private static function checkMedical(array $ctx, callable $add): void
    {
        foreach ($ctx['membres'] as $m) {
            if (self::isBapteme($m)) continue;
            $medical = $m['diver']['medical'] ?? null;
            if (!self::truthy($medical)) {
                $add('warn', 'MEDICAL_MISSING', self::memberName($m) . ' : date du certificat médical non renseignée.', null, [self::memberId($m)]);
                continue;
            }
            $medical = (string)$medical;
            $issued  = self::parseCalendarDate($medical);
            if ($issued === null || $ctx['date'] === null) continue;
            $expiry = $issued->modify('+1 year');
            if ($expiry < $ctx['date']) {
                $add('err', 'MEDICAL_EXPIRED',
                    'Certificat médical de ' . self::memberName($m) . " expiré (émis le {$medical}, valable jusqu'au " . $expiry->format('d/m/Y') . ').',
                    null, [self::memberId($m)]);
            }
        }
    }

    private static function checkDepthByAptitude(array $ctx, callable $add): void
    {
        foreach ($ctx['encadres'] as $m) {
            $apt   = self::aptOf($m);
            $limit = self::aptitudeMaxDepth($apt);
            if ($ctx['profMax'] > $limit) {
                $add('err', 'APT_DEPTH',
                    "{$apt} de " . self::memberName($m) . " limité à {$limit} m (palanquée à " . self::fmt($ctx['profMax']) . ' m).',
                    'A322-73', [self::memberId($m)]);
            }
        }
    }

    private static function checkAirLimit(array $ctx, callable $add): void
    {
        if ($ctx['gas']['trimix'] && !$ctx['gas']['air']) return;
        if ($ctx['profMax'] > self::LIMIT_AIR_MAX) {
            $add('err', 'AIR_60', "Plongée à l'air ou au nitrox limitée à 60 m (palanquée à " . self::fmt($ctx['profMax']) . ' m).', 'A322-76');
        }
    }

    /**
     * Effectif encadré hors plongeur supplémentaire : un GP / P4 inscrit avec
     * une aptitude PE peut tenir le rôle du (*) s'il n'y a pas déjà d'extra.
     */
    private static function effectifEncadres(array $ctx, array $row): int
    {
        $n = count($ctx['encadres']);
        if (!empty($row['extra']) && count($ctx['extras']) === 0 && $n > $row['max']) {
            foreach ($ctx['encadres'] as $m) {
                if (self::isGpQualified($m)) return $n - 1;
            }
        }
        return $n;
    }

    private static function checkExtras(array $ctx, ?array $row, string $ref, callable $add): void
    {
        $extras = $ctx['extras'];
        if (count($extras) === 0) return;
        if ($row === null || empty($row['extra'])) {
            $add('err', 'EXTRA_NOT_ALLOWED', 'Pas de plongeur supplémentaire dans cet espace d\'évolution.', $ref, self::ids($extras));
            return;
        }
        if (count($extras) > 1) {
            $add('err', 'EXTRA_TOO_MANY', 'Un seul plongeur supplémentaire (GP ou P4) est admis en plus de l\'encadrant.', $ref, self::ids($extras));
        }
        foreach ($extras as $m) {
            if (self::isGpQualified($m)) continue;
            $add('err', 'EXTRA_NOT_GP', self::memberName($m) . ' : le plongeur supplémentaire doit être au minimum GP ou P4.', $ref, [self::memberId($m)]);
        }
        if ($ctx['gas']['nitrox']) {
            foreach ($extras as $m) {
                if (self::hasGasQual($m['diver'], 'PN-C')) continue;
                $add('err', 'EXTRA_NX', self::memberName($m) . ' : plongeur supplémentaire au nitrox → PN-C requis.', 'III-17 b/c', [self::memberId($m)]);
            }
        }
    }

    // ── Air & nitrox en milieu naturel ──────────────────────────────────────

    private static function checkEnseignement(array $ctx, callable $add): void
    {
        $nitrox = $ctx['gas']['nitrox'];
        $table  = $nitrox ? self::NITROX_ENSEIGNEMENT : self::AIR_ENSEIGNEMENT;
        $ref    = $nitrox ? 'III-17 b' : 'III-16 a';
        $space  = self::spaceFor($ctx['profMax'], $table);
        if ($space === null) return;
        $row = $table[$space];
        $enc = $ctx['encadrant'];
        if ($enc === null) {
            $add('err', 'ENS_NO_ENSEIGNANT', 'Enseignement : un enseignant (E1 → E4) doit encadrer la palanquée.', $ref);
        } elseif (self::personRank($enc) < self::ensRank($row['minE'])) {
            $add('err', 'ENS_LEVEL',
                'Enseignement' . ($nitrox ? ' au nitrox' : '') . " dans l'espace 0-{$space} m : encadrant {$row['minE']} minimum (actuellement " . self::aptOf($enc) . ').',
                $ref, [self::memberId($enc)]);
        }
        $encadres = $ctx['encadres'];
        $nEnc     = count($encadres);
        $baptises = array_filter($encadres, function ($m) {
            return self::aptOf($m) === 'Baptême';
        });
        if (count($baptises) > 0) {
            // La profondeur (0-6 m) est contrôlée par APT_DEPTH (aptitude « Baptême »).
            if ($nEnc > ($row['maxBapteme'] ?? 1)) {
                $add('err', 'EFFECTIF_BAPTEME', "Baptême : 1 baptisé par encadrant ({$nEnc} plongeurs encadrés).", $ref, self::ids($encadres));
            }
        } elseif (self::effectifEncadres($ctx, $row) > $row['max']) {
            $add('err', 'EFFECTIF_ENCADRES', "Enseignement : {$row['max']} plongeurs maximum par encadrant ({$nEnc} actuellement).", $ref, self::ids($encadres));
        }
        if ($nitrox) self::checkNitroxEleves($ctx, $space, $ref, $add);
        self::checkExtras($ctx, $row, $ref, $add);
    }

    /** III-17 b : seuls baptêmes et débutants de 0-6 m ne justifient pas d'aptitude PE. */
    private static function checkNitroxEleves(array $ctx, int $space, string $ref, callable $add): void
    {
        $debutants = array_values(array_filter($ctx['encadres'], [self::class, 'isDebutant']));
        if (count($debutants) > 0 && $space > 6) {
            $add('err', 'NX_DEBUTANT', 'Nitrox en enseignement : débutants dans l\'espace de 0 à 6 m uniquement.', $ref, self::ids($debutants));
        }
    }

    private static function checkExplorationEncadree(array $ctx, callable $add): void
    {
        $nitrox = $ctx['gas']['nitrox'];
        $table  = $nitrox ? self::NITROX_EXPLORATION : self::AIR_EXPLORATION;
        $ref    = $nitrox ? 'III-17 c' : 'III-16 b';
        $space  = self::spaceFor($ctx['profMax'], $table);
        if ($space === null) return;
        $row    = $table[$space];
        $enc    = $ctx['encadrant'];
        $encApt = self::aptOf($enc);
        // Compétence de la personne (III-16 b « E3 ou GP ou P4 »), pas seulement du rôle choisi.
        $competent = self::personRank($enc) >= self::ensRank($row['minE']) || ($row['gp'] && self::isGpQualified($enc));
        if (!$competent) {
            $needed = $row['gp'] ? "{$row['minE']}, GP ou P4" : $row['minE'];
            $add('err', 'EXPLO_COMPETENCE',
                "Exploration encadrée dans l'espace 0-{$space} m : encadrant {$needed} minimum (actuellement {$encApt}).",
                $ref, [self::memberId($enc)]);
        }
        $debutants = array_values(array_filter($ctx['encadres'], [self::class, 'isDebutant']));
        if (count($debutants) > 0 && ($nitrox || $ctx['profMax'] > 6)) {
            $add('err', 'DEBUTANT_EXPLO', 'Débutants en exploration : espace de 0 à 6 m, à l\'air uniquement.', $ref, self::ids($debutants));
        }
        $nEnc = count($ctx['encadres']);
        if (self::effectifEncadres($ctx, $row) > $row['max']) {
            $add('err', 'EFFECTIF_ENCADRES', "Exploration encadrée : {$row['max']} plongeurs maximum par encadrant ({$nEnc} actuellement).", $ref, self::ids($ctx['encadres']));
        }
        self::checkExtras($ctx, $row, $ref, $add);
    }

    private static function checkAutonomie(array $ctx, callable $add): void
    {
        $ref = 'III-16 b';
        $encadresOnly = array_values(array_filter($ctx['membres'], function ($m) {
            return self::aptOf($m) === 'Baptême' || self::isDebutant($m);
        }));
        if (count($encadresOnly) > 0) {
            $add('err', 'AUTO_ENCADREMENT', 'Baptême ou débutant : un encadrant est obligatoire.', $ref, self::ids($encadresOnly));
        }
        $pe = array_values(array_filter($ctx['membres'], function ($m) {
            return self::peLevel(self::aptOf($m)) !== null && !self::isDebutant($m);
        }));
        if (count($pe) > 0) {
            $add('err', 'AUTO_PE',
                'Plongeurs encadrés (PE) sans encadrant : un GP ou un enseignant est obligatoire, sinon choisir l\'aptitude PA.',
                $ref, self::ids($pe));
        }
        $n = count($ctx['membres']);
        if ($n > self::AUTONOMIE_MAX) {
            $add('err', 'AUTO_EFFECTIF', "Palanquée autonome : 3 plongeurs maximum ({$n} actuellement).", $ref);
        }
        self::checkAutonomieAges($ctx, $add);
    }

    private static function checkAutonomieAges(array $ctx, callable $add): void
    {
        $trimix = $ctx['gas']['trimix'];
        foreach ($ctx['membres'] as $m) {
            $apt   = self::aptOf($m);
            $level = self::paLevel($apt);
            if ($level === null && strpos($apt, 'PTH') === 0) $level = 60;
            if ($level === null || self::isBapteme($m)) continue;
            $minAge = $trimix ? 18 : (self::AUTONOMIE_AGE_MIN[$level] ?? null);
            $ref    = ($level === 60 || $trimix) ? 'A322-73 / A322-89' : 'A322-73';
            $name   = self::memberName($m);
            $age    = self::ageAt(self::strOrNull($m['diver']['date_naissance'] ?? null), $ctx['date']);
            if ($age === null) {
                $add('warn', 'AGE_UNKNOWN', "{$name} : date de naissance non renseignée — autonomie {$apt} à partir de {$minAge} ans.", $ref, [self::memberId($m)]);
            } elseif ($minAge !== null && $age < $minAge) {
                $add('err', 'AGE_AUTONOMIE', "{$name} ({$age} ans) : autonomie {$apt}" . ($trimix ? ' au trimix' : '') . " à partir de {$minAge} ans.", $ref, [self::memberId($m)]);
            }
        }
    }

    private static function checkNitroxQuals(array $ctx, callable $add): void
    {
        if (!$ctx['gas']['nitrox']) return;
        $space  = self::spaceFor($ctx['profMax'], self::NITROX_ENSEIGNEMENT);
        $ensRow = $space === null ? null : self::NITROX_ENSEIGNEMENT[$space];
        $needPN = $ctx['mode'] !== 'enseignement' || !empty($ensRow['elevePN']);
        foreach ($ctx['encadres'] as $m) {
            if (self::isBapteme($m)) continue;
            $hasPN = self::hasGasQual($m['diver'], 'PN');
            if ($needPN && !$hasPN) {
                $add('err', 'NX_PN', self::memberName($m) . ' : plongée au nitrox → aptitude PN requise.', 'A322-95', [self::memberId($m)]);
            } elseif ($ctx['gas']['nx40plus'] && !self::hasGasQual($m['diver'], 'PN-C')) {
                // PN couvre ≤ 40 % d'O₂ (III-17 a) ; seul un élève PN en formation PN-C est toléré.
                $enFormation = $ctx['mode'] === 'enseignement' && $hasPN;
                $add($enFormation ? 'warn' : 'err', 'NX_PNC', self::memberName($m) . " : nitrox > 40 % d'O₂ → aptitude PN-C.", 'III-17 a', [self::memberId($m)]);
            }
        }
        $enc = $ctx['encadrant'];
        if ($enc !== null && !self::hasGasQual($enc['diver'] ?? null, 'PN-C')) {
            $add('err', 'NX_ENCADRANT', self::memberName($enc) . ' : encadrant au nitrox → PN-C requis.', 'A322-74', [self::memberId($enc)]);
        }
        // Seul le gaz fond est soumis à la MOD : pas le nitrox de décompression
        // (Nx > 40 % avec un autre gaz, ou nitrox au trimix).
        if ($ctx['gas']['bottomNitrox']) self::checkPpO2($ctx, $add);
    }

    /** A322-92 : PpO₂ ≤ 1,6 bar ⇒ profondeur maximale d'utilisation du gaz fond. */
    private static function checkPpO2(array $ctx, callable $add): void
    {
        $o2 = self::num($ctx['pal']['o2'] ?? null);
        // Un O₂ > 40 % avec un Nx ≤ 40 % au fond est celui du gaz de déco.
        if (!($o2 > 21 && $o2 <= $ctx['gas']['bottomO2Max'])) {
            $add('warn', 'O2_UNKNOWN', 'Nitrox : renseigner le % d\'O₂ du gaz fond pour contrôler la profondeur maximale d\'utilisation.', 'A322-92');
            return;
        }
        $mod = (int)floor((self::LIMIT_PPO2_MAX / ($o2 / 100) - 1) * 10 + 1e-9);
        if ($ctx['profMax'] > $mod) {
            $add('err', 'PPO2_MAX',
                'Nitrox ' . self::fmt($o2) . " % : profondeur maximale d'utilisation {$mod} m (PpO₂ 1,6 bar) — palanquée à " . self::fmt($ctx['profMax']) . ' m.',
                'A322-92');
        }
    }

    // ── Trimix / héliox ─────────────────────────────────────────────────────

    private static function checkTrimix(array $ctx, callable $add): void
    {
        $publicInterdit = array_values(array_filter($ctx['membres'], function ($m) {
            return self::aptOf($m) === 'Baptême' || self::isDebutant($m);
        }));
        if (count($publicInterdit) > 0) {
            $add('err', 'TX_PUBLIC', 'Trimix : interdit aux baptêmes et débutants.', 'III-18 a', self::ids($publicInterdit));
        }
        if ($ctx['mode'] === 'enseignement') {
            self::checkTrimixEnseignement($ctx, $add);
        } elseif ($ctx['encadrant'] !== null) {
            self::checkTrimixEncadre($ctx, $add);
        } else {
            self::checkTrimixAutonome($ctx, $add);
        }
    }

    private static function checkTrimixEncadrant(array $ctx, array $row, int $space, string $ref, callable $add): void
    {
        $enc = $ctx['encadrant'];
        if ($enc === null) {
            $add('err', 'ENS_NO_ENSEIGNANT', 'Enseignement : un enseignant (E3 ou E4) doit encadrer la palanquée.', $ref);
            return;
        }
        if (self::personRank($enc) < self::ensRank('E3')) {
            $add('err', 'TX_GP', 'Trimix : un guide de palanquée ne peut pas encadrer (E3 ou E4 requis).', $ref, [self::memberId($enc)]);
        } elseif (self::personRank($enc) < self::ensRank($row['minE'])) {
            $add('err', 'TX_ENCADRANT', "Trimix dans l'espace 0-{$space} m : encadrant {$row['minE']} minimum.", $ref, [self::memberId($enc)]);
        }
        if (!self::hasGasQual($enc['diver'] ?? null, $row['encadrantQual'])) {
            $add('err', 'TX_ENCADRANT_QUAL', self::memberName($enc) . " : encadrant {$row['encadrantQual']} requis.", $ref, [self::memberId($enc)]);
        }
        if (count($ctx['extras']) > 0) {
            $add('err', 'EXTRA_NOT_ALLOWED', 'Trimix : pas de plongeur supplémentaire.', $ref, self::ids($ctx['extras']));
        }
    }

    private static function checkTrimixMembers(array $ctx, int $airMin, string $qual, string $ref, callable $add): void
    {
        $prefix = $ctx['encadrant'] !== null ? 'PE' : 'PA';
        foreach ($ctx['encadres'] as $m) {
            if (self::isBapteme($m) || self::isDebutant($m)) continue;
            if (self::airLevel(self::aptOf($m)) < $airMin) {
                $add('err', 'TX_AIR', self::memberName($m) . " : aptitude {$prefix}-{$airMin} requise.", $ref, [self::memberId($m)]);
            }
            if (!self::hasGasQual($m['diver'], $qual)) {
                $add('err', 'TX_QUAL', self::memberName($m) . " : {$qual} requis.", $ref, [self::memberId($m)]);
            }
        }
    }

    private static function checkTrimixEnseignement(array $ctx, callable $add): void
    {
        $ref   = 'III-18 b';
        $space = self::spaceFor($ctx['profMax'], self::TRIMIX_ENSEIGNEMENT);
        if ($space === null) {
            $add('err', 'TX_DEPTH', 'Encadrement au trimix limité à 80 m.', 'A322-76');
            return;
        }
        $row = self::TRIMIX_ENSEIGNEMENT[$space];
        self::checkTrimixEncadrant($ctx, $row, $space, $ref, $add);
        self::checkTrimixMembers($ctx, $row['eleveAir'], $row['eleveQual'], $ref, $add);
        if (count($ctx['encadres']) > $row['max']) {
            $add('err', 'EFFECTIF_ENCADRES', "Trimix : {$row['max']} plongeurs maximum par encadrant.", $ref, self::ids($ctx['encadres']));
        }
    }

    private static function checkTrimixEncadre(array $ctx, callable $add): void
    {
        $ref   = 'III-18 c';
        $space = self::spaceFor($ctx['profMax'], self::TRIMIX_EXPLORATION);
        if ($space === null) {
            $add('err', 'TX_DEPTH', 'Encadrement au trimix limité à 80 m.', 'A322-76');
            return;
        }
        $row = self::TRIMIX_EXPLORATION[$space];
        self::checkTrimixEncadrant($ctx, $row, $space, $ref, $add);
        self::checkTrimixMembers($ctx, $row['air'], $row['qual'], $ref, $add);
        if (count($ctx['encadres']) > $row['max']) {
            $add('err', 'EFFECTIF_ENCADRES', "Trimix : {$row['max']} plongeurs maximum par encadrant.", $ref, self::ids($ctx['encadres']));
        }
    }

    private static function checkTrimixAutonome(array $ctx, callable $add): void
    {
        $ref   = 'III-18 c';
        $space = self::spaceFor($ctx['profMax'], self::TRIMIX_AUTONOMIE);
        if ($space === null) {
            $add('err', 'TX_DEPTH', 'Plongée autonome au trimix limitée à 120 m.', 'A322-76');
            return;
        }
        $row = self::TRIMIX_AUTONOMIE[$space];
        $pe = array_values(array_filter($ctx['membres'], function ($m) {
            return self::peLevel(self::aptOf($m)) !== null;
        }));
        if (count($pe) > 0) {
            $add('err', 'AUTO_PE', 'Plongeurs encadrés (PE) sans encadrant : choisir l\'aptitude PA ou ajouter un encadrant.', $ref, self::ids($pe));
        }
        self::checkTrimixMembers($ctx, $row['air'], $row['qual'], $ref, $add);
        $n = count($ctx['membres']);
        if ($n > self::AUTONOMIE_MAX) {
            $add('err', 'AUTO_EFFECTIF', "Palanquée autonome : 3 plongeurs maximum ({$n} actuellement).", $ref);
        }
        self::checkAutonomieAges($ctx, $add);
    }

    // ── Piscine / fosse ≤ 6 m (A322-98) ─────────────────────────────────────

    private static function checkBassin(array $ctx, callable $add): void
    {
        $ref       = 'A322-98';
        $membres   = $ctx['membres'];
        $baptises  = array_values(array_filter($membres, function ($m) {
            return self::aptOf($m) === 'Baptême';
        }));
        $debutants = array_values(array_filter($membres, [self::class, 'isDebutant']));
        $canBaptize = false;
        $hasEnseignant = false;
        foreach ($membres as $m) {
            $apt = self::aptOf($m);
            if (self::isEncadrantRole($apt) && (in_array($apt, self::ENS_LEVELS, true) || self::isGpQualified($m))) $canBaptize = true;
            if (self::personRank($m) > 0) $hasEnseignant = true;
        }
        if (count($baptises) > 0 && !$canBaptize) {
            $add('err', 'BASSIN_BAPTEME', 'Baptême en piscine / fosse : un enseignant, un GP ou un P4 doit l\'effectuer.', $ref, self::ids($baptises));
        }
        if (count($debutants) > 0 && $ctx['encadrant'] === null) {
            $add('err', 'BASSIN_DEBUTANT', 'Débutants : un encadrant est requis (seuls les PE-12 peuvent être autonomes).', $ref, self::ids($debutants));
        } elseif (count($debutants) > 0 && $ctx['mode'] === 'enseignement' && !$hasEnseignant) {
            $add('err', 'BASSIN_DEBUTANT', 'Débutants en formation : un enseignant (E1 → E4) est requis.', $ref, self::ids($debutants));
        }
        $nEnc = count($ctx['encadres']);
        if ($ctx['encadrant'] !== null && $nEnc > 4) {
            $add('warn', 'BASSIN_EFFECTIF', "{$nEnc} plongeurs pour un encadrant : au-delà de 4, vérifier que la surveillance reste assurée.", $ref);
        }
    }

    // ── Directeur de plongée (III-15 a, A322-72, A322-98) ────────────────────

    private static function checkDp(array $ctx, callable $add): void
    {
        $level = self::str($ctx['dp']['niveau_encadrant'] ?? null);
        if ($level === '') $level = self::str($ctx['answers']['dp_qual'] ?? null);
        $q = self::DP_QUALIF[$level] ?? null;
        if ($q === null) {
            $add('warn', 'DP_MISSING', 'Directeur de plongée non désigné ou non qualifié.', 'A322-72');
            return;
        }
        if ($ctx['bassin'] && !$q['bassin']) {
            $add('err', 'DP_QUAL_MILIEU', "Piscine / fosse ≤ 6 m : DP enseignant E1 minimum (DP actuel {$level}).", 'A322-98');
        } elseif (!$ctx['bassin'] && !$q['naturel']) {
            $add('err', 'DP_QUAL_MILIEU', "Milieu naturel (ou fosse > 6 m) : DP P5/DPE, E3 (MF1) ou E4 (MF2) — DP actuel {$level}.", 'III-15 a');
        }
        if ($ctx['mode'] === 'enseignement' && !$q['enseignement']) {
            $add('err', 'DP_MODE', "Un DP {$level} ne dirige que des plongées d'exploration.", 'III-15 a');
        }
        if ($ctx['gas']['nitrox'] && !self::hasGasQual($ctx['dp'], 'PN-C')) {
            $add('err', 'DP_GAS', 'Plongée au nitrox : le DP doit justifier PN-C.', 'A322-72');
        }
        if ($ctx['gas']['trimix']) self::checkDpTrimix($ctx, $q, $level, $add);
    }

    private static function checkDpTrimix(array $ctx, array $q, string $level, callable $add): void
    {
        if ($q['trimix'] === null) {
            $add('err', 'DP_GAS', "Plongée au trimix : DP E3 (MF1) ou E4 (MF2) requis — DP actuel {$level}.", 'III-15 a');
        } else {
            $max = $q['trimix'][$ctx['mode'] === 'enseignement' ? 'enseignement' : 'exploration'];
            if ($ctx['profMax'] > $max) {
                $add('err', 'DP_DEPTH', "DP {$level} : trimix en {$ctx['mode']} limité à {$max} m (palanquée à " . self::fmt($ctx['profMax']) . ' m).', 'III-15 a');
            }
        }
        if (!self::hasGasQual($ctx['dp'], 'PTH-120')) {
            $add('err', 'DP_GAS', 'Plongée au trimix : le DP doit justifier PTH-120.', 'A322-72');
        }
    }

    // ── Aiguillage ──────────────────────────────────────────────────────────

    private static function checkComposition(array $ctx, callable $add): void
    {
        if ($ctx['bassin']) {
            self::checkBassin($ctx, $add);
            return;
        }
        if ($ctx['gas']['trimix']) {
            self::checkTrimix($ctx, $add);
            return;
        }
        self::checkDepthByAptitude($ctx, $add);
        if ($ctx['mode'] === 'enseignement') {
            self::checkEnseignement($ctx, $add);
        } elseif ($ctx['encadrant'] !== null) {
            self::checkExplorationEncadree($ctx, $add);
        } else {
            self::checkAutonomie($ctx, $add);
        }
    }

    private static function checkLegacyTrimixRoles(array $ctx, callable $add): void
    {
        if ($ctx['gas']['trimix']) return;
        $pth = array_values(array_filter($ctx['membres'], function ($m) {
            $apt = self::aptOf($m);
            return $apt === 'PTH70' || $apt === 'PTH120';
        }));
        if (count($pth) > 0) {
            $add('err', 'TX_ROLE_NO_GAS', 'Aptitude PTH choisie sans mélange trimix déclaré pour la palanquée.', 'A322-96', self::ids($pth));
        }
    }

    // ── Helpers privés ──────────────────────────────────────────────────────

    private static function airLevel(string $apt): int
    {
        if ($apt === 'PTH70' || $apt === 'PTH120') return 60;
        $pe = self::peLevel($apt);
        if ($pe !== null) return $pe;
        $pa = self::paLevel($apt);
        return $pa !== null ? $pa : 0;
    }

    private static function isEncadrantRole(string $apt): bool
    {
        return $apt === 'GP' || in_array($apt, self::ENS_LEVELS, true);
    }

    private static function ensRank(string $apt): int
    {
        return self::ENS_RANK[$apt] ?? 0;
    }

    /** Niveau d'enseignement de la PERSONNE (rôle choisi ou brevet détenu). */
    private static function personRank(array $m): int
    {
        $ne = is_array($m['diver'] ?? null) ? self::str($m['diver']['niveau_encadrant'] ?? null) : '';
        return max(self::ensRank(self::aptOf($m)), self::ensRank($ne));
    }

    private static function isBapteme(array $m): bool
    {
        return self::truthy($m['_bapteme'] ?? null);
    }

    private static function memberName(array $m): string
    {
        return self::isBapteme($m) ? self::diverFullName($m) : self::diverFullName($m['diver'] ?? null);
    }

    private static function memberId(array $m): string
    {
        if (self::isBapteme($m)) return self::truthy($m['id'] ?? null) ? (string)$m['id'] : '';
        if (self::truthy($m['diverId'] ?? null)) return (string)$m['diverId'];
        return self::truthy($m['id'] ?? null) ? (string)$m['id'] : '';
    }

    /** @return string[] */
    private static function ids(array $membres): array
    {
        return array_values(array_map([self::class, 'memberId'], $membres));
    }

    private static function isDebutant(array $m): bool
    {
        if (self::isBapteme($m) || !is_array($m['diver'] ?? null)) return false;
        return !self::truthy($m['diver']['niveau_plongeur'] ?? null) && !self::truthy($m['diver']['niveau_encadrant'] ?? null);
    }

    private static function gasQualRank(?array $diver): int
    {
        if ($diver === null) return 0;
        $quals = array_merge(self::listOf($diver['nitrox'] ?? null), self::listOf($diver['trimix'] ?? null));
        $max = 0;
        foreach ($quals as $q) {
            $max = max($max, is_string($q) ? (self::GAS_QUAL_RANK[$q] ?? 0) : 0);
        }
        return $max;
    }

    /** GP ou P4 au minimum (III-15 b : un E-2 est initiateur ET guide de palanquée). */
    private static function isGpQualified(array $m): bool
    {
        if (in_array(self::aptOf($m), ['GP', 'E2', 'E3', 'E4'], true)) return true;
        $d = is_array($m['diver'] ?? null) ? $m['diver'] : [];
        return in_array(self::str($d['niveau_encadrant'] ?? null), ['N4', 'E2', 'E3', 'E4'], true)
            || in_array('GP', self::listOf($d['aptitudes_sup'] ?? null), true);
    }

    /** Plus petit espace d'évolution du tableau qui contient `$profMax`. */
    private static function spaceFor(float $profMax, array $table): ?int
    {
        $keys = array_keys($table);
        sort($keys, SORT_NUMERIC);
        foreach ($keys as $k) {
            if ($profMax <= $k) return (int)$k;
        }
        return null;
    }

    /** Âge révolu à la date `$when` (anniversaire non passé → -1), sur dates calendaires. */
    private static function ageAt(?string $birthIso, ?DateTimeImmutable $when): ?int
    {
        if ($birthIso === null || $birthIso === '' || $when === null) return null;
        $b = self::parseCalendarDate($birthIso);
        if ($b === null) return null;
        $age = (int)$when->format('Y') - (int)$b->format('Y');
        $wm = (int)$when->format('n');
        $bm = (int)$b->format('n');
        if ($wm < $bm || ($wm === $bm && (int)$when->format('j') < (int)$b->format('j'))) $age -= 1;
        return $age;
    }

    /** Date de plongée (YYYY-MM-DDTHH:mm, heure locale) ; absente → maintenant ; invalide → null. */
    private static function parseDiveDate($raw): ?DateTimeImmutable
    {
        if (!self::truthy($raw)) return new DateTimeImmutable('now');
        if (!is_string($raw)) return null;
        try {
            return new DateTimeImmutable($raw);
        } catch (\Exception $e) {
            return null;
        }
    }

    /** Date calendaire (YYYY-MM-DD…) à minuit local ; invalide → null. */
    private static function parseCalendarDate(string $raw): ?DateTimeImmutable
    {
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $raw, $p)) {
            if (!checkdate((int)$p[2], (int)$p[3], (int)$p[1])) return null;
            return new DateTimeImmutable(sprintf('%04d-%02d-%02d 00:00:00', $p[1], $p[2], $p[3]));
        }
        try {
            return (new DateTimeImmutable($raw))->setTime(0, 0);
        } catch (\Exception $e) {
            return null;
        }
    }

    /** Équivalent de Number(x) en JS (NaN si non numérique). */
    private static function num($v): float
    {
        if ($v === null || $v === false) return 0.0;
        if ($v === true) return 1.0;
        if (is_int($v) || is_float($v)) return (float)$v;
        if (is_string($v)) {
            $t = trim($v);
            if ($t === '') return 0.0;
            return is_numeric($t) ? (float)$t : NAN;
        }
        return NAN;
    }

    /** Affichage d'un nombre comme en JS (30 et non 30.0). */
    private static function fmt(float $n): string
    {
        if (is_finite($n) && floor($n) === $n && abs($n) < 1e15) return (string)(int)$n;
        return (string)$n;
    }

    /** Vérité « à la JS » (null, '', false, 0 → faux ; '0' → vrai). */
    private static function truthy($v): bool
    {
        return !($v === null || $v === false || $v === '' || $v === 0 || $v === 0.0);
    }

    private static function str($v): string
    {
        return is_string($v) ? $v : ((is_int($v) || is_float($v)) ? (string)$v : '');
    }

    private static function strOrNull($v): ?string
    {
        $s = self::str($v);
        return $s === '' ? null : $s;
    }

    private static function listOf($v): array
    {
        return is_array($v) ? array_values($v) : [];
    }

    private static function aptOf($m): string
    {
        return is_array($m) ? self::str($m['aptitude'] ?? null) : '';
    }

    /** @return string[] */
    private static function aptitudesOf(array $membres): array
    {
        return array_map([self::class, 'aptOf'], $membres);
    }
}
