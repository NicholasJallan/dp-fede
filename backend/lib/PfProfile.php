<?php
declare(strict_types=1);

/**
 * Profil d'un plongeur au sens de la réglementation de la Polynésie française
 * (loi du pays n° 2017-44, arrêté n° 199 CM) : aptitudes PE/PA, mélanges et
 * fonctions ENS/GP/DP. Déduits des champs FFESSM par les annexes I, II, III,
 * VII, VIII et IX ; la saisie du DP (`pf`) prime (art. LP 13).
 * Portage de src/domain/pf/pf-profile.js : cas communs dans
 * tests/fixtures/pf-equivalences.json (PfProfileTest, tests/pf-profile.test.js).
 */
final class PfProfile
{
    public const array APTITUDES = ['PE-12', 'PE-20', 'PE-30', 'PE-40', 'PE-50', 'PA-12', 'PA-20', 'PA-30', 'PA-40', 'PA-50'];
    public const array GAZ = ['PN', 'PN-C', 'PTH-50', 'PTH-70', 'PTH-100', 'PTH-120'];
    public const array FONCTIONS = [
        'ENS-06', 'ENS-20', 'ENS-30', 'ENS-40', 'ENS-50',
        'GP-40', 'GP-50',
        'DP-40', 'DP-60', 'DP-70', 'DP-100', 'DP-120',
    ];
    /** Diplômes plongée de la liste d'homologation (arrêté n° 2391 CM du 01/12/2025). */
    public const array DIPLOMES = ['BPJEPS', 'DEJEPS', 'DEJEPS-E4', 'DESJEPS', 'BEES1', 'BEES2', 'BEES3', 'BPP-GAPPN'];

    /** Annexes VII et VIII, colonne FFESSM (P2 : PA-40 sans PA-30, lettre de l'annexe VIII). */
    private const array APTITUDES_PAR_NIVEAU = [
        'N1' => ['PE-12', 'PE-20'],
        'N2' => ['PE-12', 'PE-20', 'PE-30', 'PE-40', 'PA-12', 'PA-20', 'PA-40'],
        'N3' => self::APTITUDES,
    ];

    private const array APTITUDES_PAR_QUALIF = [
        'PA12' => ['PA-12'],
        'PA20' => ['PA-20'],
        'PA40' => ['PA-30'],
        'PE40' => ['PE-30', 'PE-40', 'PA-40'],
        'PE60' => ['PE-50', 'PA-50'],
    ];

    /** Annexes V et IX. */
    private const array GAZ_PAR_QUALIF = [
        'PN'      => ['PN'],
        'PN-C'    => ['PN', 'PN-C'],
        'PTH-40'  => ['PTH-50'],
        'PTH-70'  => ['PTH-50', 'PTH-70'],
        'PTH-120' => ['PTH-50', 'PTH-70', 'PTH-100', 'PTH-120'],
    ];

    private const array MF1 = [
        'fonctions'    => ['ENS-06', 'ENS-20', 'ENS-30', 'GP-40', 'DP-40', 'DP-60'],
        'dpTrimixMax'  => 70,
    ];
    private const array MF2 = [
        'fonctions'    => ['ENS-06', 'ENS-20', 'ENS-30', 'ENS-40', 'ENS-50', 'GP-40', 'GP-50', 'DP-40', 'DP-60'],
        'dpTrimixMax'  => 120,
    ];

    /** Annexes I, II, III ; DP-70 / 100 / 120 selon le trimix (annexe I, notes 2 à 4). */
    private const array FONCTIONS_PAR_NIVEAU = [
        'N4' => ['fonctions' => ['GP-40'], 'dpTrimixMax' => 0],
        'N5' => ['fonctions' => ['GP-40', 'DP-40'], 'dpTrimixMax' => 0],
        'E1' => ['fonctions' => ['ENS-06'], 'dpTrimixMax' => 0],
        'E2' => ['fonctions' => ['ENS-06', 'ENS-20', 'GP-40'], 'dpTrimixMax' => 0],
        'E3' => self::MF1,
        'E4' => self::MF2,
    ];

