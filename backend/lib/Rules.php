<?php
declare(strict_types=1);

/**
 * Règles métier FFESSM / Code du Sport.
 * Portées depuis data.js et lib/pal-rules.js.
 * Source légale : Code du Sport Art. A322-72 à A322-97, MFT FFESSM.
 */
class Rules
{
    // ── Tables de référence ────────────────────────────────────────────────

    private const DP_DEPTH_RULES = [
        'E1' => ['formation' => 6,  'exploration' => 0],
        'E2' => ['formation' => 20, 'exploration' => 0],
        'E3' => ['formation' => 40, 'exploration' => 60],
        'E4' => ['formation' => 60, 'exploration' => 60],
        'N5' => ['formation' => 0,  'exploration' => 60],
    ];

    private const ENS_LEVELS = ['E1', 'E2', 'E3', 'E4'];

    private const APT_MAX_DEPTH = [
        'Baptême' => 6,
        'PE20' => 20, 'PE40' => 40, 'PE60' => 60,
        'PA12' => 12, 'PA20' => 20, 'PA40' => 40, 'PA60' => 60,
        'GP'   => 60,
        'E1'   => 6,  'E2'   => 20, 'E3'   => 40, 'E4'   => 60,
        'PTH70' => 70, 'PTH120' => 120,
    ];

    private const APT_ORDER = [
        'Baptême', 'PE20', 'PE40', 'PE60',
        'PA12', 'PA20', 'PA40', 'PA60',
        'PTH70', 'PTH120', 'GP', 'E1', 'E2', 'E3', 'E4',
    ];

    // ── Helpers milieu / aptitude ──────────────────────────────────────────

    /** Normalise en 'mer' | 'lac' | 'piscine' | 'fosse'. */
    public static function getMilieuType(?string $milieu): string
    {
        if (!$milieu) return 'mer';
        $m = mb_strtolower($milieu);
        if (str_contains($m, 'lac') || str_contains($m, 'carrière') || str_contains($m, 'carriere')) return 'lac';
        if (str_contains($m, 'piscine')) return 'piscine';
        if (str_contains($m, 'fosse'))   return 'fosse';
        return 'mer';
    }

    /** Profondeur max pour une aptitude (mètres). Fallback 60 pour aptitude inconnue. */
    public static function aptitudeMaxDepth(string $aptitude): int
    {
        return self::APT_MAX_DEPTH[$aptitude] ?? 60;
    }

    /** Type de palanquée : 'bapteme' | 'formation' | 'guidee' | 'exploration'. */
    public static function getPalType(array $membres): string
    {
        $apts = array_column($membres, 'aptitude');
        if (in_array('Baptême', $apts, true)) return 'bapteme';
        if (array_intersect(self::ENS_LEVELS, $apts)) return 'formation';
        if (in_array('GP', $apts, true) && array_filter($apts, fn($a) => str_starts_with((string)$a, 'PE'))) return 'guidee';
        return 'exploration';
    }

    /**
     * Profondeur max du DP pour un type de palanquée.
     * Retourne 0 si le type est interdit pour ce DP.
     * @param string $palType 'formation'|'bapteme'|'exploration'|'guidee'
     * @param array|null $dp  ['niveau_encadrant' => string, 'trimix' => string[]]
     */
    public static function getDpMaxDepth(string $palType, ?array $dp): int
    {
        $ne    = $dp['niveau_encadrant'] ?? '';
        $rules = self::DP_DEPTH_RULES[$ne] ?? ['formation' => 0, 'exploration' => 0];
        $isTraining = ($palType === 'formation' || $palType === 'bapteme');
        $base  = $isTraining ? ($rules['formation'] ?? 0) : ($rules['exploration'] ?? 0);
        $pth120 = in_array('PTH-120', (array)($dp['trimix'] ?? []), true);
        if (!$pth120) return $base;
        if ($isTraining) {
            if ($ne === 'E4') return max($base, 80);
            return $base; // E3 : pas d'extension PTH-120 en formation
        }
        if ($ne === 'E3') return max($base, 70);
        if ($ne === 'E4') return max($base, 120);
        return $base;
    }

