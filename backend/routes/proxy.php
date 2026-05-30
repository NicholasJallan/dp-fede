<?php
declare(strict_types=1);

// GET /api/proxy/maree — Données de marée SHOM pour un point GPS et une date
// Proxy server-side : évite les restrictions CORS de l'API maree.shom.fr
if ($method === 'GET' && $path === '/api/proxy/maree') {
    Auth::require();

    $lat  = filter_var($_GET['lat']  ?? '', FILTER_VALIDATE_FLOAT);
    $lng  = filter_var($_GET['lng']  ?? '', FILTER_VALIDATE_FLOAT);
    $date = $_GET['date'] ?? '';

    if ($lat === false || $lat === 0.0 || $lng === false || $lng === 0.0) {
        Json::abort(400, 'Coordonnées GPS manquantes ou invalides');
    }
    if (!$date) {
        Json::abort(400, 'Date manquante');
    }

    // Clé API publique embarquée dans l'app officielle maree.shom.fr
    $SHOM_KEY = 'hmkWfT79hfJqLMzZUqOT4v8zQtJWLANO';

    // Parsing de la date (on accepte YYYY-MM-DD ou ISO datetime)
    $diveDate = DateTime::createFromFormat('Y-m-d', substr($date, 0, 10), new DateTimeZone('Europe/Paris'));
    if ($diveDate === false) {
        Json::abort(400, 'Format de date invalide (attendu YYYY-MM-DD)');
    }
    $diveDate->setTime(0, 0, 0);

    /**
     * @throws RuntimeException
     */
    $shomFetch = function (string $url): array {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('curl non disponible sur ce serveur');
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'DP-Assistant/1.0',
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);
        $body    = curl_exec($ch);
        $code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($body === false || $curlErr) {
            throw new RuntimeException("Erreur réseau SHOM : {$curlErr}");
        }
        if ($code !== 200) {
            throw new RuntimeException("Service SHOM indisponible (HTTP {$code})");
        }
        $data = json_decode($body, true);
        if ($data === null) {
            throw new RuntimeException('Réponse SHOM invalide (JSON corrompu)');
        }
        return $data;
    };

    try {
        // 1. Port de référence le plus proche
        $harborUrl  = sprintf(
            'https://maree.shom.fr/%s/harbor/nearest/latlon?latitude=%s&longitude=%s',
            $SHOM_KEY, $lat, $lng
        );
        $harbor     = $shomFetch($harborUrl);
        $harborCode = $harbor['code'] ?? $harbor['codeHarbor'] ?? null;
        $harborName = $harbor['name'] ?? $harbor['libelle']     ?? $harborCode;
        if (!$harborCode) {
            throw new RuntimeException('Aucun port de référence SHOM trouvé à proximité');
        }

        // 2. Prédictions de marée pour la journée (P2D = 2 jours pour couvrir le décalage UTC)
        $tz        = new DateTimeZone('Europe/Paris');
        $offsetStr = $diveDate->format('P');              // +02:00 ou +01:00
        $tsISO     = $diveDate->format('Y-m-d\T00:00:00P');

        $tidesUrl = sprintf(
            'https://maree.shom.fr/%s/tidestation/%s/tides?duration=P2D&timestamp=%s&utcOffset=%s',
            $SHOM_KEY, $harborCode, urlencode($tsISO), urlencode($offsetStr)
        );
        $tidesData = $shomFetch($tidesUrl);

        // Normaliser : datums ou tides selon version de l'API
        $tides = $tidesData['datums'] ?? $tidesData['tides'] ?? (is_array($tidesData) ? $tidesData : []);
        if (!is_array($tides) || empty($tides)) {
            throw new RuntimeException('Aucune donnée de marée retournée par SHOM');
        }

        // Filtrer sur le jour de plongée
        $diveDayStr = $diveDate->format('Y-m-d');
        $dayTides   = array_values(array_filter($tides, static function (array $t) use ($diveDayStr): bool {
            $raw = $t['datetime'] ?? $t['date'] ?? $t['time'] ?? '';
            return $raw !== '' && substr((string) $raw, 0, 10) === $diveDayStr;
        }));

        if (empty($dayTides)) {
            throw new RuntimeException("Aucune marée trouvée pour le {$diveDayStr}");
        }

        // Formater en "PM 14h12 coef 87 (6.2m) · BM 20h30 (1.1m)"
        $parts = [];
        foreach ($dayTides as $t) {
            $raw  = $t['datetime'] ?? $t['date'] ?? $t['time'] ?? '';
            $type = strtoupper((string) ($t['type'] ?? $t['kind'] ?? ''));
            $type = match ($type) {
                'HIGH', 'HIGHWATER', 'PM' => 'PM',
                'LOW',  'LOWWATER',  'BM' => 'BM',
                default => $type,
            };
            $dt = new DateTime($raw);
            $dt->setTimezone($tz);
            $hhmm   = $dt->format('H\hi');
            $coef   = isset($t['coefficient']) && $t['coefficient'] !== null
                      ? ' coef ' . (int) $t['coefficient']
                      : '';
            $height = isset($t['height'])
                      ? ' (' . number_format((float) $t['height'], 1, '.', '') . 'm)'
                      : '';
            $parts[] = "{$type} {$hhmm}{$coef}{$height}";
        }

        Json::ok([
            'harbor' => (string) $harborName,
            'date'   => $diveDayStr,
            'tides'  => implode(' · ', $parts),
        ]);

    } catch (RuntimeException $e) {
        Json::abort(502, $e->getMessage());
    }
}
