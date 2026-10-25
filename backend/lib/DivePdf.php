<?php
declare(strict_types=1);

require_once __DIR__ . '/PdfRender.php';
require_once __DIR__ . '/Rules.php';
require_once __DIR__ . '/ChecklistRules.php';

/**
 * Rendu PDF (fiche de sécurité / check-list) d'une plongée d'un club.
 * Partagé par POST /api/pdf/fiche (téléchargement immédiat) et par
 * l'archivage serveur (DiveArchive). Ne termine jamais la requête : les
 * erreurs remontent en exception (RuntimeException).
 */
class DivePdf
{
    public const TYPES = ['fiche', 'checklist'];

    private const TITLES = [
        'fiche'     => 'Fiche de sécurité',
        'checklist' => 'Check-list opérationnelle',
    ];

    /** Plongée active du club (par id ou client_uuid), runtime state inclus. */
    public static function loadForClub(string $idOrUuid, string $clubId): ?array
    {
        return Db::row(
            'SELECT d.*, COALESCE(r.state, d.render_state) AS render_state
               FROM dives d
               LEFT JOIN dive_runtime_state r ON r.dive_id = d.id
              WHERE (d.id=? OR d.client_uuid=?) AND d.club_id=? AND d.deleted_at IS NULL
              ORDER BY (d.id = ?) DESC
              LIMIT 1',
            [$idOrUuid, $idOrUuid, $clubId, $idOrUuid]
        );
    }

    /** Variables « structure » attendues par les templates ($user['club_nom']…). */
    public static function clubProfile(string $clubId): array
    {
        // Club éventuellement soft-deleted (fiches en conservation légale).
        $c = Db::row('SELECT * FROM clubs WHERE id=?', [$clubId]) ?? [];
        return [
            'club_nom'         => $c['nom'] ?? null,
            'club_numero'      => $c['numero_ffessm'] ?? null,
            'structure_type'   => $c['structure_type'] ?? null,
            'president_prenom' => $c['president_prenom'] ?? null,
            'president_nom'    => $c['president_nom'] ?? null,
            'president_tel'    => $c['president_tel'] ?? null,
            // Même repli que l'écran (Club::profileOverlay) : 112 si le club n'a rien réglé.
            'urgence_defaut'   => ($c['urgence_defaut'] ?? null) ?: Club::DEFAULT_URGENCE,
        ];
    }

    /** Génère le PDF (octets). */
    public static function render(array $dive, string $type, array $profile): string
    {
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidArgumentException("Type de document inconnu : {$type}");
        }
        $answers     = Account::decodeJson($dive['answers'] ?? null, []);
        $palanquees  = Account::decodeJson($dive['palanquees'] ?? null, []);
        $renderState = Account::decodeJson($dive['render_state'] ?? null, []);
        $vars = [
            'answers'     => is_array($answers) ? $answers : [],
            'palanquees'  => is_array($palanquees) ? $palanquees : [],
            'renderState' => is_array($renderState) ? $renderState : [],
            'diversById'  => self::diversById(is_array($palanquees) ? $palanquees : [], (string)$dive['club_id']),
            'user'        => $profile,
        ];
        $file = __DIR__ . '/../templates/' . ($type === 'checklist' ? 'checklist.php' : 'fiche.php');
        $html = PdfRender::buildHtml(self::TITLES[$type], self::renderTemplate($file, $vars));
        return PdfRender::generate($html);
    }

    /** Nom de fichier proposé au téléchargement. */
    public static function filename(array $dive, string $type): string
    {
        $site = preg_replace('/[^a-zA-Z0-9-]/', '-', substr((string)($dive['site_nom'] ?? 'site'), 0, 30));
        $date = substr((string)($dive['date_plongee'] ?? date('Y-m-d')), 0, 10);
        return "{$date}-{$type}-{$site}.pdf";
    }

    /**
     * Plongeurs référencés par les palanquées. Les fiches supprimées depuis
     * restent lisibles (document historique) ; à défaut, on reprend les nom /
     * prénom / licence copiés dans la palanquée à l'archivage.
     */
    private static function diversById(array $palanquees, string $clubId): array
    {
        $members = [];
        foreach ($palanquees as $p) {
            foreach ((array)($p['membres'] ?? []) as $m) {
                if (is_array($m) && empty($m['_bapteme']) && !empty($m['diverId']) && is_string($m['diverId'])) {
                    $members[$m['diverId']] = $m;
                }
            }
        }
        if (!$members) return [];

        $ids  = array_keys($members);
        $phs  = implode(',', array_fill(0, count($ids), '?'));
        $rows = Db::all(
            "SELECT id, nom, prenom, licence, niveau_plongeur, niveau_encadrant FROM divers
              WHERE id IN ({$phs}) AND club_id=?",
            [...$ids, $clubId]
        );
        $out = [];
        foreach ($rows as $row) $out[$row['id']] = $row;
        foreach ($members as $id => $m) {
            if (isset($out[$id])) continue;
            $out[$id] = [
                'id' => $id, 'nom' => $m['nom'] ?? '', 'prenom' => $m['prenom'] ?? '',
                'licence' => $m['licence'] ?? '', 'niveau_plongeur' => null, 'niveau_encadrant' => null,
            ];
        }
        return $out;
    }

    /** Exécute un template dans une portée isolée et renvoie le HTML produit. */
    private static function renderTemplate(string $file, array $vars): string
    {
        $render = static function (string $__file, array $__vars): string {
            extract($__vars, EXTR_SKIP);
            ob_start();
            try {
                require $__file;
                return (string)ob_get_clean();
            } catch (\Throwable $e) {
                ob_end_clean();
                throw $e;
            }
        };
        return $render($file, $vars);
    }
}
