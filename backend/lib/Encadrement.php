<?php
declare(strict_types=1);

/**
 * Niveau d'encadrement selon le cadre de la plongée — portage de
 * src/domain/encadrement.js.
 *
 * niveau_encadrant = prérogatives fédérales (cadre associatif : MF1 = E3,
 * MF2 / BEPPA = E4) ; diplôme pro (qualifs.diplome) = prérogatives d'État
 * (III-15 b), seules valables en structure commerciale (SCA). DEJEPS seul :
 * E3 ; avec le certificat complémentaire ou obtenu avant la réforme : E4.
 * En SCA, seul le titulaire d'un diplôme d'État peut être DP (L212-1) : ni
 * un N5 (P5 / DPE), ni un E1 → E4 sans diplôme pro.
 *
 * Fonctions pures.
 */
final class Encadrement
{
    /** Code stocké → niveau E (null : pas de niveau reconnu). */
    public const DIPLOMES_PRO = [
        'BEES1'     => 'E3',
        'BEES2'     => 'E4',
        'DEJEPS'    => 'E3',
        'DEJEPS-E4' => 'E4',
        'DESJEPS'   => 'E4',
        'Autre'     => null,
    ];

    private const ENS_RANK = ['E1' => 1, 'E2' => 2, 'E3' => 3, 'E4' => 4];

    /** Niveaux pouvant diriger une plongée en club (Rules::DP_QUALIF). */
    private const DP_LEVELS = ['N5', 'E1', 'E2', 'E3', 'E4'];

    public static function isCadrePro(?string $structureType): bool
    {
        return $structureType === 'sca';
    }

    public static function diplomeProLevel(mixed $code): ?string
    {
        return is_string($code) ? (self::DIPLOMES_PRO[$code] ?? null) : null;
    }

    /**
     * Niveau retenu : associatif = le plus élevé du fédéral et du pro ;
     * pro = celui du diplôme pro, sinon le fédéral.
     */
    public static function level(?string $niveauEncadrant, mixed $diplomePro, bool $cadrePro): ?string
    {
        $ne  = ($niveauEncadrant ?? '') !== '' ? $niveauEncadrant : null;
        $pro = self::diplomeProLevel($diplomePro);
        if ($pro === null) return $ne;
        if ($cadrePro) return $pro;
        return self::ENS_RANK[$pro] > (self::ENS_RANK[$ne ?? ''] ?? 0) ? $pro : $ne;
    }

    /** Candidat DP (N5, E1 → E4) sans diplôme pro en SCA : pas DP. « Autre » compte comme diplôme. */
    public static function dpDiplomeProRequis(?string $niveauEncadrant, mixed $diplomePro, bool $cadrePro): bool
    {
        return $cadrePro
            && in_array($niveauEncadrant, self::DP_LEVELS, true)
            && !(is_string($diplomePro) && $diplomePro !== '');
    }

    /**
     * Ligne `divers` (qualifs JSON brut) avec niveau_encadrant du cadre et,
     * le cas échéant, dp_diplome_pro_requis (lu par Rules::checkDp).
     */
    public static function applyToRow(array $row, bool $cadrePro): array
    {
        $raw = json_decode($row['qualifs'] ?? '[]', true);
        $diplome = is_array($raw) ? ($raw['diplome'] ?? null) : null;
        if (self::dpDiplomeProRequis($row['niveau_encadrant'] ?? null, $diplome, $cadrePro)) {
            $row['dp_diplome_pro_requis'] = true;
        }
        $row['niveau_encadrant'] = self::level($row['niveau_encadrant'] ?? null, $diplome, $cadrePro);
        return $row;
    }
}
