<?php
declare(strict_types=1);
/**
 * Template PHP — Fiche de sécurité (port de FicheStatique depuis screen-archive.jsx).
 * Variables attendues :
 *   $answers    array   Réponses session
 *   $palanquees array   Palanquées
 *   $renderState array  {pressions, realises, heuresDebut, heuresFin}
 *   $diversById array   Map diverId → diver (depuis DB)
 *   $user       array   Utilisateur courant (club_nom, structure_type, ...)
 */

$h   = fn(?string $v): string => PdfRender::h($v);
$fmt = fn(?string $v): string => PdfRender::formatDateTime($v);

$siteName = $answers['site_nom'] ?? $answers['site'] ?? '—';
$parts    = [$siteName];
if (!empty($answers['site_ville'])) $parts[] = $h($answers['site_ville']);
if (!empty($answers['site_pays']))  $parts[] = $h($answers['site_pays']);
$siteLabel = implode(', ', array_map($h, [$answers['site_nom'] ?? $answers['site'] ?? '—']));
$siteLabel = $h($siteName);
if (!empty($answers['site_ville'])) $siteLabel .= ', ' . $h($answers['site_ville']);
if (!empty($answers['site_pays']))  $siteLabel .= ', ' . $h($answers['site_pays']);

$departArr = array_filter([
    !empty($answers['depart_bord'])   ? 'Du bord'   : null,
    !empty($answers['depart_bateau']) ? 'En bateau' : null,
]);
$depart = $departArr ? implode(' / ', $departArr) : '—';
if (!empty($answers['shot_line'])) $depart .= ' · Shot-line';

$STRUCTURE_LABELS = [
    'club'  => 'Club FFESSM associatif',
    'sca'   => 'Structure Commerciale Agréée (SCA)',
    'csa'   => "Convention de Section d'Activité (CSA)",
    'autre' => 'Autre',
];
$structParts = [];
if (!empty($user['club_nom'])) {
    $structParts[] = $h($user['club_nom']);
    if (!empty($user['structure_type'])) {
        $structParts[] = $h($STRUCTURE_LABELS[$user['structure_type']] ?? $user['structure_type']);
    }
    if (!empty($user['club_numero'])) $structParts[] = '(' . $h($user['club_numero']) . ')';
}
$structure = $structParts ? implode(' — ', array_slice($structParts, 0, 1)) . (isset($structParts[1]) ? ' — ' . implode(' — ', array_slice($structParts, 1)) : '') : 'Structure non renseignée';

// Mélanges toutes palanquées
$allMelanges = [];
foreach ($palanquees as $p) {
    foreach ($p['melanges'] ?? [] as $m) { $allMelanges[$m] = true; }
}
$melangesLabel = $allMelanges ? implode(' · ', array_map($h, array_keys($allMelanges))) : '—';

// Comptage aptitudes
$aptUsage = [];
foreach ($palanquees as $p) {
    foreach ($p['membres'] ?? [] as $m) {
        $a = $m['aptitude'] ?? 'Sans';
        $aptUsage[$a] = ($aptUsage[$a] ?? 0) + 1;
    }
}

