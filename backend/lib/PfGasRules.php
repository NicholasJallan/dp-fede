<?php
declare(strict_types=1);

/**
 * Polynésie française : plongée à l'oxygène et aux mélanges autres que l'air
 * (arrêté n° 199 CM, art. 27 à 37, annexes V, VI, XII à XV).
 * Portage de src/domain/pf/pf-gas-rules.js ; appelé par PfRules avec le
 * contexte de la palanquée et le collecteur d'issues.
 */
final class PfGasRules
{
    private const float PPO2_MAX = 1.6;        // art. 29
    private const float PPN2_MAX_NITROX = 5.0; // art. 30
    private const float PPN2_MAX_TRIMIX = 4.0; // art. 31
    private const int HYPOXIQUE = 16;          // annexe VI
    public const array TRIMIX_SPACES = [50, 70, 80, 100, 120];
    public const int TRIMIX_MAX = 120;         // art. 4

    /** Annexe XIV — exploration (et autonomie : PA-50 + le PTH de la ligne). */
    private const array TX_EXPLORATION = [
        50  => ['apt' => ['PE-50', 'PA-40'], 'gaz' => ['PN-C', 'PTH-50'], 'pth' => 'PTH-50', 'max' => 4, 'dp' => 'DP-70'],
        70  => ['apt' => ['PA-50'], 'gaz' => ['PTH-70'], 'pth' => 'PTH-70', 'max' => 2, 'dp' => 'DP-70'],
        80  => ['apt' => ['PA-50'], 'gaz' => ['PTH-100'], 'pth' => 'PTH-100', 'max' => 2, 'dp' => 'DP-100'],
        100 => ['apt' => ['PA-50'], 'gaz' => ['PTH-100'], 'pth' => 'PTH-100', 'max' => 2, 'dp' => 'DP-100'],
        120 => ['apt' => ['PA-50'], 'gaz' => ['PTH-120'], 'pth' => 'PTH-120', 'max' => 2, 'dp' => 'DP-120'],
    ];

    /** Annexe XV — formation (2 élèves au plus). */
    private const array TX_FORMATION = [
        50  => ['apt' => ['PE-50', 'PA-40'], 'gaz' => ['PN-C'], 'pth' => 'PTH-70', 'dp' => 'DP-70'],
        70  => ['apt' => ['PA-50'], 'gaz' => ['PN-C'], 'pth' => 'PTH-100', 'dp' => 'DP-100'],
        80  => ['apt' => ['PA-50'], 'gaz' => ['PN-C'], 'pth' => 'PTH-100', 'dp' => 'DP-100'],
        100 => ['apt' => ['PA-50'], 'gaz' => ['PN-C'], 'pth' => 'PTH-100', 'dp' => 'DP-120'],
        120 => ['apt' => ['PA-50'], 'gaz' => ['PN-C'], 'pth' => 'PTH-120', 'dp' => 'DP-120'],
    ];
    private const int TX_FORMATION_MAX = 2;

    // ── Nitrox ──────────────────────────────────────────────────────────────

    /** Espace maximal d'un élève en formation au nitrox : son aptitude air (annexe XIII). */
    public static function nitroxEleveMax(string $role): int
    {
        if ($role === 'Débutant' || $role === 'Baptême') return 6;
        return PfRoles::airLevel($role);
    }

