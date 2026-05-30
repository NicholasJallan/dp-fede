<?php
declare(strict_types=1);

// GET /api/proxy/maree — Données de marée SHOM pour un point GPS et une date
// Proxy server-side : évite les restrictions CORS + Referer de l'API services.data.shom.fr
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

    // Parsing de la date (on accepte YYYY-MM-DD ou ISO datetime)
    $diveDate = DateTime::createFromFormat('Y-m-d', substr($date, 0, 10), new DateTimeZone('Europe/Paris'));
    if ($diveDate === false) {
        Json::abort(400, 'Format de date invalide (attendu YYYY-MM-DD)');
    }
    $diveDate->setTime(0, 0, 0);

    // Offset UTC en heures entières (ex: +02:00 → 2, +01:00 → 1)
    $offsetStr = $diveDate->format('P'); // "+02:00"
    $utcHours  = (int) round((int) str_replace(':', '', $offsetStr) / 100);

    $diveDayStr = $diveDate->format('Y-m-d');

    // Tous les appels SHOM nécessitent ce Referer (authentification par origine)
    $SHOM_REFERER = 'https://maree.shom.fr/';

    /**
     * @throws RuntimeException
     */
    $shomFetch = function (string $url) use ($SHOM_REFERER): array {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('curl non disponible sur ce serveur');
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'DP-Assistant/1.0',
            CURLOPT_HTTPHEADER     => [
                'Accept: application/json',
                'Referer: ' . $SHOM_REFERER,
            ],
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
        // 1. Liste des ports de référence SHOM (WFS) — mise en cache APCu 24h si disponible
        $WFS_URL = 'https://services.data.shom.fr/x13f1b4faeszdyinv9zqxmx1/wfs'
                 . '?service=WFS&version=1.0.0&srsName=EPSG:3857&request=GetFeature'
                 . '&typeName=SPM_PORTS_WFS:liste_ports_spm_h2m&outputFormat=application/json';

        $harbors = null;
        $cacheKey = 'shom_harbors_v1';
        if (extension_loaded('apcu') && apcu_enabled()) {
            $cached = apcu_fetch($cacheKey, $ok);
            if ($ok) {
                $harbors = $cached;
            }
        }
        if ($harbors === null) {
            $wfsData = $shomFetch($WFS_URL);
            $harbors = $wfsData['features'] ?? [];
            if (empty($harbors)) {
                throw new RuntimeException('Liste des ports SHOM vide ou invalide');
            }
            if (extension_loaded('apcu') && apcu_enabled()) {
                apcu_store($cacheKey, $harbors, 86400); // cache 24h
            }
        }

        // 2. Port le plus proche (distance haversine en degrés carrés — suffisant pour un tri)
        $best     = null;
        $bestDist = PHP_FLOAT_MAX;
        foreach ($harbors as $f) {
            $props = $f['properties'] ?? [];
            // Ignorer ports sans données de marée (nota=6) ou sans décalage UTC
            if (($props['nota'] ?? 0) === 6 || $props['ut'] === null) {
                continue;
            }
            $pLat = (float) ($props['lat'] ?? 0);
            $pLon = (float) ($props['lon'] ?? 0);
            $dLat = $pLat - (float) $lat;
            $dLon = $pLon - (float) $lng;
            $dist = $dLat * $dLat + $dLon * $dLon;
            if ($dist < $bestDist) {
                $bestDist = $dist;
                $best     = $props;
            }
        }
        if ($best === null) {
            throw new RuntimeException('Aucun port de référence SHOM trouvé à proximité');
        }

        $harborCode = (string) $best['cst'];
        $harborName = (string) ($best['toponyme'] ?? $harborCode);
        $correlation = (int) ($best['coeff'] ?? 1);

        // 3. Prédictions de marée HLT (P+1 jour pour couvrir les décalages)
        $HLT_URL = 'https://services.data.shom.fr/b2q8lrcdl4s04cbabsj4nhcb/hdm/spm/hlt'
                 . '?harborName=' . urlencode($harborCode)
                 . '&duration=2'
                 . '&date=' . urlencode($diveDayStr)
                 . '&utc=' . $utcHours
                 . '&correlation=' . $correlation;

        $tidesData = $shomFetch($HLT_URL);

        // La clé est la date YYYY-MM-DD
        $dayTides = $tidesData[$diveDayStr] ?? null;
        if (!is_array($dayTides) || empty($dayTides)) {
            throw new RuntimeException("Aucune marée trouvée pour le {$diveDayStr}");
        }

        // 4. Formater en "PM 05h10 coef 70 (6.2m) · BM 11h31 (1.9m)"
        // Format réponse : [type, "HH:MM", "height", "coeff_or_---"]
        $parts = [];
        foreach ($dayTides as $t) {
            if (!is_array($t) || count($t) < 3) {
                continue;
            }
            $type   = (string) $t[0]; // "tide.high" | "tide.low" | "tide.none"
            $time   = (string) $t[1]; // "HH:MM" ou "--:--"
            $height = (string) $t[2]; // "6.20" ou "---"
            $coef   = (string) ($t[3] ?? '');

            if ($type === 'tide.none' || $time === '--:--' || $height === '---') {
                continue;
            }

            $label  = $type === 'tide.high' ? 'PM' : 'BM';
            $hhmm   = str_replace(':', 'h', $time); // "05h10"
            $coefStr = ($coef !== '---' && $coef !== '') ? " coef {$coef}" : '';
            $heightStr = ' (' . number_format((float) $height, 1, '.', '') . 'm)';
            $parts[] = "{$label} {$hhmm}{$coefStr}{$heightStr}";
        }

        if (empty($parts)) {
            throw new RuntimeException("Aucune marée valide pour le {$diveDayStr}");
        }

        Json::ok([
            'harbor' => $harborName,
            'date'   => $diveDayStr,
            'tides'  => implode(' · ', $parts),
        ]);

    } catch (RuntimeException $e) {
        Json::abort(502, $e->getMessage());
    }
}
