<?php
declare(strict_types=1);

// Bootstrap PHPUnit — charge tous les libs du backend dans l'ordre attendu
// par index.php. Config est le vrai lib/Config.php (autoload Composer) : un
// test qui en a besoin fixe sa configuration par réflexion
// (`(new \ReflectionProperty(\Config::class, 'cfg'))->setValue(null, [...])`,
// cf. DiveArchiveDbTest), sinon /etc/dp-fede/config.php est lu.

require_once __DIR__ . '/../lib/Json.php';
require_once __DIR__ . '/../lib/Config.php';

// Charge les autres libs.
require_once __DIR__ . '/../lib/Validate.php';
require_once __DIR__ . '/../lib/Csrf.php';
require_once __DIR__ . '/../lib/SyncHelpers.php';
require_once __DIR__ . '/../lib/Auth.php';
require_once __DIR__ . '/../lib/Rules.php';
require_once __DIR__ . '/../lib/Encadrement.php';
// Db dépend de PDO live → on ne charge pas Auth::current/Session ici (les
// tests qui en ont besoin doivent mocker explicitement).
require_once __DIR__ . '/../lib/Db.php';
require_once __DIR__ . '/../lib/Log.php';
require_once __DIR__ . '/../lib/RateLimit.php';
require_once __DIR__ . '/../lib/Account.php';
require_once __DIR__ . '/../lib/Migrator.php';
require_once __DIR__ . '/../lib/Retention.php';
require_once __DIR__ . '/../lib/PdfRender.php';
require_once __DIR__ . '/../lib/ChecklistRules.php';
require_once __DIR__ . '/../lib/Club.php';
require_once __DIR__ . '/../lib/ClubInvitation.php';
require_once __DIR__ . '/../lib/ClubAlerts.php';
require_once __DIR__ . '/../lib/DiverValidation.php';
require_once __DIR__ . '/../lib/ClubStats.php';
require_once __DIR__ . '/../lib/LevelMapper.php';
require_once __DIR__ . '/../lib/DiverImport.php';
require_once __DIR__ . '/../lib/DiverImportPlan.php';
require_once __DIR__ . '/../lib/DivePdf.php';
require_once __DIR__ . '/../lib/DivePolicy.php';
require_once __DIR__ . '/../lib/DiveStore.php';
require_once __DIR__ . '/../lib/DiveDates.php';
require_once __DIR__ . '/../lib/DiveRefusal.php';
require_once __DIR__ . '/../lib/DiveStatus.php';
require_once __DIR__ . '/../lib/DiveService.php';
require_once __DIR__ . '/../lib/DiveArchive.php';
require_once __DIR__ . '/../lib/ClubRetention.php';
require_once __DIR__ . '/../lib/LegacyWorkspaces.php';

// Charge les helpers de routes utilisés (parseDiveDateToMySql, normalizeDiveDate).
// Sans définir $method/$path → les blocs if du fichier ne se déclenchent pas,
// seules les fonctions globales sont visibles.
$method = 'GET';
$path   = '/__bootstrap__';
require_once __DIR__ . '/../routes/dives.php';

