<?php
declare(strict_types=1);

/**
 * Fiche plongeur reçue du client (POST / PUT /api/divers) : erreurs de saisie,
 * liste vide si le corps est valide. Les niveaux sont ceux de
 * src/domain/levels.js ; une autre valeur alimenterait Rules sans sens
 * réglementaire (ou dépasserait la colonne : erreur SQL 500).
 */
final class DiverValidation
{
    public const array NIVEAUX_PLONGEUR  = ['N1', 'N2', 'N3'];
    public const array NIVEAUX_ENCADRANT = ['N4', 'N5', 'E1', 'E2', 'E3', 'E4'];

    /**
     * @param string $jurisdiction juridiction de l'annuaire (club) : en
     *   Polynésie, le certificat médical n'est exigé que des encadrants et des
     *   pratiquants à antécédents (arrêté n° 199 CM, art. 12 et 13).
     * @return list<string>
     */
    public static function errors(array $body, string $jurisdiction = Jurisdiction::DEFAULT): array
    {
        $v = (new Validate($body))
            ->required('nom', 'Nom')
            ->maxLen('nom', 100, 'Nom')
            ->maxLen('prenom', 100, 'Prénom')
            ->maxLen('licence', 50, 'Numéro de licence');
        if ($jurisdiction !== 'PF') $v->required('medical', 'Date du certificat médical');
        $v->date('medical', 'Date du certificat médical')
            ->date('date_naissance', 'Date de naissance')
            ->date('licence_fin', 'Date de fin de licence')
            ->maxLen('representant_legal', 200, 'Représentant légal')
            ->inList('niveau_plongeur', self::NIVEAUX_PLONGEUR, 'Niveau plongeur')
            ->inList('niveau_encadrant', self::NIVEAUX_ENCADRANT, 'Niveau encadrant');
        $errors = $v->errors();
        $season = $v->nullable('autorisation_parentale_saison');
        if ($season !== null && !ClubAlerts::isValidSeason($season)) {
            $errors[] = "Saison d'autorisation parentale invalide (format AAAA-AAAA, ex. 2026-2027)";
        }
        if (array_key_exists('pf', $body)) {
            [, $pfErrors] = PfProfile::sanitize($body['pf']);
            $errors = [...$errors, ...$pfErrors];
        }
        return $errors;
    }
}
