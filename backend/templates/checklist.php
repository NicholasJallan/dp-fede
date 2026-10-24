<?php
declare(strict_types=1);
/**
 * Template PHP — Check-list opérationnelle (port de ChecklistStatique depuis screen-archive.jsx).
 * Variables attendues :
 *   $answers     array  Réponses session
 *   $renderState array  {checked, comments}
 *   $user        array  Utilisateur courant
 */

// Paramètres non typés : les réponses peuvent contenir des int/float
// (strict_types → un ?string lèverait une TypeError).
$h   = fn($v): string => PdfRender::h($v);
$fmt = fn($v): string => PdfRender::formatDateTime($v);

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

// Règles de check-list : portage de src/domain/checklist.js (lib/ChecklistRules.php).
$CHECKLIST_RULES = ChecklistRules::phases();

// Comptages globaux
$totalItems = 0;
$doneItems  = 0;
foreach ($CHECKLIST_RULES as $phase) {
    foreach ($phase['items'] as $it) {
        if (ChecklistRules::matches($it['when'] ?? null, $answers)) {
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
    $items = array_filter($phase['items'], fn($it) => ChecklistRules::matches($it['when'] ?? null, $answers));
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