// Sécurité surface
$secItems = [];
$secItems[] = '• Sécurité surface : <b>' . (!empty($answers['sec_surface']) ? 'Présente' : 'Non identifiée') . '</b>';
if (!empty($answers['sec_surface_membres']) && is_array($answers['sec_surface_membres'])) {
    $names = array_filter(array_map(fn($id) => isset($diversById[$id]) ? PdfRender::diverFullName($diversById[$id]) : null, $answers['sec_surface_membres']));
    if ($names) $secItems[] = '• Plongeurs surveillance : <b>' . implode(', ', $names) . '</b>';
}
if (!empty($answers['sec_surface_externes'])) {
    $secItems[] = '• Non-plongeurs : <b>' . $h($answers['sec_surface_externes']) . '</b>';
}
$secItems[] = '• Plan de secours : <b>' . (!empty($answers['plan_secours']) ? 'Affiché et à jour' : 'À vérifier') . '</b>';
$secItems[] = '• Coordonnées secours : <b>' . (!empty($answers['coords_secours']) ? 'Disponibles et affichées' : 'À vérifier') . '</b>';
$secItems[] = '• Matériel O₂ vérifié : <b>' . (!empty($answers['o2']) ? 'Oui' : 'Non') . '</b>';
$secItems[] = '• Trousse de secours + couv. iso : <b>' . (!empty($answers['trousse']) ? 'Oui' : 'Non') . '</b>';
$secItems[] = '• VHF : <b>' . (!empty($answers['vhf']) ? 'Embarquée et testée' : '—') . '</b>';
if (!empty($answers['pavillon_alpha']) || !empty($answers['bouee_surface'])) {
    $secItems[] = '• Pavillon Alpha : <b>Hissé / présent</b>';
}
if (!empty($answers['eau_potable'])) $secItems[] = '• Eau douce potable : <b>Oui</b>';
if (!empty($answers['rappel']))     $secItems[] = '• Moyen de rappel : <b>Oui</b>';
$urgenceNum = $h($answers['urgence_num'] ?? $user['urgence_defaut'] ?? '18');
$secItems[] = "• Numéro d'urgence : <b>{$urgenceNum}</b>";

$half = (int)ceil(count($secItems) / 2);
$secLeft  = array_slice($secItems, 0, $half);
$secRight = array_slice($secItems, $half);

// Coordonnées GPS
$coords = $answers['site_coords'] ?? null;
if (is_string($coords)) $coords = json_decode($coords, true);
$gpsLabel = (isset($coords['lat']) && $coords['lat'] !== null)
    ? number_format((float)$coords['lat'], 5, '.', '') . ', ' . number_format((float)$coords['lng'], 5, '.', '')
    : '—';

// Palanquée mélange
$palMelange = function (array $p): string {
    $arr = $p['melanges'] ?? [];
    return $arr ? implode(' · ', array_map(fn($m) => htmlspecialchars($m, ENT_QUOTES, 'UTF-8'), $arr)) : 'Air';
};

$pressions   = $renderState['pressions']   ?? [];
$realises    = $renderState['realises']    ?? [];
$heuresDebut = $renderState['heuresDebut'] ?? [];
$heuresFin   = $renderState['heuresFin']   ?? [];
?>
<div class="fiche" style="background:white;padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1e293b;">

  <!-- En-tête -->
  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #1e293b;padding-bottom:14px;margin-bottom:16px;">
    <div>
      <span style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;font-weight:600;display:block;">FICHE DE SÉCURITÉ — Art. A322-72 du Code du Sport</span>
      <h1 style="font-size:22px;font-weight:700;margin:4px 0 2px;letter-spacing:-0.005em;"><?= $siteLabel ?></h1>
      <div class="muted mono" style="font-size:11px;">
        <?= $structure ?>
        <?php if (!empty($user['president_nom'])): ?>
          <div>Président : <?= $h($user['president_prenom'] ?? '') ?> <?= $h($user['president_nom']) ?><?= !empty($user['president_tel']) ? ' · ' . $h($user['president_tel']) : '' ?></div>
        <?php endif; ?>
      </div>
    </div>
    <div style="text-align:right;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.06em;">
      <b style="display:block;font-size:13px;"><?= $fmt($answers['date'] ?? null) ?></b>
      <div>DP : <?= $h($answers['dp_nom'] ?? '—') ?> (<?= $h($answers['dp_qual'] ?? '—') ?>)</div>
      <div>Activité : <?= $h($answers['activite'] ?? '—') ?></div>
      <div>Urgences : <b><?= $urgenceNum ?></b></div>
    </div>
  </div>

  <!-- Milieu / Départ / Mélanges -->
  <table style="margin:12px 0 6px;table-layout:fixed;">
    <tbody>
      <tr>
        <td style="width:33%;vertical-align:top;padding:2px 12px 2px 0;border:0;">
          <div class="label">Milieu</div>
          <div style="font-weight:600;font-size:13px;"><?= $h($answers['milieu'] ?? '—') ?></div>
        </td>
        <td style="width:33%;vertical-align:top;padding:2px 12px;border:0;">
          <div class="label">Départ</div>
          <div style="font-weight:600;font-size:13px;"><?= $h($depart) ?></div>
        </td>
        <td style="width:34%;vertical-align:top;padding:2px 0 2px 12px;border:0;">
          <div class="label">Mélanges</div>
          <div style="font-weight:600;font-size:12px;"><?= $melangesLabel ?></div>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin:0 0 18px;">
    <div class="label">Conditions</div>
    <div style="font-weight:500;font-size:12px;"><?= $h($answers['meteo'] ?? '—') ?></div>
  </div>

  <!-- Palanquées -->
  <h2>Palanquées — paramètres prévus et réalisés</h2>
  <table>
    <thead>
      <tr>
        <th style="width:28px;">#</th>
        <th>Plongeur</th>
        <th>Aptitude</th>
        <th>Mélange</th>
        <th>Profondeur</th>
        <th>Durée</th>
        <th>DTR</th>
        <th>Pression sortie</th>
      </tr>
    </thead>
    <tbody>
