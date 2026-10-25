<?php
declare(strict_types=1);

/**
 * Check-list de la Polynésie française (arrêté n° 199 CM) — portage de
 * src/domain/pf/pf-checklist.js (mêmes identifiants et textes, dans le même
 * ordre ; tests/checklist-pf.test.js et tests/fixtures/checklist-pf.json,
 * rejoués par PfChecklistRulesTest). Conditions : ChecklistRules::matches.
 */
final class PfChecklistRules
{
    /**
     * Phases avec les seuls items visibles pour ces réponses (même forme que ChecklistRules::visible).
     * @return list<array{phase:int, phaseTitle:string, items:list<array<string, mixed>>}>
     */
    public static function visible(array $a): array
    {
        $out = [];
        foreach (self::phases() as $phase) {
            $items = array_values(array_filter($phase['items'], static fn(array $it): bool => ChecklistRules::matches($it['when'] ?? null, $a)));
            $out[] = ['phase' => $phase['phase'], 'phaseTitle' => $phase['phaseTitle'], 'items' => $items];
        }
        return $out;
    }

    /** @return list<array{phase: int, phaseTitle: string, items: list<array<string, mixed>>}> */
    public static function phases(): array
    {
        $naturel = static fn(array $a): bool => ChecklistRules::isMilieuNaturel($a);
        // Art. 9 : surveillant de surface à bord (nuit, dérive, passe, recycleur, > 40 m, trimix).
        $surveillant = static fn(array $a): bool => !empty($a['depart_bateau']) && (
            !empty($a['sec_surface']) || !empty($a['plongee_nuit']) || !empty($a['plongee_derive'])
            || !empty($a['plongee_passe']) || !empty($a['recycleur']) || !empty($a['trimix'])
            || (float)($a['prof_max'] ?? 0) > 40
        );
        return [
            [
                'phase'      => 1,
                'phaseTitle' => 'Préparation — avant l\'arrivée sur site',
                'items'      => [
                    ['id' => 'pf1_meteo', 'text' => 'Bulletin météo consulté (vent, houle, courant, visibilité, alerte)', 'when' => $naturel],
                    ['id' => 'pf1_affichage', 'text' => 'Affichages obligatoires à jour : récépissé de déclaration, attestation d\'assurance, diplômes et cartes professionnelles, conditions d\'évolution, tableau d\'organisation des secours', 'ref' => 'art. 1'],
                    ['id' => 'pf1_blocs', 'text' => 'Bouteilles et bouteilles tampons requalifiées, inspection périodique à jour (TIV)', 'ref' => 'art. 19'],
                    ['id' => 'pf1_gonflage', 'text' => 'Gonflage des blocs effectué — pressions contrôlées'],
                    ['id' => 'pf1_entretien', 'text' => 'Équipements des plongeurs entretenus (2 ans au plus entre deux entretiens), registre à jour ; détendeurs et tubas prêtés désinfectés et rincés', 'ref' => 'art. 21'],
                    ['id' => 'pf1_melanges', 'text' => 'Bouteilles de mélange identifiées (composition, date d\'analyse, fabricant) et complétées par l\'utilisateur : pression, % d\'O₂ (et d\'hélium) analysé, profondeur maximale d\'utilisation, date, nom ou initiales ; report au registre', 'ref' => 'art. 32', 'when' => static fn(array $a): bool => !empty($a['nitrox']) || !empty($a['trimix'])],
                    ['id' => 'pf1_planifs', 'text' => 'Trimix / héliox : planifications établies, copie prévue sur le lieu de mise à l\'eau', 'ref' => 'art. 37', 'when' => ['trimix' => true]],
                    ['id' => 'pf1_recycleur', 'text' => 'Recycleurs : formation qualifiante des utilisateurs, système de secours en circuit ouvert prévu', 'ref' => 'art. 33 / 34', 'when' => ['recycleur' => true]],
                    ['id' => 'pf1_plan_secours', 'text' => 'Plan de secours écrit, adapté au lieu et à la plongée, à jour : alerte, coordonnées des secours (JRCC Tahiti +689 40 54 16 16, VHF 16 ; SAMU 15), procédures d\'urgence', 'ref' => 'art. 14'],
                    ['id' => 'pf1_o2', 'text' => 'Oxygénothérapie normobare d\'au moins 600 L détendus, avec manodétendeur, débit-litre et tuyau de raccordement', 'ref' => 'art. 15'],
                    ['id' => 'pf1_bavu', 'text' => 'BAVU avec sac de réserve d\'O₂ et deux masques (enfant, adulte) + masque à haute concentration', 'ref' => 'art. 15'],
                    ['id' => 'pf1_trousse', 'text' => 'Trousse de premiers secours (pansement compressif, antiseptique, compresses, pansements, bande Velpeau, gants), aspirine en poudre non effervescente, couverture isothermique, au moins 1 L d\'eau douce potable', 'ref' => 'art. 15'],
                    ['id' => 'pf1_fiches', 'text' => 'Fiches d\'observation (annexe XVIII) et formulaire de déclaration d\'accident (annexe XIX, à la DJS sous 48 h)', 'ref' => 'art. 15'],
                    ['id' => 'pf1_bloc_secours', 'text' => 'Bouteille de secours dédiée à deux embouts (aux mélanges : bouteilles adaptées) ; sous 10 m, à l\'appréciation du DP', 'ref' => 'art. 16'],
                    ['id' => 'pf1_registre_secours', 'text' => 'Matériel de secours et d\'assistance contrôlé depuis moins de 3 mois, registre d\'entretien à jour', 'ref' => 'art. 17'],
                    ['id' => 'pf1_aptitudes', 'text' => 'Aptitudes justifiées (brevet, carnet) ou évaluées par le DP ; attestations de condition physique (annexe XVII) ou certificats ; certificat annuel des encadrants', 'ref' => 'LP 13 / art. 12-13'],
                    ['id' => 'pf1_mineurs', 'text' => 'Autorisations parentales signées récupérées', 'when' => ['mineurs' => true]],
                    ['id' => 'pf1_vhf', 'text' => 'VHF testée, canal 16 (en mer au départ d\'une embarcation, là où le réseau VHF des secours couvre l\'île ou l\'atoll)', 'ref' => 'art. 15', 'when' => ['depart_bateau' => true]],
                    ['id' => 'pf1_carburant', 'text' => 'Carburant et matériel de bord (gilets, signaux, mouillage) vérifiés', 'when' => ['depart_bateau' => true]],
                    ['id' => 'pf1_shot_line', 'text' => 'Ligne lestée de descente préparée', 'when' => static fn(array $a): bool => !empty($a['shot_line']) || !empty($a['trimix'])],
                ],
            ],
            [
                'phase'      => 2,
                'phaseTitle' => 'Sur site — avant la mise à l\'eau',
                'items'      => [
                    ['id' => 'pf2_appel', 'text' => 'Appel nominatif des plongeurs — vérification des aptitudes'],
                    ['id' => 'pf2_feuille', 'text' => 'Feuille de palanquée établie : noms, prénoms, aptitudes, fonctions, paramètres prévus', 'ref' => 'art. 2'],
                    ['id' => 'pf2_briefing', 'text' => 'Briefing : site, profil, paramètres, signes, règles de sécurité et d\'évolution de la palanquée', 'ref' => 'art. 39'],
                    ['id' => 'pf2_equipement', 'text' => 'Équipement : manomètre, gilet et source d\'air sans partage d\'embout pour chacun ; moyens de contrôle de la plongée au-delà de 20 m en encadré, en autonomie et pour les encadrants ; un parachute de signalisation par palanquée', 'ref' => 'art. 20', 'when' => $naturel],
                    ['id' => 'pf2_rappel', 'text' => 'Moyen de rappel des plongeurs depuis la surface prêt', 'ref' => 'art. 16', 'when' => ['depart_bateau' => true]],
                    ['id' => 'pf2_surveillant', 'text' => 'Surveillant de surface à bord pendant toute la plongée, apte à piloter le navire, formé à l\'alerte et aux premiers secours', 'ref' => 'art. 9', 'when' => $surveillant],
                    ['id' => 'pf2_pavillon', 'text' => 'Pavillon A hissé (guindant d\'au moins 0,50 m)', 'ref' => 'art. 8', 'when' => ['depart_bateau' => true]],
                    ['id' => 'pf2_nuit', 'text' => 'Plongée de nuit : feux et marques du navire, mise à l\'eau éclairée depuis la berge, éclairage individuel et source supplémentaire par palanquée', 'ref' => 'art. 10', 'when' => ['plongee_nuit' => true]],
                    ['id' => 'pf2_derive', 'text' => 'Plongée dérivante : le navire reste sur zone et suit les plongeurs', 'ref' => 'art. 11', 'when' => ['plongee_derive' => true]],
                    ['id' => 'pf2_tx', 'text' => 'Trimix : copie des planifications sur place, embarcation avec surveillant de surface, parachute pour chaque plongeur', 'ref' => 'art. 37', 'when' => ['trimix' => true]],
                    ['id' => 'pf2_recycleur', 'text' => 'Recycleur : secours en circuit ouvert ; encadrant sur recycleur : secours indépendant du recycleur', 'ref' => 'art. 34', 'when' => ['recycleur' => true]],
                    ['id' => 'pf2_echelle', 'text' => 'Échelle de remontée déployée — ancrage adapté', 'when' => ['depart_bateau' => true]],
                    ['id' => 'pf2_bord_entree', 'text' => 'Points d\'entrée et de sortie de l\'eau identifiés et sécurisés', 'when' => ['depart_bord' => true]],
                    ['id' => 'p2_go_decision', 'text' => 'Décision finale du DP : conditions réunies pour autoriser la mise à l\'eau', 'ref' => 'LP 8'],
                ],
            ],
        ];
    }
}
