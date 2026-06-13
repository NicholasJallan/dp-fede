<?php
declare(strict_types=1);

/**
 * Sanitisation HTML avant génération PDF via wkhtmltopdf.
 * Bloque le LFI (Local File Inclusion) et le SSRF en supprimant les balises
 * et schémas URI qui permettraient d'accéder au système de fichiers local
 * ou à des services internes depuis Qt WebKit.
 */
class HtmlSanitizer {
    /** Balises pouvant charger des ressources arbitraires */
    private const BLOCKED_TAGS = ['iframe', 'object', 'embed', 'base'];

    /** Schémas URI dangereux dans src/href */
    private const BLOCKED_SCHEMES = ['file', 'gopher', 'dict', 'ftp', 'jar', 'javascript', 'vbscript'];

    public static function forPdf(string $html): string {
        // 1. Supprimer les balises bloquées (avec contenu éventuel)
        foreach (self::BLOCKED_TAGS as $tag) {
            $html = preg_replace("/<{$tag}\b[^>]*>.*?<\/{$tag}>/is", '', $html) ?? $html;
            $html = preg_replace("/<{$tag}\b[^>]*\/?>/i", '', $html) ?? $html;
        }

        // 2. Supprimer <link rel="import"> (pas de <link> légitime dans les fiches)
        $html = preg_replace('/<link\b[^>]*\brel\s*=\s*["\']?import["\']?[^>]*\/?>/i', '', $html) ?? $html;

        // 3. Neutraliser les schémas dangereux dans src= et href=
        $html = preg_replace_callback(
            '/\b(src|href)\s*=\s*(["\'])(.*?)\2/is',
            [self::class, 'sanitizeUri'],
            $html
        ) ?? $html;

        return $html;
    }

    private static function sanitizeUri(array $m): string {
        $attr  = $m[1];
        $quote = $m[2];
        $uri   = trim($m[3]);

        foreach (self::BLOCKED_SCHEMES as $scheme) {
            if (stripos($uri, $scheme . ':') === 0) {
                return "{$attr}={$quote}about:blank{$quote}";
            }
        }

        // data: autorisé uniquement pour les images inline
        if (stripos($uri, 'data:') === 0 && stripos($uri, 'data:image/') !== 0) {
            return "{$attr}={$quote}about:blank{$quote}";
        }

        return $m[0];
    }
}