<?php foreach ($palanquees as $pi => $p):
  $sorted   = PdfRender::sortMembresForFiche($p['membres'] ?? []);
  $debut    = $heuresDebut[$p['id']] ?? null;
  $fin      = $heuresFin[$p['id']]   ?? null;
  $real     = $realises[$p['id']]    ?? null;
  $gpCount  = count(array_filter($sorted, fn($m) => ($m['aptitude'] ?? '') === 'GP'));
  $isSFPal  = $gpCount >= 2;
  $palType  = Rules::getPalType($p['membres'] ?? []);
  $rowCls   = "row-{$palType}";
  $palLabel = 'Mx';
  $dtrPrevu = $p['dtr'] ?? (int)ceil(($p['profMax'] ?? 0) / 10);
  foreach ($sorted as $mi => $m):
    $isBapt  = !empty($m['_bapteme']);
    $d       = $isBapt ? $m : ($diversById[$m['diverId'] ?? ''] ?? []);
    $fullName = $isBapt
        ? $h(($m['prenom'] ?? '') . ' ' . mb_strtoupper($m['nom'] ?? ''))
        : PdfRender::diverFullName($d);
    $isLast  = $mi === count($sorted) - 1;
    $isSF    = $isSFPal && $isLast && ($m['aptitude'] ?? '') === 'GP';
    $presKey = ($p['id'] ?? '') . '-' . ($m['diverId'] ?? $m['id'] ?? '');
    $presRaw = $pressions[$presKey] ?? null;
    $pres    = $presRaw !== null ? $presRaw : ($fin ? '50' : null);
    $presLabel = $pres
        ? ($pres === "panne d'air" ? "panne d'air" : $h($pres) . ' bar')
        : '—';
?>
      <tr class="<?= $rowCls ?>">
<?php if ($mi === 0): ?>
        <td rowspan="<?= count($sorted) ?>" style="vertical-align:top;font-weight:700;font-family:'Courier New',monospace;">P<?= $pi + 1 ?></td>
<?php endif; ?>
        <td>
          <b><?= $fullName ?></b><br>
          <span class="muted mono" style="font-size:10px;"><?= $isBapt ? 'Baptême' : $h($d['licence'] ?? '—') ?></span>
        </td>
        <td class="mono" style="font-size:11px;white-space:nowrap;">
          <?= $h($m['aptitude'] ?? '—') ?><?= $isSF ? ' <span class="muted">· SF</span>' : '' ?>
        </td>
