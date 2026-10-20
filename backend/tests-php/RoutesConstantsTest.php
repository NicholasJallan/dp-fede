<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Une constante `const X = …;` de premier niveau dans routes/*.php n'existe
 * qu'une fois sa ligne exécutée, alors que les fonctions du fichier sont
 * disponibles dès son chargement. Déclarée après un handler, elle est
 * indéfinie pour ce handler (qui répond et sort avant de l'atteindre) :
 * PATCH /api/dives/:id renvoyait 500 « Undefined constant
 * RENDER_STATE_MAX_BYTES » en production. Les tests chargent les fichiers
 * de route en entier et ne voient pas le problème : on le vérifie
 * statiquement. Préférer une constante de classe (lib/).
 */
final class RoutesConstantsTest extends TestCase
{
    public function testTopLevelConstantsAreDeclaredBeforeTheFirstHandler(): void
    {
        $offenders = [];
        foreach (glob(__DIR__ . '/../routes/*.php') as $file) {
            $lines = file($file, FILE_IGNORE_NEW_LINES);
            $firstHandler = null;
            foreach ($lines as $i => $line) {
                if ($firstHandler === null && preg_match('/^if \(\$method\b/', $line)) {
                    $firstHandler = $i;
                }
                if (preg_match('/^const\s+(\w+)/', $line, $m) && $firstHandler !== null) {
                    $offenders[] = basename($file) . ':' . ($i + 1) . ' ' . $m[1];
                }
            }
        }
        $this->assertSame([], $offenders, 'Constantes déclarées après un handler de route');
    }
}
