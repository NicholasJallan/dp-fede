<?php
declare(strict_types=1);

/**
 * Traduction tolérante des niveaux et qualifications saisis dans un fichier
 * d'import (CSV club, export VPDive…) vers le modèle de DP Assistant :
 *   niveau_plongeur  : N1 | N2 | N3 | null
 *   niveau_encadrant : N4 | N5 | E1 | E2 | E3 | E4 | null
 *   nitrox           : [] | ['PN'] | ['PN','PN-C']
 *   trimix           : [] | ['PTH-40'] | ['PTH-40','PTH-70'] | ['PTH-40','PTH-70','PTH-120']
 *
 * Règles (cf. docs/import-plongeurs.md) :
 *   - N1/P1/« Niveau 1 »/« Plongeur N1 »/1 → N1 (idem 2, 3) ; 4/GP → N4 ; 5/DP → N5 ;
 *   - BPJEPS → E2 ; MF1, BEES1, DEJEPS → E3 ; MF2, BEES2, DESJEPS → E4 ;
 *   - Initiateur → E2 si le plongeur est aussi GP (N4/N5), sinon E1 ;
 *   - plusieurs niveaux dans une cellule (« N4 / Initiateur ») : on retient le
 *     plus élevé de chaque catégorie ;
 *   - le niveau plongeur d'un encadrant suit la règle du formulaire
 *     (plongeurForEncadrant) : E1 → N2 (N3 si N3 indiqué), autres → N3.
 *
 * Fonctions pures.
 */
class LevelMapper
{
    private const PLONGEUR_RANK  = ['N1' => 1, 'N2' => 2, 'N3' => 3];
    // Un seul niveau encadrant est stocké : on garde le plus « fort ».
    private const ENCADRANT_RANK = ['E1' => 1, 'N4' => 2, 'E2' => 3, 'N5' => 4, 'E3' => 5, 'E4' => 6];

    private const ENCADRANT_WORDS = [
        'GP' => 'N4', 'GUIDE' => 'N4', 'GUIDEDEPALANQUEE' => 'N4',
        'DP' => 'N5', 'DIRECTEURDEPLONGEE' => 'N5',
        'MF1' => 'E3', 'MONITEURFEDERAL1' => 'E3', 'MONITEURFEDERAL1ER' => 'E3',
        'MONITEURFEDERAL1ERDEGRE' => 'E3', 'MONITEURFEDERALPREMIERDEGRE' => 'E3',
        'BPJEPS' => 'E2', 'BEES1' => 'E3', 'DEJEPS' => 'E3',
        'MF2' => 'E4', 'MONITEURFEDERAL2' => 'E4', 'MONITEURFEDERAL2EME' => 'E4',
        'MONITEURFEDERAL2EMEDEGRE' => 'E4', 'MONITEURFEDERALDEUXIEMEDEGRE' => 'E4',
        'BEES2' => 'E4', 'BEES3' => 'E4', 'DESJEPS' => 'E4',
    ];

    private const INITIATEUR_WORDS = ['INITIATEUR', 'INITIATRICE', 'INIT', 'INITIATEURCLUB', 'INITIATEURDECLUB'];

    private const EMPTY_WORDS = ['', 'AUCUN', 'AUCUNE', 'DEBUTANT', 'DEBUTANTE', 'BAPTEME', 'SANS', 'NON', 'NEANT', 'NA', 'N/A', '0'];

    private const YES_WORDS = ['OUI', 'O', 'X', 'YES', 'Y', '1', 'TRUE', 'VRAI'];

    // ── Niveaux ────────────────────────────────────────────────────────────

    /**
     * @return array{niveau_plongeur:?string, niveau_encadrant:?string, errors: string[], warnings: string[]}
     */
    public static function mapLevels(?string $niveau, ?string $niveauEncadrant = null): array
    {
        $plongeur   = null;
        $encadrant  = null;
        $initiateur = false;
        $errors     = [];
        $warnings   = [];

        $raws = array_filter([(string)$niveau, (string)$niveauEncadrant], static fn(string $s): bool => trim($s) !== '');
        foreach ($raws as $raw) {
            foreach (self::tokens($raw) as $token) {
                $r = self::classifyLevelToken($token);
                if ($r === null) {
                    $errors[] = 'Niveau non reconnu : « ' . trim($raw) . ' »';
                    continue 2;
                }
                [$kind, $value] = $r;
                $currentRank = $plongeur !== null ? self::PLONGEUR_RANK[$plongeur] : 0;
                if ($kind === 'plongeur' && self::PLONGEUR_RANK[$value] > $currentRank) {
                    $plongeur = $value;
                } elseif ($kind === 'encadrant') {
                    $encadrant = self::strongerEncadrant($encadrant, $value);
                } elseif ($kind === 'initiateur') {
                    $initiateur = true;
                } elseif ($kind === 'aptitude') {
                    $warnings[] = "Aptitude « {$value} » ignorée : saisir le brevet (N1, N2…)";
                }
            }
        }

        if ($initiateur) {
            $isGp = in_array($encadrant, ['N4', 'N5'], true);
            $init = $isGp ? 'E2' : 'E1';
            $before = $encadrant;
            $encadrant = self::strongerEncadrant($encadrant, $init);
            if ($before === 'N5' && $encadrant === 'N5') {
                $warnings[] = 'Initiateur et N5 : un seul niveau encadrant est conservé (N5)';
            }
        }

        if ($encadrant !== null) {
            $plongeur = self::plongeurForEncadrant($encadrant, $plongeur);
        }

        return [
            'niveau_plongeur'  => $plongeur,
            'niveau_encadrant' => $encadrant,
            'errors'           => array_values(array_unique($errors)),
            'warnings'         => array_values(array_unique($warnings)),
        ];
    }

