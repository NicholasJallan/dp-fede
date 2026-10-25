<?php
declare(strict_types=1);
/**
 * Template PHP — Feuille de palanquée de la Polynésie française, modèle de
 * l'annexe XX de l'arrêté n° 199 CM (art. 2 : noms, prénoms, aptitudes des
 * plongeurs, fonction dans la palanquée, paramètres prévus et réalisés).
 * Variables attendues (cf. DivePdf::html) :
 *   $answers, $palanquees, $renderState, $diversById, $user, $dp (ligne DP ou null)
 */

$h   = fn($v): string => PdfRender::h($v);
$fmt = fn($v): string => PdfRender::formatDateTime($v);
$yes = fn($v): string => !empty($v) ? 'Oui' : 'Non';

$realises    = $renderState['realises']    ?? [];
$heuresDebut = $renderState['heuresDebut'] ?? [];
$heuresFin   = $renderState['heuresFin']   ?? [];
$checked     = $renderState['checked']     ?? [];

// DP : fonction DP la plus élevée et aptitudes aux mélanges (profil PF).
$dpProfile  = is_array($dp ?? null) ? PfProfile::effective($dp) : null;
$dpFonction = '—';
$dpNitrox   = '—';
$dpTrimix   = '—';
if ($dpProfile !== null) {
    $dps = array_values(array_filter($dpProfile['fonctions'], static fn(string $f): bool => str_starts_with($f, 'DP-')));
    if ($dps) $dpFonction = end($dps);
    $nx = array_values(array_intersect(['PN-C', 'PN'], $dpProfile['gaz']));
    if ($nx) $dpNitrox = $nx[0];
    $tx = array_values(array_filter($dpProfile['gaz'], static fn(string $g): bool => str_starts_with($g, 'PTH-')));
    if ($tx) $dpTrimix = end($tx);
}
// DP hors annuaire : niveau saisi dans la plongée.
$dpBrevet = $dpProfile !== null && $dpProfile['brevets'] !== ''
    ? $dpProfile['brevets']
    : ($dpFonction !== '—' ? $dpFonction : (string)($answers['dp_qual'] ?? '—'));

// Personnes à bord : plongeurs des palanquées et DP.
$nbPlongeurs = 0;
foreach ($palanquees as $p) $nbPlongeurs += count($p['membres'] ?? []);
// Personnel de surface non plongeur : saisi en texte libre, affiché tel quel
// plutôt que compté (un total faux serait pire qu'un total incomplet).
$aBord = '—';
if (!empty($answers['depart_bateau'])) {
    $aBord = ($nbPlongeurs + 1) . ' (plongeurs et DP)';
    if (!empty($answers['sec_surface_externes'])) $aBord .= ' + ' . PdfRender::toText($answers['sec_surface_externes']);
}

$secSurface = [];
if (!empty($answers['sec_surface_membres']) && is_array($answers['sec_surface_membres'])) {
    foreach ($answers['sec_surface_membres'] as $id) {
        if (isset($diversById[$id])) $secSurface[] = PdfRender::diverFullName($diversById[$id]);
    }
}
if (!empty($answers['sec_surface_externes'])) $secSurface[] = $h($answers['sec_surface_externes']);

$sitePays   = isset($answers['site_pays_code']) ? (string)$answers['site_pays_code'] : null;
$urgenceNum = $h(trim((string)($answers['urgence_num'] ?? ''))
    ?: Emergency::defaultNumber($sitePays, isset($user['urgence_defaut']) ? (string)$user['urgence_defaut'] : null));
$emergency  = Emergency::info($sitePays, isset($answers['milieu']) ? (string)$answers['milieu'] : null);

