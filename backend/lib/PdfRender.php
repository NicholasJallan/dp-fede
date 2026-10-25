<?php
declare(strict_types=1);

/**
 * Rendu PDF côté serveur depuis les données métier (dive_id → DB → mPDF).
 * Élimine le LFI par construction : le HTML est 100 % généré par le serveur.
 */
class PdfRender
{
    /** CSS partagé des deux templates PDF (fiche + check-list). */
    public static function sharedCss(): string
    {
        return <<<'CSS'
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: white;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #1e293b;
    line-height: 1.45;
}
h2 {
    font-size: 11px;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 5px;
    margin: 16px 0 9px;
}
table { width: 100%; border-collapse: collapse; font-size: 12px; }
table th {
    text-align: left;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #94a3b8;
    font-weight: 600;
    border-bottom: 1px solid #1e293b;
    padding: 5px 8px;
}
table td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: top; }
.mono { font-family: 'Courier New', monospace; }
.muted { color: #94a3b8; }
.label {
    font-family: 'Courier New', monospace;
    font-size: 9px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 2px;
}
.pill {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    font-size: 11px;
    margin: 2px 2px 2px 0;
}
/* Teinte par type de palanquée (le type est aussi écrit sous P1, P2… :
   lisible en noir et blanc). Jamais de rouge : réservé au bloquant. */
.row-exploration td { background: #f0fdf6; }
.row-guidee      td { background: #eff6ff; }
.row-formation   td { background: #fefce8; }
.row-bapteme     td { background: #f5f3ff; }
CSS;
    }

    /**
     * Échappe une valeur pour HTML. Tolère tout type : les réponses JSON du
     * front contiennent aussi des nombres (profondeurs, durées, numéros…) et
     * les templates sont en strict_types. Tableaux/objets → chaîne vide.
     *
     * @param mixed $v
     */
    public static function h($v): string
    {
        return htmlspecialchars(self::toText($v), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** Paliers saisis par tranche de 3 m (miroir de src/domain/paliers.js). */
    public const PALIER_DEPTHS = [9, 6, 3];

    /**
     * Résumé des paliers réalisés d'une palanquée (render_state.realises[id]) :
     * « 6 m 2 min · 3 m 5 min · confort 5 m 3 min », null sans palier.
     * Même sortie que formatPaliers() côté front (tests/fixtures/paliers.json).
     * Texte brut : à échapper par l'appelant.
     *
     * @param mixed $real
     */
    public static function formatPaliers($real): ?string
    {
        if (!is_array($real)) return null;
        $positive = static function ($v): float {
            return (is_int($v) || is_float($v) || (is_string($v) && is_numeric(trim($v)))) && (float)$v > 0 ? (float)$v : 0.0;
        };
        $parts = [];
        $paliers = is_array($real['paliers'] ?? null) ? $real['paliers'] : [];
        foreach (self::PALIER_DEPTHS as $d) {
            $m = $positive($paliers[$d] ?? ($paliers[(string)$d] ?? null));
            if ($m > 0) $parts[] = "{$d} m " . self::toText($m) . ' min';
        }
        $confort = is_array($real['confort'] ?? null) ? $real['confort'] : [];
        if (!empty($confort['on']) && $positive($confort['duree'] ?? null) > 0) {
            $depth = $positive($confort['profondeur'] ?? null);
            $parts[] = 'confort ' . ($depth > 0 ? self::toText($depth) . ' m ' : '') . self::toText($positive($confort['duree'])) . ' min';
        }
        return $parts ? implode(' · ', $parts) : null;
    }

    /**
     * Conversion texte sûre d'une valeur scalaire (fonction pure, testée).
     *
     * @param mixed $v
     */
    public static function toText($v): string
    {
        if ($v === null) return '';
        if (is_bool($v)) return $v ? 'oui' : 'non';
        if (is_int($v) || is_string($v)) return (string)$v;
        if (is_float($v)) {
            // 12.0 → « 12 », 12.5 → « 12.5 » (pas de notation scientifique).
            return rtrim(rtrim(number_format($v, 6, '.', ''), '0'), '.');
        }
        if (is_object($v) && method_exists($v, '__toString')) return (string)$v;
        return '';
    }

    /**
     * Formate une date ISO en français (ex : 14 juin 2026 — 09:00).
     *
     * @param mixed $s
     */
    public static function formatDateTime($s): string
    {
        $s = self::toText($s);
        if ($s === '') return '—';
        try {
            $d = new DateTime($s);
            $months = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                       'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
            $day  = $d->format('j');
            $mon  = $months[(int)$d->format('n')];
            $year = $d->format('Y');
            $time = $d->format('H:i');
            return "{$day} {$mon} {$year} — {$time}";
        } catch (\Throwable $e) {
            return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        }
    }

    /** Nom complet d'un plongeur (Prénom NOM). */
    public static function diverFullName(array $d): string
    {
        return trim(self::h($d['prenom'] ?? '') . ' ' . mb_strtoupper(self::h($d['nom'] ?? '')));
    }

    /** Tri des membres pour la fiche : encadrant > GP > PE > PA > Baptême ; 2e GP en serre-file. */
    public static function sortMembresForFiche(array $membres): array
    {
        $priorityMap = [
            'E4' => 0, 'E3' => 1, 'E2' => 2, 'E1' => 3,
            'GP' => 4,
            'PE60' => 5, 'PE40' => 6, 'PE20' => 7,
            'PTH120' => 8, 'PTH70' => 9,
            'PA12' => 10, 'PA20' => 10, 'PA40' => 10, 'PA60' => 10,
            'Baptême' => 11,
            // Rôles de la Polynésie (arrêté n° 199 CM), au rang de leurs équivalents.
            'ENS-50' => 0, 'ENS-40' => 0.5, 'ENS-30' => 1, 'ENS-20' => 2, 'ENS-06' => 3,
            'GP-50' => 4, 'GP-40' => 4.5,
            'PE-50' => 5, 'PE-40' => 6, 'PE-30' => 6.5, 'PE-20' => 7, 'PE-12' => 7.5,
            'PA-12' => 10, 'PA-20' => 10, 'PA-30' => 10, 'PA-40' => 10, 'PA-50' => 10,
            'Débutant' => 10.5,
        ];
        $priority = function (string $apt) use ($priorityMap): float {
            return (float)($priorityMap[$apt] ?? 99);
        };
        $isGp = static fn(string $apt): bool => $apt === 'GP' || str_starts_with($apt, 'GP-');
        $sorted = $membres;
        usort($sorted, fn($a, $b) => $priority($a['aptitude'] ?? '') <=> $priority($b['aptitude'] ?? ''));

        // 2 GP : le dernier GP devient serre-file (déplacé en queue)
        $gpCount = count(array_filter($sorted, fn($m) => $isGp((string)($m['aptitude'] ?? ''))));
        if ($gpCount >= 2) {
            for ($i = count($sorted) - 1; $i >= 0; $i--) {
                if ($isGp((string)($sorted[$i]['aptitude'] ?? ''))) {
                    $sf = array_splice($sorted, $i, 1)[0];
                    $sorted[] = $sf;
                    break;
                }
            }
        }
        return $sorted;
    }

    /**
     * Génère le HTML complet rendu par mPDF.
     * @param string $title   Titre du document
     * @param string $body    Contenu HTML du template
     */
    public static function buildHtml(string $title, string $body): string
    {
        $css = self::sharedCss();
        return <<<HTML
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{$title}</title>
<style>
{$css}
</style>
</head>
<body>
{$body}
</body>
</html>
HTML;
    }

    /**
     * Génère un PDF via mPDF (PHP pur, pas de process externe).
     * Remplace wkhtmltopdf (archivé 2022, Qt WebKit 538 non patché).
     * Lève une RuntimeException en cas d'échec.
     */
    public static function generate(string $html): string
    {
        // mPDF est chargé via l'autoloader Composer (/vendor/autoload.php inclus par index.php)
        $mpdf = new \Mpdf\Mpdf([
            'mode'          => 'utf-8',
            'format'        => 'A4',
            'margin_top'    => 12,
            'margin_bottom' => 12,
            'margin_left'   => 12,
            'margin_right'  => 12,
            'tempDir'       => sys_get_temp_dir() . '/mpdf',
        ]);
        $mpdf->SetDisplayMode('fullpage');
        try {
            $mpdf->WriteHTML($html);
            return $mpdf->Output('', 'S');
        } catch (\Throwable $e) {
            throw new RuntimeException('mPDF : ' . $e->getMessage());
        }
    }

    /** Stream le PDF vers le client HTTP. */
    public static function stream(string $pdf, string $filename): void
    {
        $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        if (substr($safe, -4) !== '.pdf') $safe .= '.pdf';
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $safe . '"');
        header('Content-Length: ' . strlen($pdf));
        header('X-Content-Type-Options: nosniff');
        echo $pdf;
        exit;
    }
}
