<?php
declare(strict_types=1);

/**
 * Check-list opérationnelle — portage de src/domain/checklist.js (mêmes
 * identifiants, textes et conditions, dans le même ordre ; vérifié par
 * tests/checklist-php.test.js et les scénarios de tests/fixtures/checklist.json,
 * exécutés côté JS et PHPUnit). Lue par templates/checklist.php (PDF).
 *
 * Fonctions pures.
 */
final class ChecklistRules
{
    /** A322-98 : au-delà de 6 m, une piscine ou une fosse relève du milieu naturel. */
    private const BASSIN_DEROGATION_MAX = 6;

    /** 'mer' | 'lac' | 'piscine' | 'fosse' (src/domain/milieu.js getMilieuType). */
    public static function milieuType(mixed $milieu): string
    {
        $m = is_string($milieu) ? mb_strtolower($milieu) : '';
        if ($m === '') return 'mer';
        if (str_contains($m, 'lac') || str_contains($m, 'carrière') || str_contains($m, 'carriere')) return 'lac';
        if (str_contains($m, 'piscine')) return 'piscine';
        if (str_contains($m, 'fosse')) return 'fosse';
        return 'mer';
    }

    /** Mer / lac / carrière (milieu.js isMilieuNaturel). */
    public static function isMilieuNaturel(array $a): bool
    {
        return !in_array(self::milieuType($a['milieu'] ?? null), ['piscine', 'fosse'], true);
    }

    /** Règles du milieu naturel, y compris bassin de plus de 6 m (milieu.js reglesMilieuNaturel). */
    public static function reglesMilieuNaturel(array $a): bool
    {
        if (self::isMilieuNaturel($a)) return true;
        $siteMax = is_numeric($a['site_prof_max'] ?? null) ? (float)$a['site_prof_max'] : 0.0;
        if ($siteMax > 0) return $siteMax > self::BASSIN_DEROGATION_MAX;
        return self::milieuType($a['milieu'] ?? null) === 'fosse';
    }

    /** conditions.js matchCondition : tableau {clé: true|false|chaîne} ou callable. */
    public static function matches(mixed $when, array $a): bool
    {
        if (!$when) return true;
        if (is_callable($when)) return (bool)$when($a);
        foreach ($when as $k => $v) {
            if ($v === true && empty($a[$k])) return false;
            if ($v === false && !empty($a[$k])) return false;
            if (is_string($v) && ($a[$k] ?? null) !== $v) return false;
        }
        return true;
    }

    /**
     * Phases avec les seuls items visibles pour ces réponses.
     * @return list<array{phase:int, phaseTitle:string, items:list<array{id:string, text:string}>}>
     */
    public static function visible(array $a): array
    {
        $out = [];
        foreach (self::phases() as $phase) {
            $items = array_values(array_filter($phase['items'], fn($it) => self::matches($it['when'] ?? null, $a)));
            $out[] = ['phase' => $phase['phase'], 'phaseTitle' => $phase['phaseTitle'], 'items' => $items];
        }
        return $out;
    }