    private const array FONCTIONS_PAR_DIPLOME = [
        'BPJEPS'    => ['fonctions' => ['ENS-06', 'ENS-20', 'GP-40'], 'dpTrimixMax' => 0],
        'BEES1'     => self::MF1,
        'DEJEPS'    => self::MF1,
        'DEJEPS-E4' => self::MF2,
        'BEES2'     => self::MF2,
        'DESJEPS'   => self::MF2,
    ];

    /**
     * @return array{aptitudes: list<string>, gaz: list<string>, fonctions: list<string>, diplome_homologue: ?string}
     */
    public static function fromFr(array $diver): array
    {
        $aptitudes = self::APTITUDES_PAR_NIVEAU[self::niveauPlongeur($diver)] ?? [];
        foreach (self::strings($diver['aptitudes_sup'] ?? null) as $q) {
            $aptitudes = [...$aptitudes, ...(self::APTITUDES_PAR_QUALIF[$q] ?? [])];
        }
        $gaz = [];
        foreach ([...self::strings($diver['nitrox'] ?? null), ...self::strings($diver['trimix'] ?? null)] as $q) {
            $gaz = [...$gaz, ...(self::GAZ_PAR_QUALIF[$q] ?? [])];
        }
        $gaz = self::ordered(self::GAZ, $gaz);

        $fonctions = [];
        $sources   = [
            self::FONCTIONS_PAR_NIVEAU[(string)($diver['niveau_encadrant'] ?? '')] ?? null,
            self::FONCTIONS_PAR_DIPLOME[(string)($diver['diplome_pro'] ?? '')] ?? null,
        ];
        foreach (array_filter($sources) as $s) {
            $fonctions = [...$fonctions, ...$s['fonctions'], ...self::trimixDps($gaz, $s['dpTrimixMax'])];
        }

        $diplome = $diver['diplome_pro'] ?? null;
        return [
            'aptitudes'         => self::ordered(self::APTITUDES, $aptitudes),
            'gaz'               => $gaz,
            'fonctions'         => self::ordered(self::FONCTIONS, $fonctions),
            'diplome_homologue' => in_array($diplome, self::DIPLOMES, true) ? $diplome : null,
        ];
    }

    /** Profil effectif : la saisie (pf) prime liste par liste ; une liste vide retombe sur la déduction. */
    public static function effective(array $diver): array
    {
        $pf      = is_array($diver['pf'] ?? null) ? $diver['pf'] : [];
        $derived = self::fromFr($diver);
        $pick    = static function (string $key, array $codes) use ($pf, $derived): array {
            $saisie = self::ordered($codes, self::strings($pf[$key] ?? null));
            return $saisie ? [$saisie, false] : [$derived[$key], true];
        };
        [$aptitudes, $aptDerived] = $pick('aptitudes', self::APTITUDES);
        [$gaz, $gazDerived]       = $pick('gaz', self::GAZ);
        [$fonctions, $fctDerived] = $pick('fonctions', self::FONCTIONS);
        $diplomeSaisi = in_array($pf['diplome_homologue'] ?? null, self::DIPLOMES, true) ? $pf['diplome_homologue'] : null;
        $attestation  = $pf['attestation'] ?? null;

        return [
            'aptitudes'         => $aptitudes,
            'gaz'               => $gaz,
            'fonctions'         => $fonctions,
            'diplome_homologue' => $diplomeSaisi ?? $derived['diplome_homologue'],
            'stagiaire'         => !empty($pf['stagiaire']),
            'patente'           => !empty($pf['patente']),
            'brevets'           => is_string($pf['brevets'] ?? null) ? $pf['brevets'] : '',
            'attestation'       => is_string($attestation) && $attestation !== '' ? $attestation : null,
            'derived'           => [
                'aptitudes'         => $aptDerived,
                'gaz'               => $gazDerived,
                'fonctions'         => $fctDerived,
                'diplome_homologue' => $diplomeSaisi === null,
            ],
        ];
    }