<?php if ($mi === 0): ?>
        <td rowspan="<?= count($sorted) ?>" style="vertical-align:top;">
          <?= $palMelange($p) ?>
          <?php if (!empty($p['shot_line'])): ?><br><small class="muted">+ shot-line</small><?php endif; ?>
          <?php if (!empty($p['no_deco'])):   ?><br><small class="muted">no déco</small><?php endif; ?>
        </td>
        <td rowspan="<?= count($sorted) ?>" style="vertical-align:top;">
          <div class="label">Prévu</div><b><?= $h((string)($p['profMax'] ?? '—')) ?> m</b>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid #e2e8f0;">
            <div class="label">Réalisé</div>
            <b<?= $real ? '' : ' style="color:#94a3b8;"' ?>><?= $real ? $h((string)$real['profMax']) . ' m' : '—' ?></b>
          </div>
        </td>
        <td rowspan="<?= count($sorted) ?>" style="vertical-align:top;">
          <div class="label">Prévu</div><b><?= $h((string)($p['duree'] ?? '—')) ?> min</b>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid #e2e8f0;">
            <div class="label">Réalisé</div>
            <b<?= $real ? '' : ' style="color:#94a3b8;"' ?>><?= $real ? $h((string)$real['duree']) . ' min' : '—' ?></b>
            <?php if ($debut): ?><div style="font-size:10px;color:#94a3b8;margin-top:2px;font-family:monospace;"><?= $h($debut) ?><?= $fin ? ' → ' . $h($fin) : ' →…' ?></div><?php endif; ?>
          </div>
        </td>
        <td rowspan="<?= count($sorted) ?>" style="vertical-align:top;">
          <div class="label">Prévu</div><b><?= $dtrPrevu ?> min</b>
          <?php if (!empty($p['no_deco'])): ?><div style="font-size:9px;color:#2d8653;font-weight:600;margin-top:2px;">▲ no déco</div><?php endif; ?>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid #e2e8f0;">
            <div class="label">Réalisé</div>
            <b<?= $real ? '' : ' style="color:#94a3b8;"' ?>><?= $real ? $h((string)$real['dtr']) . ' min' : '—' ?></b>
          </div>
        </td>
<?php endif; ?>
        <td class="mono" style="font-size:11px;"><?= $presLabel ?></td>
      </tr>
<?php if ($isLast && !empty($real['commentaire'])): ?>
      <tr class="<?= $rowCls ?>">
        <td colspan="99" style="padding:6px 10px;font-size:11px;border-top:1px dashed #e2e8f0;white-space:pre-wrap;">
          <span class="label" style="margin-right:8px;">Commentaire</span><?= $h($real['commentaire']) ?>
        </td>
      </tr>