    public static function phases(): array
    {
        $naturel = [self::class, 'isMilieuNaturel'];
        $regles  = [self::class, 'reglesMilieuNaturel'];
        $shot    = fn(array $a): bool => !empty($a['shot_line']) || !empty($a['trimix']);
        return [
            [
                'phase' => 1,
                'phaseTitle' => "Préparation — avant l'arrivée sur site",
                'items' => [
                    ['id' => 'p1_meteo', 'text' => 'Bulletin météo consulté (vent, mer, courant, visibilité, alerte)', 'when' => $naturel],
                    ['id' => 'p1_maree', 'text' => 'Heure et coefficient de marée vérifiés', 'when' => ['maree_relevant' => true]],
                    ['id' => 'p1_blocs', 'text' => 'Inspection visuelle (TIV) et requalification des blocs à jour'],
                    ['id' => 'p1_gonflage', 'text' => 'Gonflage des blocs effectué — pressions contrôlées'],
                    ['id' => 'p1_analyse_nx', 'text' => "Fiche d'identification de chaque bloc nitrox complétée : pression, % O₂ analysé, profondeur max d'utilisation, date d'analyse, nom ou initiales", 'when' => ['nitrox' => true]],
                    ['id' => 'p1_analyse_nx_sup', 'text' => 'Plongeurs Nx > 40 % : aptitude PN-C contrôlée', 'when' => ['nitrox_sup_40' => true]],
                    ['id' => 'p1_analyse_tx', 'text' => 'Trimix / héliox : mélanges analysés et identifiés, planifications de plongée établies', 'when' => ['trimix' => true]],
                    ['id' => 'p1_bloc_relais', 'text' => 'Bloc(s) relais / déco analysés et identifiés', 'when' => ['bloc_relais' => true]],
                    ['id' => 'p1_rec_check', 'text' => 'Check-list constructeur de chaque recycleur — pré-breathing', 'when' => ['recycleur' => true]],
                    ['id' => 'p1_plan_secours', 'text' => 'Plan de secours écrit, adapté au lieu et à la plongée, à jour'],
                    ['id' => 'p1_o2_secours', 'text' => "Oxygénothérapie normobare (capacité suffisante jusqu'aux secours) avec manodétendeur et débit-litre"],
                    ['id' => 'p1_bavu', 'text' => "BAVU avec sac de réserve d'O₂ et 3 masques (grand, moyen, petit) + masque à haute concentration"],
                    ['id' => 'p1_trousse', 'text' => 'Couverture isothermique et eau douce potable'],
                    ['id' => 'p1_fiches_evac', 'text' => "Fiches d'évacuation (modèle de l'annexe III-19)"],
                    ['id' => 'p1_bloc_secours', 'text' => "Bouteille d'air de secours équipée de son détendeur (et bouteille(s) de mélange de secours si plongée aux mélanges)"],
                    ['id' => 'p1_tablette', 'text' => 'Tablette de notation immergeable'],
                    ['id' => 'p1_tables', 'text' => 'Jeu de tables de décompression', 'when' => $regles],
                    ['id' => 'p1_doc_plongeurs', 'text' => 'Brevets, licences, certificats médicaux à jour pour chaque plongeur'],
                    ['id' => 'p1_etrangers', 'text' => 'Brevets étrangers : aptitudes justifiées (brevet, carnet) ou évaluées par le DP', 'when' => ['etrangers' => true]],
                    ['id' => 'p1_mineurs', 'text' => 'Autorisations parentales signées récupérées', 'when' => ['mineurs' => true]],
                    ['id' => 'p1_vhf_test', 'text' => "VHF testée (obligatoire en mer au départ d'une embarcation) — canal 16 configuré", 'when' => ['depart_bateau' => true]],
                    ['id' => 'p1_carburant', 'text' => 'Carburant + matériel de bord (gilets, signaux, mouillage) OK', 'when' => ['depart_bateau' => true]],
                    ['id' => 'p1_shot_line', 'text' => 'Shot-line (ligne lestée de descente) préparée — lest, longueur, parachutes/bouée de signalisation', 'when' => $shot],
                    ['id' => 'p1_secours_coord', 'text' => 'Coordonnées des secours affichées (pays-appropriées)'],
                ],
            ],
            [
                'phase' => 2,
                'phaseTitle' => "Sur site — avant la mise à l'eau",
                'items' => [
                    ['id' => 'p2_appel', 'text' => 'Appel nominatif des plongeurs présents — vérification aptitudes'],
                    ['id' => 'p2_briefing', 'text' => 'Briefing général : site, profil, paramètres, signes, consignes'],
                    ['id' => 'p2_rappels_secu', 'text' => "Rappels de sécurité individuels communiqués : moyen de rappel, conduite à tenir en cas de perte de palanquée, procédure de remontée d'urgence"],
                    ['id' => 'p2_palanquees', 'text' => 'Composition annoncée — GP / serre-files / autonomes identifiés'],
                    ['id' => 'p2_equipement', 'text' => "Équipement vérifié : manomètre et gilet pour tous ; au-delà de 20 m en encadré et pour les autonomes, source d'air de secours sans partage d'embout et moyens de contrôle ; encadrants : 2 sorties et 2 détendeurs", 'when' => $regles],
                    ['id' => 'p2_rappel', 'text' => 'Moyen de rappel des plongeurs depuis la surface prêt', 'when' => ['depart_bateau' => true]],
                    ['id' => 'p2_sec_surface', 'text' => 'Sécurité surface en poste — relais identifiés si rotation', 'when' => ['sec_surface' => true]],
                    ['id' => 'p2_pavillon', 'text' => "Pavillon Alpha hissé sur l'embarcation", 'when' => ['depart_bateau' => true]],
                    ['id' => 'p2_echelle', 'text' => 'Échelle de remontée déployée — ancrage adapté', 'when' => ['depart_bateau' => true]],
                    ['id' => 'p2_shot_line_pose', 'text' => 'Ligne lestée de descente / remontée installée (obligatoire au trimix)', 'when' => $shot],
                    ['id' => 'p2_parachute', 'text' => "Chaque palanquée dispose d'un parachute de palier", 'when' => $regles],
                    ['id' => 'p2_parachute_indiv', 'text' => 'Chaque plongeur porte son parachute individuel', 'when' => ['parachute_par_plongeur' => true]],
                    ['id' => 'p2_nx_signature', 'text' => 'Plongeurs nitrox : fiche de leur bloc complétée et signée (nom ou initiales)', 'when' => ['nitrox' => true]],
                    ['id' => 'p2_rec_aptitudes', 'text' => 'Aptitudes recycleur validées + circuit ouvert de secours pour > 6m', 'when' => ['recycleur' => true]],
                    ['id' => 'p2_planifs', 'text' => "Copie des planifications présente sur le lieu de mise à l'eau", 'when' => ['trimix' => true]],
                    ['id' => 'p2_tx_embarcation', 'text' => 'Support logistique ou embarcation avec une personne habilitée à la manœuvrer', 'when' => ['trimix' => true]],
                    ['id' => 'p2_bord_entree', 'text' => "Points d'entrée/sortie de l'eau identifiés et sécurisés", 'when' => ['depart_bord' => true]],
                    ['id' => 'p2_go_decision', 'text' => "Décision finale du DP : conditions OK pour autoriser la mise à l'eau"],
                ],
            ],
        ];
    }
}
