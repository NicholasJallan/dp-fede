<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/DiverValidation.php')) {
    require_once __DIR__ . '/../lib/DiverValidation.php';
}

final class DiverValidationTest extends TestCase
{
    private static function validBody(): array
    {
        return [
            'nom'                           => 'Dupont',
            'prenom'                        => 'Jean',
            'licence'                       => '123456',
            'medical'                       => '2026-01-01',
            'date_naissance'                => '1990-05-12',
            'licence_fin'                   => '2026-12-31',
            'representant_legal'            => 'Marie Dupont',
            'autorisation_parentale_saison' => '2026-2027',
            'niveau_plongeur'               => 'N2',
            'niveau_encadrant'              => 'E3',
        ];
    }

    public function testValidBodyProducesNoErrors(): void
    {
        $this->assertSame([], \DiverValidation::errors(self::validBody()));
    }

    public function testRequiredFields(): void
    {
        $body = self::validBody();
        unset($body['nom'], $body['medical']);

        $errors = \DiverValidation::errors($body);
        $this->assertContains('Nom est requis', $errors);
        $this->assertContains('Date du certificat médical est requis', $errors);
    }

    public function testFieldLengths(): void
    {
        $body = self::validBody();
        $body['nom'] = str_repeat('a', 101);
        $body['prenom'] = str_repeat('b', 101);
        $body['licence'] = str_repeat('c', 51);
        $body['representant_legal'] = str_repeat('d', 201);

        $errors = \DiverValidation::errors($body);
        $this->assertContains('Nom ne doit pas dépasser 100 caractères', $errors);
        $this->assertContains('Prénom ne doit pas dépasser 100 caractères', $errors);
        $this->assertContains('Numéro de licence ne doit pas dépasser 50 caractères', $errors);
        $this->assertContains('Représentant légal ne doit pas dépasser 200 caractères', $errors);
    }

    public function testDateFields(): void
    {
        $body = self::validBody();
        $body['medical'] = '2026-02-31';
        $body['date_naissance'] = 'invalid-date';
        $body['licence_fin'] = '2026/12/31';

        $errors = \DiverValidation::errors($body);
        $this->assertContains('Date du certificat médical doit être une date valide au format AAAA-MM-JJ', $errors);
        $this->assertContains('Date de naissance doit être une date valide au format AAAA-MM-JJ', $errors);
        $this->assertContains('Date de fin de licence doit être une date valide au format AAAA-MM-JJ', $errors);
    }

    public function testAutorisationParentaleSaison(): void
    {
        $body = self::validBody();
        $body['autorisation_parentale_saison'] = '2026';

        $errors = \DiverValidation::errors($body);
        $this->assertContains("Saison d'autorisation parentale invalide (format AAAA-AAAA, ex. 2026-2027)", $errors);
    }

    public function testNiveauPlongeurAllowedValues(): void
    {
        $body = self::validBody();

        foreach (['N1', 'N2', 'N3', null, ''] as $val) {
            $body['niveau_plongeur'] = $val;
            $this->assertSame([], \DiverValidation::errors($body), "Valeur acceptée: " . var_export($val, true));
        }

        foreach (['N4', 'PE40', 'MF1', 'E1', 'P1', 'invalid'] as $val) {
            $body['niveau_plongeur'] = $val;
            $errors = \DiverValidation::errors($body);
            $this->assertNotEmpty($errors, "Valeur rejetée: " . var_export($val, true));
        }
    }

    public function testNiveauEncadrantAllowedValues(): void
    {
        $body = self::validBody();

        foreach (['N4', 'N5', 'E1', 'E2', 'E3', 'E4', null, ''] as $val) {
            $body['niveau_encadrant'] = $val;
            $this->assertSame([], \DiverValidation::errors($body), "Valeur acceptée: " . var_export($val, true));
        }

        foreach (['MF1', 'E5', 'N2', 'BEES1', 'GP', 'invalid'] as $val) {
            $body['niveau_encadrant'] = $val;
            $errors = \DiverValidation::errors($body);
            $this->assertNotEmpty($errors, "Valeur rejetée: " . var_export($val, true));
        }
    }

    public function testArrayFieldValuesDoNotTriggerWarningOrTypeError(): void
    {
        $body = self::validBody();
        $body['nom'] = ['injection'];
        $body['medical'] = ['2026-01-01'];

        $errors = \DiverValidation::errors($body);
        $this->assertNotEmpty($errors);
    }
}
