<?php
declare(strict_types=1);

/**
 * Statistiques du club (assemblée générale) sur une période :
 *   - plongées archivées, palanquées par type (et plongées comportant au
 *     moins une palanquée de chaque type) ;
 *   - plongeurs distincts, baptêmes, participations ;
 *   - heures cumulées (somme des durées réalisées par participant, soit des
 *     « heures-plongeur ») ;
 *   - plongées, plongées dirigées (DP) et minutes par plongeur.
 *
 * Source : dive_participants (rempli à l'archivage ; les plongées archivées
 * avant la phase 5 sont complétées à la volée par ensureParticipants()).
 * aggregate() et toCsv() sont purs (testés).
 */
class ClubStats
{
    public const PAL_TYPES = ['exploration', 'guidee', 'formation', 'bapteme'];
    private const MAX_RANGE_DAYS = 1830; // ~5 ans

    /**
     * Période demandée ; à défaut, la saison FFESSM courante.
     *
     * @return array{0:string,1:string}|string [from, to] ou message d'erreur
     */
    public static function parseRange(?string $from, ?string $to, DateTimeImmutable $today)
    {
        if (($from === null || $from === '') && ($to === null || $to === '')) {
            return ClubAlerts::seasonBounds(ClubAlerts::seasonFor($today)) ?? [$today->format('Y-01-01'), $today->format('Y-12-31')];
        }
        $f = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$from);
        $t = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$to);
        if (!$f || $f->format('Y-m-d') !== $from || !$t || $t->format('Y-m-d') !== $to) {
            return 'Paramètres from et to requis au format AAAA-MM-JJ';
        }
        if ($f > $t) return 'from doit précéder to';
        if ((int)$f->diff($t)->format('%a') > self::MAX_RANGE_DAYS) return 'Période limitée à 5 ans';
        return [$from, $to];
    }

    /**
     * @param list<array> $participants lignes dive_participants (+ nom, prenom, licence du plongeur)
     */
    public static function aggregate(array $participants, string $from, string $to): array
    {
        $dives       = [];
        $pals        = [];
        $divesByType = array_fill_keys(self::PAL_TYPES, []);
        $palsByType  = array_fill_keys(self::PAL_TYPES, 0);
        $divers      = [];
        $baptemes    = 0;
        $participations = 0;
        $minutes     = 0;

        foreach ($participants as $p) {
            $diveId = (string)$p['dive_id'];
            $dives[$diveId] = true;
            $diverId = $p['diver_id'] ?? null;

            if ($p['role'] === 'dp') {
                if ($diverId) $divers[self::ensureDiver($divers, $p)]['dp']++;
                continue;
            }

            $palKey = $diveId . '#' . (int)$p['palanquee'];
            $type   = in_array($p['pal_type'] ?? null, self::PAL_TYPES, true) ? $p['pal_type'] : 'exploration';
            if (!isset($pals[$palKey])) {
                $pals[$palKey] = true;
                $palsByType[$type]++;
            }
            $divesByType[$type][$diveId] = true;
            $participations++;
            $dur = isset($p['duree_realisee']) ? (int)$p['duree_realisee'] : 0;
            $minutes += $dur;

            if ($p['role'] === 'bapteme' || !$diverId) {
                $baptemes += $p['role'] === 'bapteme' ? 1 : 0;
                continue;
            }
            $id = self::ensureDiver($divers, $p);
            $divers[$id]['plongees_set'][$diveId] = true;
            $divers[$id]['minutes'] += $dur;
        }

        $parPlongeur = [];
        foreach ($divers as $id => $d) {
            $parPlongeur[] = [
                'diver_id' => $id,
                'nom'      => $d['nom'],
                'prenom'   => $d['prenom'],
                'licence'  => $d['licence'],
                'plongees' => count($d['plongees_set']),
                'dp'       => $d['dp'],
                'heures'   => round($d['minutes'] / 60, 1),
            ];
        }
        usort($parPlongeur, static fn(array $a, array $b): int =>
            [$b['plongees'], $b['dp'], $a['nom'], $a['prenom']] <=> [$a['plongees'], $a['dp'], $b['nom'], $b['prenom']]);

        return [
            'from'                => $from,
            'to'                  => $to,
            'plongees'            => count($dives),
            'palanquees'          => count($pals),
            'palanquees_par_type' => $palsByType,
            'plongees_par_type'   => array_map('count', $divesByType),
            'plongeurs_distincts' => count(array_filter($parPlongeur, static fn(array $p): bool => $p['plongees'] > 0)),
            'baptemes'            => $baptemes,
            'participations'      => $participations,
            'heures_cumulees'     => round($minutes / 60, 1),
            'par_plongeur'        => $parPlongeur,
        ];
    }

    /** Crée au besoin l'entrée du plongeur dans $divers ; retourne sa clé. */
    private static function ensureDiver(array &$divers, array $p): string
    {
        $id = (string)$p['diver_id'];
        if (!isset($divers[$id])) {
            $divers[$id] = [
                'nom' => (string)($p['nom'] ?? ''), 'prenom' => (string)($p['prenom'] ?? ''),
                'licence' => (string)($p['licence'] ?? ''), 'plongees_set' => [], 'dp' => 0, 'minutes' => 0,
            ];
        }
        return $id;
    }

    /**
     * Export CSV (séparateur « ; », UTF-8 avec BOM pour Excel) : bloc
     * d'indicateurs puis tableau par plongeur.
     */
    public static function toCsv(array $stats): string
    {
        $lines = [
            ['Indicateur', 'Valeur'],
            ['Période', $stats['from'] . ' au ' . $stats['to']],
            ['Plongées archivées', $stats['plongees']],
            ['Palanquées', $stats['palanquees']],
        ];
        foreach (self::PAL_TYPES as $t) {
            $lines[] = ['Palanquées ' . $t, $stats['palanquees_par_type'][$t] ?? 0];
        }
        foreach (self::PAL_TYPES as $t) {
            $lines[] = ['Plongées avec palanquée ' . $t, $stats['plongees_par_type'][$t] ?? 0];
        }
        array_push(
            $lines,
            ['Plongeurs distincts', $stats['plongeurs_distincts']],
            ['Baptêmes', $stats['baptemes']],
            ['Participations', $stats['participations']],
            ['Heures cumulées (heures-plongeur)', self::decimal($stats['heures_cumulees'])],
            [],
            ['Nom', 'Prénom', 'Licence', 'Plongées', 'Plongées dirigées (DP)', 'Heures']
        );
        foreach ($stats['par_plongeur'] as $p) {
            $lines[] = [$p['nom'], $p['prenom'], $p['licence'], $p['plongees'], $p['dp'], self::decimal($p['heures'])];
        }
        $out = "\xEF\xBB\xBF";
        foreach ($lines as $cells) {
            $out .= implode(';', array_map([self::class, 'csvCell'], $cells)) . "\r\n";
        }
        return $out;
    }

    /** Cellule CSV échappée, neutralisant l'injection de formules (= + - @). */
    public static function csvCell($v): string
    {
        $s = is_float($v) ? self::decimal($v) : (string)$v;
        if ($s !== '' && !is_int($v) && !is_float($v) && strpbrk($s[0], "=+-@\t\r") !== false) {
            $s = "'" . $s;
        }
        if (strpbrk($s, ";\"\r\n") !== false) {
            $s = '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    }

    private static function decimal($v): string
    {
        return str_replace('.', ',', (string)$v);
    }

    // ── Accès base ─────────────────────────────────────────────────────────

    public static function fetch(string $clubId, string $from, string $to): array
    {
        self::ensureParticipants($clubId, $from, $to);
        $rows = Db::all(
            "SELECT p.dive_id, p.diver_id, p.palanquee, p.pal_type, p.role, p.duree_realisee,
                    dv.nom, dv.prenom, dv.licence
               FROM dive_participants p
               JOIN dives d ON d.id = p.dive_id
               LEFT JOIN divers dv ON dv.id = p.diver_id AND dv.club_id = p.club_id
              WHERE p.club_id=? AND d.status='archived' AND d.deleted_at IS NULL
                AND d.date_plongee >= ? AND d.date_plongee < DATE_ADD(?, INTERVAL 1 DAY)",
            [$clubId, $from . ' 00:00:00', $to]
        );
        return self::aggregate($rows, $from, $to);
    }

    /**
     * Remplit dive_participants pour les plongées archivées AVANT la phase 5
     * (documents_status NULL) qui en ont besoin. Les plongées sans palanquée
     * sont exclues : elles n'auraient jamais de participant et seraient
     * recalculées à chaque appel.
     */
    private static function ensureParticipants(string $clubId, string $from, string $to): void
    {
        $missing = Db::all(
            "SELECT d.id FROM dives d
              WHERE d.club_id=? AND d.status='archived' AND d.deleted_at IS NULL
                AND d.date_plongee >= ? AND d.date_plongee < DATE_ADD(?, INTERVAL 1 DAY)
                AND d.documents_status IS NULL
                AND d.palanquees IS NOT NULL AND d.palanquees NOT IN ('', '[]')
                AND NOT EXISTS (SELECT 1 FROM dive_participants p WHERE p.dive_id = d.id)
              LIMIT 500",
            [$clubId, $from . ' 00:00:00', $to]
        );
        foreach ($missing as $m) {
            try {
                DiveArchive::refreshParticipants((string)$m['id']);
            } catch (\Throwable $e) {
                error_log('[dp-fede] participants ' . $m['id'] . ' : ' . $e->getMessage());
            }
        }
    }
}