    /** Plafond effectif de profondeur (min de toutes les contraintes). */
    public static function computePalHardLimit(
        array $membres,
        ?array $dp,
        int $sessionMax = PHP_INT_MAX,
        ?int $siteMax   = null
    ): int {
        if (empty($membres)) return $sessionMax;
        $aptLimit = min(array_map(fn($m) => self::aptitudeMaxDepth($m['aptitude'] ?? ''), $membres));
        $palType  = self::getPalType($membres);
        $dpLimit  = self::getDpMaxDepth($palType, $dp) ?: PHP_INT_MAX;
        $site     = $siteMax ?? PHP_INT_MAX;
        return (int) min($aptLimit, $sessionMax, $dpLimit, $site);
    }

    // ── Aptitudes plongeur ─────────────────────────────────────────────────

    /** Bonus aptitude en formation selon niveau enseignant de la palanquée. */
    public static function getFormationBonusAptitudes(array $diver, ?string $maxEnsLevel): array
    {
        if (!$maxEnsLevel) return [];
        $np = $diver['niveau_plongeur']  ?? null;
        $ne = $diver['niveau_encadrant'] ?? null;
        if ($ne) return [];
        if ($np === 'N1' && in_array($maxEnsLevel, ['E3', 'E4'], true)) return ['PE40'];
        if ($np === 'N2' && $maxEnsLevel === 'E4')                      return ['PE60'];
        return [];
    }

    /** Aptitudes disponibles pour un plongeur, triées dans l'ordre canonique. */
    public static function getDiverAptitudes(array $diver, bool $isExploration = false, ?array $palContext = null): array
    {
        $np  = $diver['niveau_plongeur']  ?? null;
        $ne  = $diver['niveau_encadrant'] ?? null;
        $trimix = (array)($diver['trimix']        ?? []);
        $sup    = (array)($diver['aptitudes_sup'] ?? []);
        $maxEns = $palContext['maxEnsLevel'] ?? null;
        $apts   = [];

        if (!$np && !$ne) return ['Baptême', 'PE20'];

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

        if ($ne) {
            array_push($apts, 'PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60');
            if ($ne === 'N4') {
                $apts[] = 'GP';
            } elseif ($ne === 'N5') {
                // N5 = DP plongeur, pas guide ni encadrant
            } elseif (in_array($ne, ['E1', 'E2'], true)) {
                if (in_array('GP', $sup, true)) $apts[] = 'GP';
                $apts[] = $ne;
            } elseif (in_array($ne, ['E3', 'E4'], true)) {
                $apts[] = 'GP';
                $apts[] = $ne;
            }
        }

        if (in_array('PTH-70', $trimix, true) || in_array('PTH-120', $trimix, true)) $apts[] = 'PTH70';
        if (in_array('PTH-120', $trimix, true)) $apts[] = 'PTH120';

        foreach (self::getFormationBonusAptitudes($diver, $maxEns) as $a) {
            $apts[] = $a;
        }

        $apts = array_unique($apts);
        return array_values(array_filter(self::APT_ORDER, fn($a) => in_array($a, $apts, true)));
    }

    // ── Validation palanquée ───────────────────────────────────────────────