/** Brevets ou aptitudes d'un plongeur (profil PF saisi, sinon niveau FFESSM). */
$brevetOf = static function (array $m, array $d) use ($h): string {
    if (!empty($m['_bapteme'])) return 'Baptême';
    $pf = is_array($d['pf'] ?? null) ? $d['pf'] : [];
    if (!empty($pf['brevets']) && is_string($pf['brevets'])) return $h($pf['brevets']);
    $niveau = $d['niveau_encadrant'] ?? null ?: ($d['niveau_plongeur'] ?? null);
    return $niveau ? $h($niveau) : '—';
};
$palier = static function (?array $real, string $prof) use ($h): string {
    $v = $real['paliers'][$prof] ?? null;
    return is_numeric($v) && (float)$v > 0 ? $h((string)$v) . ' min' : '—';
};
?>
<div class="fiche" style="background:white;padding:24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1e293b;">

  <table style="table-layout:fixed;border-bottom:2px solid #1e293b;margin-bottom:12px;">
    <tbody>
      <tr>
        <td style="width:36%;border:0;vertical-align:top;">
          <div class="label">Nom de l'établissement</div>
          <b style="font-size:14px;"><?= $h($user['club_nom'] ?? '—') ?></b>
          <div class="label" style="margin-top:6px;">Nom du navire</div>
          <b><?= $h($answers['navire_nom'] ?? '—') ?></b>
          <div class="label" style="margin-top:6px;">Immatriculation</div>
          <b class="mono"><?= $h($answers['navire_immat'] ?? '—') ?></b>
        </td>
        <td style="width:28%;border:0;text-align:center;vertical-align:middle;">
          <h1 style="font-size:20px;margin:0;">FEUILLE DE PALANQUÉE</h1>
          <div class="muted" style="font-size:10px;">Arrêté n° 199 CM du 15/02/2018 — annexe XX</div>
        </td>
        <td style="width:36%;border:0;vertical-align:top;text-align:right;">
          <div class="label">Date</div>
          <b><?= $fmt($answers['date'] ?? null) ?></b>
          <div class="label" style="margin-top:6px;">Nom du site</div>
          <b><?= $h($answers['site_nom'] ?? '—') ?></b>
          <div class="label" style="margin-top:6px;">Sécurité surface</div>
          <b><?= $secSurface ? implode(', ', $secSurface) : (!empty($answers['sec_surface']) ? 'Présente' : '—') ?></b>
        </td>
      </tr>
    </tbody>
  </table>

  <h2>Directeur de plongée</h2>
  <table style="font-size:12px;table-layout:fixed;">
    <tbody>
      <tr>
        <td><span class="label">Nom</span><br><b><?= $h($answers['dp_nom'] ?? '—') ?></b></td>
        <td><span class="label">Brevet</span><br><b><?= $h($dpBrevet) ?></b></td>
        <td><span class="label">Nitrox</span><br><b><?= $h($dpNitrox) ?></b></td>
        <td><span class="label">Trimix</span><br><b><?= $h($dpTrimix) ?></b></td>
      </tr>
      <tr>
        <td><span class="label">Oxygène vérifié</span><br><b><?= $yes($answers['o2'] ?? null) ?></b></td>
        <td><span class="label">Quantité oxygène</span><br><b><?= is_numeric($answers['o2_litres'] ?? null) ? $h((string)$answers['o2_litres']) . ' L' : '—' ?></b></td>
        <td><span class="label">Moyen d'appel vérifié</span><br><b><?= $yes(($answers['vhf'] ?? null) || ($answers['coords_secours'] ?? null)) ?></b></td>
        <td><span class="label">Matériel de secours vérifié</span><br><b><?= $yes(($answers['o2'] ?? null) && ($answers['trousse'] ?? null)) ?></b></td>
      </tr>
      <tr>
        <td><span class="label">Matériel d'assistance vérifié</span><br><b><?= $yes($checked['pf1_bloc_secours'] ?? null) ?></b></td>
        <td><span class="label">Plan de secours adapté à bord</span><br><b><?= $yes($answers['plan_secours'] ?? null) ?></b></td>
        <td colspan="2"><span class="label">Nombre total de personnes à bord</span><br><b><?= $h($aBord) ?></b></td>
      </tr>
    </tbody>
  </table>

<?php foreach ($palanquees as $pi => $p):
    $sorted  = PdfRender::sortMembresForFiche($p['membres'] ?? []);
    $real    = is_array($realises[$p['id'] ?? ''] ?? null) ? $realises[$p['id']] : null;
    $debut   = $heuresDebut[$p['id'] ?? ''] ?? null;
    $fin     = $heuresFin[$p['id'] ?? ''] ?? null;
    $encadrant = null;
    foreach ($sorted as $m) {
        if (PfRoles::isEncadrantRole((string)($m['aptitude'] ?? ''))) { $encadrant = $m; break; }
    }
    $encNom = $encadrant !== null
        ? PdfRender::diverFullName($diversById[$encadrant['diverId'] ?? ''] ?? $encadrant)
        : '—';