    /** Même règle que le formulaire plongeur (src/components/diver-form.jsx). */
    public static function plongeurForEncadrant(?string $encadrant, ?string $plongeur): ?string
    {
        if ($encadrant === 'E1') return $plongeur === 'N3' ? 'N3' : 'N2';
        return $encadrant ? 'N3' : $plongeur;
    }

    private static function strongerEncadrant(?string $a, string $b): string
    {
        if ($a === null) return $b;
        return self::ENCADRANT_RANK[$b] > self::ENCADRANT_RANK[$a] ? $b : $a;
    }

    /** @return array{0:string,1:string}|null [catégorie, valeur] */
    private static function classifyLevelToken(string $t): ?array
    {
        if (in_array($t, self::EMPTY_WORDS, true)) return ['none', ''];
        if (in_array($t, self::INITIATEUR_WORDS, true)) return ['initiateur', 'E1'];
        if (isset(self::ENCADRANT_WORDS[$t])) return ['encadrant', self::ENCADRANT_WORDS[$t]];

        if (preg_match('/^(?:E|ENCADRANT|ENCADRANTE)([1-4])$/', $t, $m)) {
            return ['encadrant', 'E' . $m[1]];
        }
        if (preg_match('/^(?:N|P|NIV|NIVEAU|PLONGEUR|PLONGEURN|PLONGEURNIVEAU|PLONGEURP)?([1-5])$/', $t, $m)) {
            $n = (int)$m[1];
            if ($n <= 3) return ['plongeur', 'N' . $n];
            return ['encadrant', $n === 4 ? 'N4' : 'N5'];
        }
        if (preg_match('/^P[AE]\d{2}$/', $t)) {
            return ['aptitude', substr($t, 0, 2) . '-' . substr($t, 2)];
        }
        return null;
    }

    // ── Qualifications gaz ─────────────────────────────────────────────────

    /**
     * @return array{value: string[], error: ?string}
     */
    public static function mapNitrox(?string $raw): array
    {
        $out = [];
        foreach (self::tokens((string)$raw) as $t) {
            if (in_array($t, self::EMPTY_WORDS, true)) continue;
            if (in_array($t, ['PNC', 'NITROXCONFIRME', 'PLONGEURNITROXCONFIRME', 'CONFIRME', 'MONITEURNITROX', 'MFNITROX'], true)) {
                return ['value' => ['PN', 'PN-C'], 'error' => null];
            }
            if (in_array($t, ['PN', 'NITROX', 'PLONGEURNITROX', 'NITROXELEMENTAIRE'], true) || in_array($t, self::YES_WORDS, true)) {
                $out = ['PN'];
                continue;
            }
            return ['value' => [], 'error' => 'Qualification nitrox non reconnue : « ' . trim((string)$raw) . ' »'];
        }
        return ['value' => $out, 'error' => null];
    }

    /**
     * @return array{value: string[], error: ?string}
     */
    public static function mapTrimix(?string $raw): array
    {
        $ladder = ['PTH-40', 'PTH-70', 'PTH-120'];
        $best   = -1;
        foreach (self::tokens((string)$raw) as $t) {
            if (in_array($t, self::EMPTY_WORDS, true)) continue;
            if (!preg_match('/^(?:PTH|TRIMIX|TX|TMX|PLONGEURTRIMIX|TRIMIXHYPOXIQUE|PLONGEURTRIMIXHYPOXIQUE)?(120|70|40)$/', $t, $m)) {
                return ['value' => [], 'error' => 'Qualification trimix non reconnue (attendu PTH-40, PTH-70 ou PTH-120) : « ' . trim((string)$raw) . ' »'];
            }
            $best = max($best, array_search('PTH-' . $m[1], $ladder, true));
        }
        return ['value' => $best < 0 ? [] : array_slice($ladder, 0, $best + 1), 'error' => null];
    }

    // ── Normalisation ──────────────────────────────────────────────────────

    /**
     * Découpe une cellule en jetons normalisés (majuscules, sans accents ni
     * espaces/ponctuation). Séparateurs : / , ; + | « et ».
     *
     * @return string[]
     */
    public static function tokens(string $raw): array
    {
        $s = trim(self::fold($raw));
        if ($s === '' || in_array($s, ['N/A', 'NA', '-', '—', '/'], true)) return [''];
        $parts = preg_split('/\s*(?:[\/,;+|&()]|\sET\s)\s*/', $s) ?: [];
        $out   = [];
        foreach ($parts as $p) {
            $out[] = preg_replace('/[^A-Z0-9]/', '', $p) ?? '';
        }
        return $out;
    }

    /** Majuscules sans accents (translittération indépendante de la locale). */
    public static function fold(string $s): string
    {
        static $map = [
            'à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'å' => 'a',
            'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
            'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ì' => 'i', 'ñ' => 'n',
            'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ò' => 'o', 'õ' => 'o',
            'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y',
            'œ' => 'oe', 'æ' => 'ae', '°' => '', 'º' => '',
        ];
        return mb_strtoupper(strtr(mb_strtolower($s), $map));
    }
}
