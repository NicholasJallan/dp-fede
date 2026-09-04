<?php
declare(strict_types=1);
/**
 * Template PHP — Check-list opérationnelle (port de ChecklistStatique depuis screen-archive.jsx).
 * Variables attendues :
 *   $answers     array  Réponses session
 *   $renderState array  {checked, comments}
 *   $user        array  Utilisateur courant
 */

$h   = fn(?string $v): string => PdfRender::h($v);
$fmt = fn(?string $v): string => PdfRender::formatDateTime($v);

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
$structure = $structParts ? implode(' — ', $structParts) : 'Structure non renseignée';

$checked  = $renderState['checked']  ?? [];
$comments = $renderState['comments'] ?? [];

// Règles de check-list (portées depuis data.js CHECKLIST_RULES)
$milieu  = $answers['milieu'] ?? null;
$isMilieuNaturel = !in_array(PdfRender::h($milieu ?? ''), [], true)
    && !in_array(strtolower($milieu ?? ''), ['piscine', 'fosse'], true);

function matchCond($when, array $a): bool {
    if (!$when) return true;
    if ($when === null) return true;
    // Pour les conditions tableau simples (équivalent des objets JS {key:true})
    if (is_array($when)) {
        foreach ($when as $k => $v) {
            if ($v === true  && empty($a[$k]))     return false;
            if ($v === false && !empty($a[$k]))    return false;
            if (is_string($v) && ($a[$k] ?? null) !== $v) return false;
        }
        return true;
    }
    // Callable : fn(array $answers): bool
    if (is_callable($when)) return $when($a);
    return true;
}

$getMilieuType = function (?string $m): string {
    if (!$m) return 'mer';
    $ml = strtolower($m);
    if (strpos($ml, 'lac') !== false || strpos($ml, 'carrière') !== false || strpos($ml, 'carriere') !== false) return 'lac';
    if (strpos($ml, 'piscine') !== false) return 'piscine';
    if (strpos($ml, 'fosse')   !== false) return 'fosse';
    return 'mer';
};
$isMilieuNaturelFn = function (array $a) use ($getMilieuType): bool {
    $t = $getMilieuType($a['milieu'] ?? null);
    return !in_array($t, ['piscine', 'fosse'], true);
};

$CHECKLIST_RULES = [
    [
        'phase' => 1,
        'phaseTitle' => "Préparation — avant l'arrivée sur site",
        'items' => [
            ['id'=>'p1_meteo',         'text'=>'Bulletin météo consulté (vent, mer, courant, visibilité, alerte)',                      'when' => $isMilieuNaturelFn],
            ['id'=>'p1_maree',         'text'=>'Heure et coefficient de marée vérifiés',                                                'when' => ['maree_relevant'=>true]],
            ['id'=>'p1_blocs',         'text'=>'Dates de réépreuve TIV / requalif. blocs des plongeurs OK'],
            ['id'=>'p1_gonflage',      'text'=>'Gonflage des blocs effectué — pressions contrôlées'],
            ['id'=>'p1_analyse_nx',    'text'=>'Chaque bloc Nitrox analysé et étiqueté (% O₂, MOD, signature plongeur)',              'when' => ['nitrox'=>true]],
            ['id'=>'p1_analyse_nx_sup','text'=>'Plongeurs Nx>40 % : qualification PN-C contrôlée + analyse signée',                   'when' => fn($a) => !empty($a['nitrox_sup_40'])],
            ['id'=>'p1_analyse_tx',    'text'=>'Trimix/Héliox : analyse mélanges + planif décompression validée',                     'when' => ['trimix'=>true]],
            ['id'=>'p1_bloc_relais',   'text'=>'Bloc(s) relais / déco analysés et étiquetés',                                         'when' => ['bloc_relais'=>true]],
            ['id'=>'p1_rec_check',     'text'=>'Check-list constructeur de chaque recycleur — pré-breathing',                         'when' => ['recycleur'=>true]],
            ['id'=>'p1_o2_secours',    'text'=>"Oxygénothérapie : bouteille > 100 bar, BAVU, masques (adulte/enfant)"],
            ['id'=>'p1_trousse',       'text'=>'Trousse de secours + couverture isothermique vérifiées'],
            ['id'=>'p1_doc_plongeurs', 'text'=>'Brevets, licences, certificats médicaux à jour pour chaque plongeur'],
            ['id'=>'p1_etrangers',     'text'=>'Évaluation par un E3 des plongeurs aux brevets étrangers',                           'when' => ['etrangers'=>true]],
            ['id'=>'p1_mineurs',       'text'=>'Autorisations parentales signées récupérées',                                         'when' => ['mineurs'=>true]],
            ['id'=>'p1_vhf_test',      'text'=>'VHF testée + piles secondaires + Canal 16 (détresse) configuré',                     'when' => ['depart_bateau'=>true]],
            ['id'=>'p1_carburant',     'text'=>'Carburant + matériel de bord (gilets, signaux, mouillage) OK',                       'when' => ['depart_bateau'=>true]],
            ['id'=>'p1_shot_line',     'text'=>'Shot-line (ligne lestée de descente) préparée — lest, longueur, parachutes/bouée de signalisation', 'when' => fn($a) => !empty($a['shot_line']) || !empty($a['trimix'])],
            ['id'=>'p1_secours_coord', 'text'=>'Coordonnées des secours affichées (pays-appropriées)'],
        ],
    ],
    [
        'phase' => 2,
        'phaseTitle' => 'Sur site — avant la mise à l\'eau',
        'items' => [
            ['id'=>'p2_appel',           'text'=>'Appel nominatif des plongeurs présents — vérification aptitudes'],
            ['id'=>'p2_briefing',        'text'=>'Briefing général : site, profil, paramètres, signes, consignes'],
            ['id'=>'p2_rappels_secu',    'text'=>'Rappels de sécurité individuels communiqués : moyen de rappel, conduite à tenir en cas de perte de palanquée, procédure de remontée d\'urgence'],
            ['id'=>'p2_palanquees',      'text'=>'Composition annoncée — GP / serre-files / autonomes identifiés'],
            ['id'=>'p2_sec_surface',     'text'=>'Sécurité surface en poste — relais identifiés si rotation',                         'when' => ['sec_surface'=>true]],
            ['id'=>'p2_pavillon',        'text'=>"Pavillon Alpha hissé sur l'embarcation",                                           'when' => ['depart_bateau'=>true]],
            ['id'=>'p2_echelle',         'text'=>'Échelle de remontée déployée — ancrage adapté',                                    'when' => ['depart_bateau'=>true]],
            ['id'=>'p2_shot_line_pose',  'text'=>'Shot-line installée à l\'eau, lestée et amarrée correctement (obligatoire en Trimix)', 'when' => fn($a) => !empty($a['shot_line']) || !empty($a['trimix'])],
            ['id'=>'p2_parachute',       'text'=>'Chaque palanquée a son parachute de palier',                                       'when' => ['parachute_obligatoire'=>true]],
            ['id'=>'p2_parachute_indiv', 'text'=>'Chaque plongeur porte son parachute individuel',                                   'when' => ['parachute_par_plongeur'=>true]],
            ['id'=>'p2_nx_signature',    'text'=>'Plongeurs Nitrox : signature finale de l\'analyse de leur bloc',                   'when' => ['nitrox'=>true]],
            ['id'=>'p2_rec_aptitudes',   'text'=>'Aptitudes recycleur validées + circuit ouvert de secours pour > 6m',               'when' => ['recycleur'=>true]],
            ['id'=>'p2_planifs',         'text'=>'Copies des planifs déco remises à chaque palanquée Trimix',                        'when' => ['trimix'=>true]],
            ['id'=>'p2_bord_entree',     'text'=>"Points d'entrée/sortie de l'eau identifiés et sécurisés",                         'when' => ['depart_bord'=>true]],
            ['id'=>'p2_go_decision',     'text'=>'Décision finale du DP : conditions OK pour autoriser la mise à l\'eau'],
        ],
    ],
];