?>
  <h2>Palanquée n° <?= $pi + 1 ?> — <?= $h($p['nom'] ?? '') ?></h2>
  <div style="margin-bottom:4px;"><span class="label">Nom de l'encadrant</span> <b><?= $encNom ?></b></div>
  <table>
    <thead>
      <tr><th style="width:24px;">#</th><th>Nom, prénom</th><th>Brevet ou aptitudes</th><th>Fonction</th></tr>
    </thead>
    <tbody>
<?php foreach ($sorted as $mi => $m):
    $isBapt = !empty($m['_bapteme']);
    $d      = $isBapt ? $m : ($diversById[$m['diverId'] ?? ''] ?? []);
    $nom    = $isBapt ? $h(($m['prenom'] ?? '') . ' ' . mb_strtoupper(PdfRender::toText($m['nom'] ?? ''))) : PdfRender::diverFullName($d);
?>
      <tr>
        <td class="mono"><?= $mi + 1 ?></td>
        <td><b><?= $nom ?></b></td>
        <td><?= $brevetOf($m, $d) ?></td>
        <td class="mono"><?= $h($m['aptitude'] ?? '—') ?></td>
      </tr>
<?php endforeach; ?>
    </tbody>
  </table>
  <table style="font-size:12px;table-layout:fixed;margin-top:4px;">
    <tbody>
      <tr>
        <td>Profondeur prévue : <b><?= $h((string)($p['profMax'] ?? '—')) ?> m</b></td>
        <td>Durée prévue : <b><?= $h((string)($p['duree'] ?? '—')) ?> min</b></td>
        <td>Heure de départ : <b><?= $h($debut ?? '—') ?></b></td>
      </tr>
      <tr>
        <td>Profondeur réalisée : <b><?= $real ? $h((string)($real['profMax'] ?? '')) . ' m' : '—' ?></b></td>
        <td>Durée réalisée : <b><?= $real ? $h((string)($real['duree'] ?? '')) . ' min' : '—' ?></b></td>
        <td>Heure de sortie : <b><?= $h($fin ?? '—') ?></b></td>
      </tr>
      <tr>
        <td>Palier à 3 m : <b><?= $palier($real, '3') ?></b></td>
        <td>Palier à 6 m : <b><?= $palier($real, '6') ?></b></td>
        <td>Palier à 9 m ou au-delà : <b><?= $palier($real, '9') ?></b></td>
      </tr>
    </tbody>
  </table>
<?php endforeach; ?>

  <h2>Secours</h2>
  <div style="border:1px solid #1e293b;padding:8px 10px;border-radius:4px;">
    <b>☎ URGENCE : <?= $urgenceNum ?></b> <span class="muted">· <?= $h($emergency['secondaryNums']) ?></span>
    <?php if ($emergency['vhf'] !== null): ?><div>• VHF : <b><?= $h($emergency['vhf']) ?></b></div><?php endif; ?>
    <div>• Caisson / hôpital de référence : <b><?= $h($answers['site_caisson'] ?? '—') ?></b></div>
  </div>

  <table style="margin-top:24px;table-layout:fixed;">
    <tbody>
      <tr>
        <td style="border:0;"><div style="height:50px;border-top:1px solid #1e293b;padding-top:6px;"><span class="label">Signature du directeur de plongée</span></div></td>
        <td style="border:0;"><div style="height:50px;border-top:1px solid #1e293b;padding-top:6px;"><span class="label">Signature de l'exploitant</span></div></td>
      </tr>
    </tbody>
  </table>

  <div class="muted" style="margin-top:14px;font-size:10px;font-style:italic;">
    Feuille conservée un an par l'établissement (loi du pays n° 2017-44, art. LP 8).
    Outil d'aide à la décision — la responsabilité du directeur de plongée demeure pleine et entière.
  </div>
</div>
