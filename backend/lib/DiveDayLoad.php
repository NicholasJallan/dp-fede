<?php
declare(strict_types=1);

/**
 * Charge d'une journée de plongée (Polynésie française, arrêté n° 199 CM,
 * art. 5 : nombre et durée quotidienne des plongées). Portage de
 * diveLoadEntries (src/domain/pf/pf-quota.js) : cas communs dans
 * tests/fixtures/daily-quota.json. Le contrôle (avertissements) est fait
 * côté interface ; ce module fournit les entrées des autres plongées du jour.
 */
final class DiveDayLoad
{
    /**
     * Une entrée par plongeur (hors baptême) et par palanquée, valeurs
     * réalisées sinon prévues.
     * @return list<array{diveId: string, diverId: string, profMax: int|float, duree: int|float, trimix: bool}>
     */
    public static function entries(array $dive): array
    {
        $pals = $dive['palanquees'] ?? [];
        if (is_string($pals)) $pals = json_decode($pals, true);
        if (!is_array($pals)) return [];
        $state = $dive['render_state'] ?? null;
        if (is_string($state)) $state = json_decode($state, true);
        $realises = is_array($state) && is_array($state['realises'] ?? null) ? $state['realises'] : [];

        $out = [];
        foreach ($pals as $p) {
            if (!is_array($p)) continue;
            $real    = is_array($realises[$p['id'] ?? ''] ?? null) ? $realises[$p['id']] : [];
            $profMax = self::num($real['profMax'] ?? $p['profMax'] ?? 0);
            $duree   = self::num($real['duree'] ?? $p['duree'] ?? 0);
            $trimix  = in_array('Tx', is_array($p['melanges'] ?? null) ? $p['melanges'] : [], true);
            foreach (is_array($p['membres'] ?? null) ? $p['membres'] : [] as $m) {
                if (!is_array($m) || empty($m['diverId']) || !empty($m['_bapteme']) || ($m['aptitude'] ?? '') === 'Baptême') continue;
                $out[] = [
                    'diveId'  => (string)($dive['id'] ?? ''),
                    'diverId' => (string)$m['diverId'],
                    'profMax' => $profMax,
                    'duree'   => $duree,
                    'trimix'  => $trimix,
                ];
            }
        }
        return $out;
    }

    /**
     * Entrées de toutes les plongées non supprimées du club à cette date
     * (AAAA-MM-JJ, jour calendaire de date_plongee).
     * @return list<array<string, mixed>>
     */
    public static function forDay(string $clubId, string $date, ?string $exclude = null): array
    {
        // Plongée en cours exclue (id serveur ou client_uuid de l'appareil).
        $sansCourante = $exclude !== null && $exclude !== ''
            ? ' AND d.id<>? AND (d.client_uuid IS NULL OR d.client_uuid<>?)' : '';
        $params = $sansCourante !== '' ? [$clubId, $date, $date, $exclude, $exclude] : [$clubId, $date, $date];
        $rows = Db::all(
            'SELECT d.id, d.client_uuid, d.palanquees, COALESCE(r.state, d.render_state) AS render_state FROM dives d
               LEFT JOIN dive_runtime_state r ON r.dive_id = d.id
              WHERE d.club_id=? AND d.deleted_at IS NULL AND d.date_plongee >= ? AND d.date_plongee < DATE_ADD(?, INTERVAL 1 DAY)' . $sansCourante,
            $params
        );
        $out = [];
        foreach ($rows as $row) $out = [...$out, ...self::entries($row)];
        return $out;
    }

    /** Nombre JSON ou chaîne numérique (« 18 ») → int|float ; sinon 0. */
    private static function num(mixed $v): int|float
    {
        if (is_int($v) || is_float($v)) return $v;
        return is_string($v) && is_numeric(trim($v)) ? trim($v) + 0 : 0;
    }
}