    public static function checkNitrox(array $ctx, callable $add): void
    {
        $pnc  = $ctx['gas']['nx40plus'];
        $bapt = array_values(array_filter($ctx['membres'], static fn(array $m): bool => $m['_bapteme'] || $m['aptitude'] === 'Baptême'));
        if ($bapt) $add('err', 'PF_NX_BAPTEME', 'Pas de baptême au nitrox.', 'ann. XIII', PfRoles::ids($bapt));

        if ($ctx['mode'] === 'enseignement') {
            $qual = $ctx['space'] === 6 && !$pnc ? 'PN' : 'PN-C';
            $ens  = $ctx['enseignant'];
            if ($ens !== null && !in_array($qual, $ens['profile']['gaz'], true)) {
                $add('err', 'PF_NX_ENCADRANT', PfRoles::memberName($ens) . " : enseignant au nitrox → aptitude {$qual} requise.",
                    'ann. XIII', [PfRoles::memberId($ens)]);
            }
            self::checkNitroxDp($ctx, $qual, 'ann. XIII', $add);
            return;
        }
        $qual = $pnc ? 'PN-C' : 'PN';
        foreach ($ctx['membres'] as $m) {
            if ($m['_bapteme'] || PfRoles::isEncadrantRole($m['aptitude'])) continue;
            if (!in_array('PN', $m['profile']['gaz'], true)) {
                $add('err', 'PF_NX_PN', PfRoles::memberName($m) . ' : plongée au nitrox → aptitude PN requise.', 'ann. V', [PfRoles::memberId($m)]);
            } elseif ($pnc && !in_array('PN-C', $m['profile']['gaz'], true)) {
                $add('err', 'PF_NX_PNC', PfRoles::memberName($m) . " : nitrox > 40 % d'O₂ → aptitude PN-C requise.", 'ann. V', [PfRoles::memberId($m)]);
            }
        }
        $guide = $ctx['guide'];
        if ($guide !== null && !in_array($qual, $guide['profile']['gaz'], true)) {
            $add('err', 'PF_NX_ENCADRANT', PfRoles::memberName($guide) . " : guide de palanquée au nitrox → aptitude {$qual} requise.",
                'ann. XII', [PfRoles::memberId($guide)]);
        }
        self::checkNitroxDp($ctx, $qual, 'ann. XII', $add);
    }

    private static function checkNitroxDp(array $ctx, string $qual, string $ref, callable $add): void
    {
        if ($ctx['dpProfile'] !== null && !in_array($qual, $ctx['dpProfile']['gaz'], true)) {
            $add('err', 'PF_NX_DP', "Plongée au nitrox : le directeur de plongée justifie l'aptitude {$qual}.", $ref);
        }
    }

    // ── Trimix et héliox ────────────────────────────────────────────────────

    public static function checkTrimix(array $ctx, callable $add): void
    {
        $public = array_values(array_filter($ctx['membres'], static fn(array $m): bool => $m['_bapteme'] || PfRoles::isNovice($m['aptitude'])));
        if ($public) {
            $add('err', 'PF_TX_PUBLIC', 'Trimix : interdit aux baptêmes et aux débutants.', 'ann. XIV', PfRoles::ids($public));
            return;
        }
        if ($ctx['profMax'] > self::TRIMIX_MAX) {
            $add('err', 'PF_TX_120', 'Trimix ou héliox : ' . PfRoles::fmt($ctx['profMax']) . ' m dépasse le maximum de 120 m.', 'art. 4');
            return;
        }
        if ($ctx['space'] === null) return;
        if ($ctx['mode'] === 'enseignement') {
            self::trimixFormation($ctx, $add);
        } elseif (array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude']))) {
            self::trimixExploration($ctx, $add);
        } else {
            self::trimixAutonomie($ctx, $add);
        }
    }

    private static function checkTxQual(array $ctx, array $plongeurs, array $apt, array $gaz, string $ref, callable $add): void
    {
        $hypoxique = self::known($ctx['pal']['o2'] ?? null) && (float)$ctx['pal']['o2'] < self::HYPOXIQUE;
        $missing   = array_values(array_filter($plongeurs, static fn(array $m): bool =>
            !PfRoles::hasAll($m['profile'], $apt, $gaz) || ($hypoxique && !PfRoles::hasAll($m['profile'], [], ['PTH-100']))));
        if ($missing) {
            $req = implode(', ', [...$apt, ...$gaz, ...($hypoxique ? ['PTH-100 (mélange hypoxique)'] : [])]);
            $add('err', 'PF_TX_QUAL',
                implode(', ', PfRoles::names($missing)) . " : aptitudes requises dans l'espace 0-{$ctx['space']} m : {$req}.",
                $ref, PfRoles::ids($missing));
        }
    }

    private static function checkTxDp(array $ctx, string $required, string $ref, callable $add): void
    {
        if ($ctx['dpProfile'] === null) {
            $add('warn', 'DP_MISSING', 'Directeur de plongée non désigné.', 'LP 8');
        } elseif (!PfRoles::hasDp($ctx['dpProfile'], $required)) {
            $add('err', 'PF_TX_DP', "Trimix dans l'espace 0-{$ctx['space']} m : directeur de plongée {$required} au minimum.", $ref);
        }
    }