    /**
     * Valide une palanquée. Retourne une liste d'issues {tone, text}.
     * @param array $pal        Palanquée {membres, profMax, melanges, ...}
     * @param array $diversById Map diverId → diver complet (depuis DB)
     * @param array $answers    Réponses session (milieu, date, dp_qual, ...)
     * @param array|null $dp    Plongeur DP (avec niveau_encadrant, nitrox, trimix)
     * @return list<array{tone:'err'|'warn', text:string}>
     */
    public static function validatePal(array $pal, array $diversById, array $answers, ?array $dp): array
    {
        $issues  = [];
        $rawMbrs = $pal['membres'] ?? [];

        // Résoudre les membres (garder les baptêmes, résoudre les diverId)
        $membres = array_values(array_filter(array_map(function ($m) use ($diversById) {
            if (!empty($m['_bapteme'])) return $m;
            $dId = $m['diverId'] ?? '';
            return isset($diversById[$dId]) ? array_merge($m, ['diver' => $diversById[$dId]]) : null;
        }, $rawMbrs)));

        if (empty($membres)) {
            return [['tone' => 'warn', 'text' => 'Palanquée vide.']];
        }
        if (count($membres) === 1) {
            $issues[] = ['tone' => 'err', 'text' => 'Palanquée de 1 personne interdite (toujours par binôme minimum).'];
        }
        if (count($membres) > 6) {
            $issues[] = ['tone' => 'err', 'text' => 'Max 6 personnes par palanquée.'];
        }

        $apts     = array_map(fn($m) => (string)($m['aptitude'] ?? ''), $membres);
        $milieu   = self::getMilieuType($answers['milieu'] ?? null);
        $profMax  = (int)($pal['profMax'] ?? 0);

        // Aptitudes manquantes : bloquant (les règles suivantes seraient non fiables)
        $sans = array_filter($membres, fn($m) => empty($m['aptitude']));
        if ($sans) {
            $n = count($sans);
            $issues[] = ['tone' => 'err', 'text' => "{$n} membre(s) sans aptitude sélectionnée — veuillez compléter avant de continuer."];
            return $issues;
        }

        // Catégories
        $gpMembers   = array_filter($membres, fn($m) => ($m['aptitude'] ?? '') === 'GP');
        $ensMembers  = array_filter($membres, fn($m) => in_array($m['aptitude'] ?? '', self::ENS_LEVELS, true));
        $peMembers   = array_filter($membres, fn($m) => self::peLevel($m['aptitude'] ?? '') !== null);
        $paMembers   = array_filter($membres, fn($m) => self::paLevel($m['aptitude'] ?? '') !== null);
        $baptMembers = array_filter($membres, fn($m) => ($m['aptitude'] ?? '') === 'Baptême');

        // Profondeur max par aptitude
        foreach ($membres as $m) {
            $apt   = $m['aptitude'] ?? '';
            $limit = self::aptitudeMaxDepth($apt);
            if ($profMax > $limit) {
                $name = !empty($m['_bapteme']) ? ($m['prenom'] ?? '?') : self::memberName($m);
                $issues[] = ['tone' => 'err', 'text' => "{$apt} de {$name} limité à {$limit} m (palanquée à {$profMax} m)."];
            }
        }

        // ── Règles GP ─────────────────────────────────────────────────────
        if (!empty($gpMembers)) {
            $otherApts = array_values(array_filter($apts, fn($a) => $a !== 'GP'));
            $invalid = array_filter($otherApts, function ($a) {
                $pe = self::peLevel($a);
                return $pe === null || $pe > 40;
            });
            if (!empty($invalid)) {
                $issues[] = ['tone' => 'err', 'text' => "GP : seuls PE20/PE40 sont autorisés pour les encadrés. Pas de PE60, pas de PA, pas d'enseignant."];
            }
            $peLevelsSet = array_unique(array_map(fn($m) => self::peLevel($m['aptitude'] ?? ''), $peMembers));
            if (count($peLevelsSet) > 1) {
                $issues[] = ['tone' => 'err', 'text' => 'GP : tous les encadrés doivent avoir la même prérogative (PE20 ou PE40, pas un mélange).'];
            }
            $peLevelsArr = array_filter(array_map(fn($m) => self::peLevel($m['aptitude'] ?? ''), $peMembers));
            $maxPE = $peLevelsArr ? max($peLevelsArr) : 0;
            if ($maxPE && $profMax > $maxPE) {
                $issues[] = ['tone' => 'err', 'text' => "GP avec PE{$maxPE} : profondeur max {$maxPE} m."];
            }
            if (count($membres) === 6) {
                $lastApt = end($membres)['aptitude'] ?? '';
                if (!in_array($lastApt, ['GP', 'E3', 'E4'], true)) {
                    $issues[] = ['tone' => 'err', 'text' => 'Serre-file (6e) doit être GP, E3 ou E4.'];
                }
                $highEns = count(array_filter($ensMembers, fn($m) => in_array($m['aptitude'] ?? '', ['E3', 'E4'], true)));
                if (count($gpMembers) + $highEns < 2) {
                    $issues[] = ['tone' => 'err', 'text' => 'Palanquée à 6 : 2 encadrants minimum (GP + serre-file).'];
                }
            }
            if (count($peMembers) > 4) {
                $n = count($peMembers);
                $issues[] = ['tone' => 'err', 'text' => "GP : max 4 encadrés ({$n} actuellement)."];
            }
        }

        // ── Règles enseignants E1/E2/E3/E4 ────────────────────────────────
        if (!empty($ensMembers)) {
            if (count($membres) > 5) {
                $n = count($membres);
                $issues[] = ['tone' => 'err', 'text' => "Palanquée formation : max 5 personnes ({$n} actuellement)."];
            }
            if (!empty($paMembers)) {
                $issues[] = ['tone' => 'err', 'text' => 'Palanquée formation : aptitudes PA non autorisées (utiliser PE).'];
            }
            $peLevelsSet = array_unique(array_filter(array_map(fn($m) => self::peLevel($m['aptitude'] ?? ''), $peMembers)));
            if (count($peLevelsSet) > 1) {
                $issues[] = ['tone' => 'err', 'text' => 'Formation : pas de panachage PE20/PE40/PE60 dans une même palanquée.'];
            }
            if (in_array('E1', $apts, true)) {
                if ($milieu !== 'piscine') $issues[] = ['tone' => 'err', 'text' => 'E1 : formation/baptême uniquement en piscine.'];
                if ($profMax > 6)          $issues[] = ['tone' => 'err', 'text' => 'E1 : profondeur max 6 m.'];
                if (count($baptMembers) > 2) $issues[] = ['tone' => 'err', 'text' => 'E1 : max 2 baptisés à la fois.'];
            }
            if (in_array('E2', $apts, true)) {
                if (!in_array($milieu, ['fosse', 'piscine'], true)) {
                    $issues[] = ['tone' => 'err', 'text' => 'E2 : enseignement limité piscine ou fosse.'];
                }
                if ($profMax > 20) $issues[] = ['tone' => 'err', 'text' => 'E2 : profondeur max 20 m.'];
            }
            if (in_array('E3', $apts, true) && !in_array('E4', $apts, true)) {
                if ($profMax > 40) $issues[] = ['tone' => 'err', 'text' => 'E3 (formation) : profondeur max 40 m. Pour PE60, un E4 est requis.'];
                if (in_array('PE60', $apts, true)) $issues[] = ['tone' => 'err', 'text' => 'E3 : ne peut pas encadrer un PE60. Seul un E4 le peut.'];
            }
            if (in_array('E4', $apts, true)) {
                if ($profMax > 60) $issues[] = ['tone' => 'err', 'text' => 'E4 (formation) : profondeur max 60 m (sauf PTH).'];
            }
        }

        // ── Limite DP ──────────────────────────────────────────────────────
        $palTypeForDp = self::getPalType($rawMbrs);
        $dpMaxDepth   = self::getDpMaxDepth($palTypeForDp, $dp);
        if ($dpMaxDepth > 0 && $profMax > $dpMaxDepth) {
            $ctxLabel = in_array($palTypeForDp, ['formation', 'bapteme'], true) ? 'formation' : 'exploration';
            $dpQual   = $answers['dp_qual'] ?? '?';
            $issues[] = ['tone' => 'err', 'text' => "DP {$dpQual} : {$ctxLabel} max {$dpMaxDepth} m (palanquée à {$profMax} m)."];
        } elseif ($dpMaxDepth === 0) {
            $dpQual = $answers['dp_qual'] ?? '?';
            $issues[] = ['tone' => 'err', 'text' => "DP {$dpQual} ne peut pas diriger une palanquée de type {$palTypeForDp}."];
        }

        // ── PE sans encadrement ────────────────────────────────────────────
        if (!empty($peMembers) && empty($gpMembers) && empty($ensMembers)) {
            if (!empty($paMembers)) {
                $issues[] = ['tone' => 'err', 'text' => "Panachage PE + PA sans encadrement : une palanquée est soit encadrée (GP ou Enseignant), soit 100 % autonome."];
            } else {
                $issues[] = ['tone' => 'err', 'text' => 'Plongeurs encadrés (PE) sans encadrement : un GP ou un Enseignant (E1→E4) est obligatoire.'];
            }
        }

        // ── Règles PA autonomes ────────────────────────────────────────────
        if (!empty($paMembers) && empty($gpMembers) && empty($ensMembers)) {
            if (count($paMembers) > 3) {
                $n = count($paMembers);
                $issues[] = ['tone' => 'err', 'text' => "Palanquée PA : max 3 plongeurs autonomes ({$n} actuellement)."];
            }
            $paLevelsSet = array_unique(array_filter(array_map(fn($m) => self::paLevel($m['aptitude'] ?? ''), $paMembers)));
            if (count($paLevelsSet) > 1) {
                $issues[] = ['tone' => 'err', 'text' => 'Palanquée PA : pas de panachage des prérogatives PA12/PA20/PA40.'];
            }
            if (!empty($baptMembers)) {
                $issues[] = ['tone' => 'err', 'text' => 'Baptême : un encadrant E1→E4 est obligatoire.'];
            }
        }

        // ── Règles Baptême ─────────────────────────────────────────────────
        if (!empty($baptMembers)) {
            $enc = array_filter($membres, fn($m) => in_array($m['aptitude'] ?? '', self::ENS_LEVELS, true));
            if (empty($enc)) {
                $issues[] = ['tone' => 'err', 'text' => 'Baptême : un encadrant E1→E4 est obligatoire.'];
            } else {
                $hasE1E2 = (bool)array_filter($enc, fn($m) => in_array($m['aptitude'] ?? '', ['E1', 'E2'], true));
                $hasE3E4 = (bool)array_filter($enc, fn($m) => in_array($m['aptitude'] ?? '', ['E3', 'E4'], true));
                if ($hasE1E2 && !$hasE3E4 && in_array($milieu, ['mer', 'lac'], true)) {
                    $issues[] = ['tone' => 'err', 'text' => 'Baptême en milieu naturel (mer/lac) : encadrant E3 ou E4 requis.'];
                }
            }
            if ($profMax > 6) $issues[] = ['tone' => 'err', 'text' => 'Baptême : profondeur max 6 m.'];
        }

        // ── Licenciés débutants ────────────────────────────────────────────
        $debutants = array_filter($membres, function ($m) {
            if (!empty($m['_bapteme'])) return false;
            $d = $m['diver'] ?? null;
            return $d && empty($d['niveau_plongeur']) && empty($d['niveau_encadrant']);
        });
        if (!empty($debutants)) {
            if (empty($ensMembers)) {
                $issues[] = ['tone' => 'err', 'text' => 'Licencié débutant : un enseignant E1→E4 est obligatoire (plongée de formation).'];
            }
            foreach ($debutants as $m) {
                $apt = $m['aptitude'] ?? '';
                if ($apt && !in_array($apt, ['Baptême', 'PE20'], true)) {
                    $name = self::memberName($m);
                    $issues[] = ['tone' => 'err', 'text' => "Débutant {$name} : aptitude limitée à Baptême ou PE20."];
                }
            }
        }

        // ── Certificats médicaux ───────────────────────────────────────────
        $eventDate = !empty($answers['date']) ? new DateTime($answers['date']) : new DateTime();
        foreach ($membres as $m) {
            if (!empty($m['_bapteme'])) continue;
            $d = $m['diver'] ?? null;
            if (!$d || empty($d['medical'])) continue;
            try {
                $medDate = new DateTime($d['medical']);
                $expiry  = clone $medDate;
                $expiry->modify('+1 year');
                if ($expiry < $eventDate) {
                    $name   = self::memberName($m);
                    $issued = $medDate->format('d/m/Y');
                    $exp    = $expiry->format('d/m/Y');
                    $issues[] = ['tone' => 'err', 'text' => "Certificat médical de {$name} expiré (émis le {$issued}, valable jusqu'au {$exp})."];
                }
            } catch (\Throwable $e) {
                // Date invalide ignorée — ne pas bloquer la validation
            }
        }

        // ── Mélanges respiratoires ─────────────────────────────────────────
        $mlx = (array)($pal['melanges'] ?? []);
        if (empty($mlx)) {
            $issues[] = ['tone' => 'warn', 'text' => 'Aucun mélange respiratoire sélectionné pour cette palanquée.'];
        }

        $dpNitrox  = (array)($dp['nitrox'] ?? []);
        $dpTrimix  = (array)($dp['trimix'] ?? []);
        $dpNe      = $dp['niveau_encadrant'] ?? '';
        $dpHasPNC  = in_array('PN-C', $dpNitrox, true);
        $dpHasPTH  = in_array('PTH-120', $dpTrimix, true);

        if ((in_array('Nx ≤ 40%', $mlx, true) || in_array('Nx > 40%', $mlx, true)) && !$dpHasPNC) {
            $issues[] = ['tone' => 'err', 'text' => 'Mélange Nitrox sélectionné : le DP doit être PN-C.'];
        }
        if (in_array('Tx', $mlx, true)) {
            if (!$dpHasPTH) {
                $issues[] = ['tone' => 'err', 'text' => 'Mélange Trimix sélectionné : le DP doit être PTH-120.'];
            }
            if (!in_array($dpNe, ['E3', 'E4'], true)) {
                $issues[] = ['tone' => 'err', 'text' => 'Mélange Trimix sélectionné : le DP doit être E3 ou E4 (E1/E2 interdits).'];
            }
            // Plongeurs non qualifiés pour le trimix
            $trimixForbidden = array_filter($membres, function ($m) {
                if (!empty($m['_bapteme'])) return true;
                $d  = $m['diver'] ?? null;
                if (!$d) return false;
                $np = $d['niveau_plongeur'] ?? null;
                $ne = $d['niveau_encadrant'] ?? null;
                return !$ne && $np !== 'N3';
            });
            if (!empty($trimixForbidden)) {
                $names = implode(', ', array_map(fn($m) => self::memberName($m), $trimixForbidden));
                $issues[] = ['tone' => 'err', 'text' => "Trimix interdit pour N1, N2, débutants et baptêmes : {$names}."];
            }
            if (in_array('GP', $apts, true)) {
                $issues[] = ['tone' => 'err', 'text' => 'Plongée avec GP (palanquée guidée) : Trimix interdit.'];
            }
        }

        // Qualifications individuelles vs mélanges (exploration/guidée)
        $palType = self::getPalType($rawMbrs);
        if (in_array($palType, ['exploration', 'guidee'], true)) {
            $needsPN  = in_array('Nx ≤ 40%', $mlx, true);
            $needsPNC = in_array('Nx > 40%', $mlx, true);
            $needsPTH = in_array('Tx', $mlx, true);
            foreach ($membres as $m) {
                if (!empty($m['_bapteme'])) continue;
                $d = $m['diver'] ?? null;
                if (!$d) continue;
                $nx   = (array)($d['nitrox'] ?? []);
                $tx   = (array)($d['trimix'] ?? []);
                $name = self::memberName($m);
                $hasPN  = in_array('PN', $nx, true)  || in_array('PN-C', $nx, true);
                $hasPNC = in_array('PN-C', $nx, true);
                $hasPTH = in_array('PTH-70', $tx, true) || in_array('PTH-120', $tx, true);
                if ($needsPN  && !$hasPN)  $issues[] = ['tone' => 'err', 'text' => "{$name} : Nx ≤ 40 % nécessite la qualification PN."];
                if ($needsPNC && !$hasPNC) $issues[] = ['tone' => 'err', 'text' => "{$name} : Nx > 40 % nécessite la qualification PN-C."];
                if ($needsPTH && !$hasPTH) $issues[] = ['tone' => 'err', 'text' => "{$name} : Trimix nécessite la qualification PTH."];
            }
        }

        return $issues;
    }

