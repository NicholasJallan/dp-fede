<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

/**
 * Garde-fou de scope pour les structures partagées.
 *
 * Le cloisonnement des données repose sur une seule discipline : dans les
 * routes de données, la clé de propriété est $user['scope_id'] (soi-même, ou
 * le compte-structure quand une structure est active), jamais $user['id'].
 * Une seule occurrence oubliée ferait fuiter — ou perdre — les données d'un
 * stage. Il n'y a pas de couche modèle pour l'imposer : ce test la remplace.
 */
final class WorkspaceScopeTest extends TestCase
{
    /** Routes dont les requêtes portent sur des données scopées. */
    private const DATA_ROUTES = ['divers', 'sites', 'dives', 'sync', 'pdf'];

    /** Routes qui manipulent l'identité et doivent garder $user['id']. */
    private const IDENTITY_ROUTES = ['auth', 'users', 'workspaces'];

    private function routeSource(string $name): string
    {
        $path = __DIR__ . '/../routes/' . $name . '.php';
        $this->assertFileExists($path);
        return self::stripComments((string)file_get_contents($path));
    }

    /**
     * Retire commentaires et docblocks : le garde-fou porte sur le code exécuté,
     * pas sur la prose qui l'explique (les en-têtes de fichier citent volontiers
     * $user['scope_id'] pour documenter la convention).
     */
    private static function stripComments(string $src): string
    {
        $out = '';
        foreach (token_get_all($src) as $tok) {
            if (is_array($tok)) {
                if ($tok[0] === T_COMMENT || $tok[0] === T_DOC_COMMENT) continue;
                $out .= $tok[1];
            } else {
                $out .= $tok;
            }
        }
        return $out;
    }

    /**
     * @dataProvider dataRoutes
     */
    public function testDataRoutesNeverScopeByPersonalUserId(string $route): void
    {
        $src = $this->routeSource($route);

        // created_by est la seule exception légitime : il enregistre l'auteur
        // réel de la ligne, pas son propriétaire.
        $withoutCreatedBy = str_replace(
            ["\$user['scope_id'], \$user['id'],", "\$user['scope_id'], \$user['id']"],
            '',
            $src
        );

        $this->assertStringNotContainsString(
            "\$user['id']",
            $withoutCreatedBy,
            "routes/{$route}.php scope encore des données sur l'utilisateur personnel "
            . "au lieu de \$user['scope_id'] : les membres d'une structure ne verraient "
            . 'pas les mêmes données.'
        );
    }

    /** @return array<int,array<int,string>> */
    public static function dataRoutes(): array
    {
        return array_map(static function ($r) { return [$r]; }, self::DATA_ROUTES);
    }

    public function testDataRoutesActuallyUseScopeId(): void
    {
        foreach (self::DATA_ROUTES as $route) {
            $this->assertStringContainsString(
                "\$user['scope_id']",
                $this->routeSource($route),
                "routes/{$route}.php n'utilise aucun scope_id — la bascule d'espace y est inopérante."
            );
        }
    }

    public function testIdentityRoutesKeepThePersonalUserId(): void
    {
        foreach (self::IDENTITY_ROUTES as $route) {
            $this->assertStringNotContainsString(
                "\$user['scope_id']",
                $this->routeSource($route),
                "routes/{$route}.php touche à l'identité : elle doit rester sur \$user['id'] "
                . '(sinon un membre pourrait éditer le profil du compte-structure).'
            );
        }
    }

    public function testAuthResolvesScopeAndRejectsWorkspaceAccounts(): void
    {
        $src = (string)file_get_contents(__DIR__ . '/../lib/Auth.php');

        $this->assertStringContainsString("\$user['scope_id']", $src);
        $this->assertStringContainsString('workspace_members', $src);
        $this->assertMatchesRegularExpression(
            "/=== 'workspace'\) return null/",
            $src,
            'Auth::current() doit refuser toute session rattachée à un compte-structure.'
        );
    }
}