    private static function trimixExploration(array $ctx, callable $add): void
    {
        $row        = self::TX_EXPLORATION[$ctx['space']];
        $encadrants = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude'])));
        $encadres   = array_values(array_filter($ctx['membres'], static fn(array $m): bool => !PfRoles::isEncadrantRole($m['aptitude'])));
        $guide      = $ctx['guide'];
        if ($guide === null) {
            $add('err', 'PF_GP_REQUIRED', 'En exploration, la palanquée est encadrée par un guide de palanquée (GP-50 au trimix).',
                'ann. XIV', PfRoles::ids($encadrants));
        } else {
            if (PfRoles::gpLevel($guide['aptitude']) < 50) {
                $add('err', 'PF_GP_LEVEL', 'Trimix : guide de palanquée GP-50 requis.', 'ann. XIV', [PfRoles::memberId($guide)]);
            }
            if (!in_array($row['pth'], $guide['profile']['gaz'], true)) {
                $add('err', 'PF_TX_ENCADRANT',
                    PfRoles::memberName($guide) . " : guide au trimix dans l'espace 0-{$ctx['space']} m → aptitude {$row['pth']} requise.",
                    'ann. XIV', [PfRoles::memberId($guide)]);
            }
        }
        self::checkTxQual($ctx, $encadres, $row['apt'], $row['gaz'], 'ann. XIV', $add);
        $effectif = count($encadres) + count($encadrants) - ($guide !== null ? 1 : 0);
        if ($effectif > $row['max']) {
            $add('err', 'PF_EFFECTIF',
                "Trimix 0-{$ctx['space']} m : {$row['max']} plongeurs encadrés au plus ({$effectif} dans la palanquée).",
                'ann. XIV', PfRoles::ids($encadres));
        }
        self::checkTxDp($ctx, $row['dp'], 'ann. XIV', $add);
    }