<?php endif; ?>
<?php endforeach; endforeach; ?>
    </tbody>
  </table>

  <!-- Sécurité surface -->
  <h2>Sécurité surface</h2>
  <table style="font-size:12px;">
    <tbody>
      <tr>
        <td style="width:50%;vertical-align:top;padding:0 12px 0 0;border:0;">
          <?php foreach ($secLeft as $item): ?><div style="padding:1px 0;"><?= $item ?></div><?php endforeach; ?>
        </td>
        <td style="width:50%;vertical-align:top;padding:0 0 0 12px;border:0;">
          <?php foreach ($secRight as $item): ?><div style="padding:1px 0;"><?= $item ?></div><?php endforeach; ?>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Conduite à tenir -->
  <h2>Conduite à tenir — déclenchement des secours</h2>
  <div style="font-size:12px;border:1px solid #1e293b;padding:8px 10px;border-radius:4px;">
    <div style="font-weight:700;font-size:13px;">
      ☎ URGENCE : <?= $urgenceNum ?> <span class="muted" style="font-weight:400;">· 112 (Europe) · 196 (secours en mer · CROSS)</span>
    </div>
    <div style="margin-top:4px;">1. Sortir la victime de l'eau · 2. O₂ normobare 15 L/min · 3. Alerter les secours · 4. Surveiller / réanimer si besoin.</div>
    <div>• Lieu / RDV secours : <b><?= $h($answers['site_acces_secours'] ?? $answers['site_nom'] ?? '—') ?></b></div>
    <div>• Coordonnées GPS : <b><?= $h($gpsLabel) ?></b></div>
    <div>• Caisson / hôpital de référence : <b><?= $h($answers['site_caisson'] ?? '—') ?></b></div>
  </div>

  <!-- Aptitudes mises en œuvre -->
  <h2>Aptitudes mises en œuvre</h2>
  <div style="font-size:12px;">
    <?php if ($aptUsage): foreach ($aptUsage as $apt => $n): ?>
      <span class="pill"><?= $h($apt) ?> × <?= $n ?></span>
    <?php endforeach; else: ?><span class="muted">—</span><?php endif; ?>
  </div>

  <!-- Paramètres complémentaires -->
  <h2>Paramètres complémentaires</h2>
  <div style="font-size:12px;">
    <?php if (!empty($answers['prof_max'])): ?><div>• Profondeur max autorisée : <b><?= $h($answers['prof_max']) ?></b></div><?php endif; ?>
    <div>• Paliers décompression : <b><?= !empty($answers['paliers']) ? 'Autorisés' : 'Non autorisés' ?></b></div>
    <?php if (!empty($answers['successive'])): ?><div>• Plongée successive dans la journée : <b>Prévue</b></div><?php endif; ?>
    <?php if (!empty($answers['maree_relevant']) && !empty($answers['maree_horaire'])): ?><div>• Marées : <b><?= $h($answers['maree_horaire']) ?></b></div><?php endif; ?>
    <?php if (!empty($answers['depart_bateau'])): ?><div>• Chef de bord : <b><?= !empty($answers['chef_bord']) ? 'Désigné' : 'Non désigné' ?></b></div><?php endif; ?>
    <?php if (!empty($answers['depart_bateau']) && !empty($answers['distance_cote'])): ?><div>• Distance côte : <b><?= $h($answers['distance_cote']) ?> M nautiques</b></div><?php endif; ?>
    <?php if (!empty($answers['recycleur'])): ?>
      <div>• Recycleurs : <b>Oui<?= !empty($answers['recycleur_modeles']) ? ' — ' . $h(str_replace("\n", ' / ', $answers['recycleur_modeles'])) : '' ?></b>
        <?= !empty($answers['mixage_co_rec']) ? '<span class="muted"> · CO+OC mixés</span>' : '' ?></div>
    <?php endif; ?>
    <?php if (!empty($answers['bloc_relais'])): ?>
      <div>• Bloc relais / déco : <b><?= !empty($answers['bloc_relais_gaz']) && is_array($answers['bloc_relais_gaz']) ? $h(implode(' · ', $answers['bloc_relais_gaz'])) : 'Oui' ?></b></div>
    <?php endif; ?>
    <?php if (!empty($answers['parachute_obligatoire'])): ?><div>• Parachute de palier : <b>Obligatoire par palanquée</b></div><?php endif; ?>
    <?php if (!empty($answers['parachute_par_plongeur'])): ?><div>• Parachute individuel : <b>Requis — chaque plongeur</b></div><?php endif; ?>
    <?php if (!empty($answers['mineurs'])): ?><div>• Mineurs : <b>Présents</b></div><?php endif; ?>
    <?php if (!empty($answers['etrangers'])): ?><div>• Brevets étrangers : <b>Présents — évaluation E3</b></div><?php endif; ?>
    <?php if (!empty($answers['handisub'])): ?><div>• Handisub : <b>Présent(s)</b></div><?php endif; ?>
  </div>

  <?php if (!empty($answers['fiche_observations'])): ?>
  <h2>Observations générales</h2>
  <div style="font-size:12px;white-space:pre-wrap;padding:8px 10px;border:1px solid #e2e8f0;border-radius:4px;background:#fafafa;">
    <?= $h($answers['fiche_observations']) ?>
  </div>
  <?php endif; ?>

  <!-- Signatures -->
  <table style="margin-top:28px;table-layout:fixed;">
    <tbody>
      <tr>
        <?php $sigs = ['Signature DP — ' . ($answers['dp_nom'] ?? '—'), 'Signature Encadrant(s)', 'Signature Exploitant']; ?>
        <?php foreach ($sigs as $sig): ?>
        <td style="width:33%;padding-right:16px;border:0;vertical-align:top;">
          <div style="height:60px;border-top:1px solid #1e293b;padding-top:6px;">
            <span class="label"><?= $h($sig) ?></span>
          </div>
        </td>
        <?php endforeach; ?>
      </tr>
    </tbody>
  </table>

  <div class="muted" style="margin-top:20px;font-size:10.5px;font-style:italic;padding-top:10px;border-top:1px solid #e2e8f0;">
    Document à conserver 1 an minimum par l'établissement (Art. A322-72 du Code du Sport).
    Outil d'aide à la décision — la responsabilité personnelle du Directeur de Plongée demeure pleine et entière.
  </div>

</div>