    // ── Validation complète d'une plongée ──────────────────────────────────

    /**
     * Valide toutes les palanquées d'une plongée.
     * @return array{ok:bool, errors:string[], warnings:string[]}
     */
    public static function validateDive(array $palanquees, array $diversById, array $answers, ?array $dp): array
    {
        $errors   = [];
        $warnings = [];
        foreach ($palanquees as $i => $pal) {
            $label  = 'P' . ($i + 1);
            $issues = self::validatePal($pal, $diversById, $answers, $dp);
            foreach ($issues as $issue) {
                $msg = "{$label} : {$issue['text']}";
                if ($issue['tone'] === 'err')  $errors[]   = $msg;
                if ($issue['tone'] === 'warn') $warnings[] = $msg;
            }
        }
        return ['ok' => empty($errors), 'errors' => $errors, 'warnings' => $warnings];
    }

    // ── Helpers privés ─────────────────────────────────────────────────────

    private static function peLevel(string $apt): ?int
    {
        return preg_match('/^PE(\d+)$/', $apt, $m) ? (int)$m[1] : null;
    }

    private static function paLevel(string $apt): ?int
    {
        return preg_match('/^PA(\d+)$/', $apt, $m) ? (int)$m[1] : null;
    }

    private static function memberName(array $m): string
    {
        if (!empty($m['_bapteme'])) {
            return trim(($m['prenom'] ?? '') . ' ' . mb_strtoupper($m['nom'] ?? ''));
        }
        $d = $m['diver'] ?? null;
        if (!$d) return '?';
        return trim(($d['prenom'] ?? '') . ' ' . mb_strtoupper($d['nom'] ?? ''));
    }
}