    private static function trimixAutonomie(array $ctx, callable $add): void
    {
        $row = self::TX_EXPLORATION[$ctx['space']];
        $pe  = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::level($m['aptitude'], 'PE') > 0));
        if ($pe) {
            $add('err', 'PF_ENCADRANT_REQUIRED',
                implode(', ', PfRoles::names($pe)) . ' : aptitude PE, plongée encadrée par un guide de palanquée.',
                'ann. XIV', PfRoles::ids($pe));
        }
        $n = count($ctx['membres']);
        if ($n > 3) {
            $add('err', 'PF_AUTONOMIE_EFFECTIF', "Plongée en autonomie : 3 plongeurs au plus ({$n} dans la palanquée).",
                'ann. XIV', PfRoles::ids($ctx['membres']));
        }
        $autonomes = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::level($m['aptitude'], 'PA') > 0));
        self::checkTxQual($ctx, $autonomes, ['PA-50'], [$row['pth']], 'ann. XIV', $add);
        foreach ($autonomes as $m) {
            $birth = $m['diver']['date_naissance'] ?? null;
            $age   = PfRoles::ageAt(is_string($birth) && $birth !== '' ? $birth : null, $ctx['date']);
            if ($age === null) {
                $add('warn', 'AGE_UNKNOWN', PfRoles::memberName($m) . ' : date de naissance non renseignée — autonomie réservée aux majeurs.',
                    'LP 4', [PfRoles::memberId($m)]);
            } elseif ($age < 18) {
                $add('err', 'PF_AUTONOMIE_MAJEUR', PfRoles::memberName($m) . " ({$age} ans) : les mineurs ne plongent pas en autonomie.",
                    'LP 4', [PfRoles::memberId($m)]);
            }
        }
        self::checkTxDp($ctx, $row['dp'], 'ann. XIV', $add);
    }

    private static function trimixFormation(array $ctx, callable $add): void
    {
        $row        = self::TX_FORMATION[$ctx['space']];
        $encadrants = array_values(array_filter($ctx['membres'], static fn(array $m): bool => PfRoles::isEncadrantRole($m['aptitude'])));
        $eleves     = array_values(array_filter($ctx['membres'], static fn(array $m): bool => !PfRoles::isEncadrantRole($m['aptitude'])));
        $ens        = $ctx['enseignant'];
        if ($ens === null) {
            $add('err', 'PF_ENS_REQUIRED', 'Formation au trimix : enseignant ENS-50 requis.', 'ann. XV', PfRoles::ids($encadrants));
        } else {
            if (PfRoles::ensLevel($ens['aptitude']) < 50) {
                $add('err', 'PF_ENS_LEVEL', 'Formation au trimix : enseignant ENS-50 requis.', 'ann. XV', [PfRoles::memberId($ens)]);
            }
            if (!in_array($row['pth'], $ens['profile']['gaz'], true)) {
                $add('err', 'PF_TX_ENCADRANT',
                    PfRoles::memberName($ens) . " : enseignant au trimix dans l'espace 0-{$ctx['space']} m → aptitude {$row['pth']} requise.",
                    'ann. XV', [PfRoles::memberId($ens)]);
            }
        }
        self::checkTxQual($ctx, $eleves, $row['apt'], $row['gaz'], 'ann. XV', $add);
        $effectif = count($eleves) + count($encadrants) - ($ens !== null ? 1 : 0);
        if ($effectif > self::TX_FORMATION_MAX) {
            $add('err', 'PF_EFFECTIF',
                'Formation au trimix : ' . self::TX_FORMATION_MAX . " élèves au plus ({$effectif} dans la palanquée).",
                'ann. XV', PfRoles::ids($eleves));
        }
        self::checkTxDp($ctx, $row['dp'], 'ann. XV', $add);
    }

    // ── Pressions partielles du gaz fond (art. 29 à 31) ─────────────────────

    public static function checkPressures(array $ctx, callable $add): void
    {
        $gas = $ctx['gas'];
        if (!$gas['trimix'] && !$gas['bottomNitrox']) return;
        $pal     = $ctx['pal'];
        $profMax = $ctx['profMax'];
        if (!self::known($pal['o2'] ?? null)) {
            self::o2Unknown($add);
            if ($gas['trimix']) self::ppn2Unknown($add);
            return;
        }
        $o2 = (float)$pal['o2'];
        if ($o2 >= 100) {
            $add('err', 'O2_PUR_FOND',
                'Oxygène pur : utilisable en recycleur ou en décompression, pas comme gaz fond en circuit ouvert.', 'art. 27');
        }
        if ($gas['trimix'] || ($o2 > 21 && $o2 <= $gas['bottomO2Max'])) {
            $mod = (int)floor((self::PPO2_MAX / ($o2 / 100) - 1) * 10 + 1e-9);
            if ($profMax > $mod) {
                $add('err', 'PPO2_MAX',
                    'Mélange à ' . PfRoles::fmt($o2) . " % d'O₂ : profondeur maximale d'utilisation {$mod} m (PpO₂ 1,6 bar) — palanquée à "
                    . PfRoles::fmt($profMax) . ' m.', 'art. 29');
            }
        } elseif ($o2 < 100) {
            self::o2Unknown($add);
        }
        $bars = $profMax / 10 + 1;
        if ($gas['trimix']) {
            if (!self::known($pal['he'] ?? null)) {
                self::ppn2Unknown($add);
                return;
            }
            $ppn2 = (1 - $o2 / 100 - (float)$pal['he'] / 100) * $bars;
            if ($ppn2 > self::PPN2_MAX_TRIMIX + 1e-9) {
                $add('err', 'PF_PPN2', 'Trimix : PpN₂ de ' . number_format($ppn2, 2, '.', '') . ' bar à ' . PfRoles::fmt($profMax) . ' m (4 bar au plus).', 'art. 31');
            }
            return;
        }
        $ppn2 = (1 - $o2 / 100) * $bars;
        if ($ppn2 > self::PPN2_MAX_NITROX + 1e-9) {
            $add('err', 'PF_PPN2', 'Nitrox : PpN₂ de ' . number_format($ppn2, 2, '.', '') . ' bar à ' . PfRoles::fmt($profMax) . ' m (5 bar au plus).', 'art. 30');
        }
    }

    private static function o2Unknown(callable $add): void
    {
        $add('warn', 'O2_UNKNOWN', "Renseigner le % d'O₂ du gaz fond pour contrôler la profondeur maximale d'utilisation.", 'art. 29');
    }

    private static function ppn2Unknown(callable $add): void
    {
        $add('warn', 'PF_PPN2_UNKNOWN', "Trimix : renseigner le % d'hélium pour contrôler la PpN₂ (4 bar au plus).", 'art. 31');
    }

    private static function known(mixed $v): bool
    {
        return is_numeric($v) && (float)$v > 0;
    }
}