    /**
     * Objet `pf` reçu du client (POST / PUT /api/divers) : normalisé (codes
     * dans l'ordre canonique, clés dans l'ordre stocké) ou erreurs de saisie.
     *
     * @return array{0: ?array, 1: list<string>}
     */
    public static function sanitize(mixed $pf): array
    {
        if ($pf === null) return [null, []];
        if (!is_array($pf) || ($pf !== [] && array_is_list($pf))) return [null, ['pf : objet attendu']];

        $errors = [];
        $codes  = static function (string $key, array $allowed) use ($pf, &$errors): array {
            $values = $pf[$key] ?? [];
            if (!is_array($values)) {
                $errors[] = "pf.{$key} : liste attendue";
                return [];
            }
            foreach ($values as $v) {
                if (!is_string($v) || !in_array($v, $allowed, true)) {
                    $errors[] = "pf.{$key} : code inconnu " . (is_scalar($v) ? (string)$v : gettype($v));
                }
            }
            return self::ordered($allowed, $values);
        };
        $aptitudes = $codes('aptitudes', self::APTITUDES);
        $gaz       = $codes('gaz', self::GAZ);
        $fonctions = $codes('fonctions', self::FONCTIONS);

        $diplome = is_string($pf['diplome_homologue'] ?? null) ? trim($pf['diplome_homologue']) : null;
        if ($diplome === '') $diplome = null;
        if ($diplome !== null && !in_array($diplome, self::DIPLOMES, true)) {
            $errors[] = 'pf.diplome_homologue : diplôme inconnu';
            $diplome  = null;
        }

        $brevets = $pf['brevets'] ?? '';
        if (!is_string($brevets) || mb_strlen(trim($brevets)) > 500) {
            $errors[] = 'pf.brevets : 500 caractères maximum';
            $brevets  = '';
        }

        $attestation = $pf['attestation'] ?? null;
        if ($attestation === '') $attestation = null;
        if ($attestation !== null && !self::isDate($attestation)) {
            $errors[] = 'pf.attestation : date invalide';
            $attestation = null;
        }

        return [[
            'aptitudes'         => $aptitudes,
            'gaz'               => $gaz,
            'fonctions'         => $fonctions,
            'diplome_homologue' => $diplome,
            'stagiaire'         => (bool)($pf['stagiaire'] ?? false),
            'patente'           => (bool)($pf['patente'] ?? false),
            'brevets'           => trim($brevets),
            'attestation'       => $attestation,
        ], $errors];
    }

    private static function isDate(mixed $v): bool
    {
        return is_string($v)
            && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) === 1
            && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    }

    /** Niveau plongeur implicite d'un encadrant (plongeurForEncadrant du formulaire). */
    private static function niveauPlongeur(array $diver): string
    {
        $ne = (string)($diver['niveau_encadrant'] ?? '');
        $np = (string)($diver['niveau_plongeur'] ?? '');
        if ($ne === 'E1') return $np === 'N3' ? 'N3' : 'N2';
        return $ne !== '' ? 'N3' : $np;
    }

    /** @return list<string> */
    private static function trimixDps(array $gaz, int $dpTrimixMax): array
    {
        $dps = [];
        if ($dpTrimixMax >= 70 && in_array('PTH-70', $gaz, true)) $dps[] = 'DP-70';
        if ($dpTrimixMax >= 100 && in_array('PTH-100', $gaz, true)) $dps[] = 'DP-100';
        if ($dpTrimixMax >= 120 && in_array('PTH-120', $gaz, true)) $dps[] = 'DP-120';
        return $dps;
    }

    /**
     * @param list<string> $codes ordre canonique
     * @return list<string>
     */
    private static function ordered(array $codes, array $values): array
    {
        return array_values(array_filter($codes, static fn(string $c): bool => in_array($c, $values, true)));
    }

    /** @return list<string> */
    private static function strings(mixed $v): array
    {
        return is_array($v) ? array_values(array_filter($v, 'is_string')) : [];
    }
}