// Comptages globaux
$totalItems = 0;
$doneItems  = 0;
foreach ($CHECKLIST_RULES as $phase) {
    foreach ($phase['items'] as $it) {
        if (matchCond($it['when'] ?? null, $answers)) {
            $totalItems++;
            if (!empty($checked[$it['id']])) $doneItems++;
        }
    }
}
?>
<div style="background:white;padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;">

  <!-- En-tête -->
  <div style="border-bottom:3px solid #0a4a6e;padding-bottom:14px;margin-bottom:20px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:6px;">
      Check-list opérationnelle · DP Assistant
    </div>
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;"><?= $h($answers['site_nom'] ?? $answers['site'] ?? '—') ?></div>
    <div style="font-size:11px;color:#555;">
      <span><?= $structure ?></span>
      <span style="margin:0 8px;">·</span>
      <span><?= $fmt($answers['date'] ?? null) ?></span>
      <span style="margin:0 8px;">·</span>
      <span>DP : <?= $h($answers['dp_nom'] ?? '—') ?> (<?= $h($answers['dp_qual'] ?? '—') ?>)</span>
      <span style="float:right;font-weight:600;color:<?= $doneItems === $totalItems ? '#27ae60' : '#e67e22' ?>;">
        <?= $doneItems ?>/<?= $totalItems ?> items validés
      </span>
    </div>
  </div>

  <!-- Phases -->
  <?php foreach ($CHECKLIST_RULES as $phase):
    $items = array_filter($phase['items'], fn($it) => matchCond($it['when'] ?? null, $answers));
    if (empty($items)) continue;
    $phaseDone = count(array_filter($items, fn($it) => !empty($checked[$it['id']])));
  ?>
  <div style="margin-bottom:22px;">
    <div style="font-weight:700;font-size:13px;padding:5px 10px;margin-bottom:6px;background:#eef3f8;border-left:4px solid #0a4a6e;display:flex;justify-content:space-between;align-items:center;">
      <span><?= $h($phase['phaseTitle']) ?></span>
      <span style="font-weight:400;font-size:11px;color:#666;"><?= $phaseDone ?>/<?= count($items) ?></span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>
        <?php foreach ($items as $it):
          $isChecked = !empty($checked[$it['id']]);
          $comment   = $comments[$it['id']] ?? null;
        ?>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="width:26px;text-align:center;font-weight:700;padding:5px 4px;font-size:14px;color:<?= $isChecked ? '#27ae60' : '#c0392b' ?>;vertical-align:top;">
            <?= $isChecked ? '✓' : '✗' ?>
          </td>
          <td style="padding:5px 8px 5px 4px;vertical-align:top;color:<?= $isChecked ? '#333' : '#c0392b' ?>;">
            <div><?= $h($it['text']) ?></div>
            <?php if ($comment): ?>
            <div style="color:#888;font-size:10px;margin-top:3px;font-style:italic;padding-left:8px;">↳ <?= $h($comment) ?></div>
            <?php endif; ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endforeach; ?>

  <!-- Pied -->
  <div style="margin-top:20px;padding:8px 12px;background:#f8f8f8;border-radius:4px;font-size:10px;color:#aaa;border-top:1px solid #eee;">
    Document généré par DP Assistant — outil d'aide à la décision.
    Ne se substitue pas à la responsabilité personnelle du Directeur de Plongée.
  </div>

</div>
