# psr-log-shim

Copie de `psr/log` v1.1.4 (MIT, https://github.com/php-fig/log), compatible
PHP 7.4 — pas de type `mixed` en retour (introduit en v2/v3, PHP 8+ only).

mPDF (`mpdf/mpdf`) déclare accepter `psr/log ^1.0 || ^2.0 || ^3.0`, mais le
`composer.lock` du projet a verrouillé la v3.0.2 (résolue sous PHP 8.2, le
PHP du CLI/PHPUnit — cf. CLAUDE.md), qui exige PHP 8+ et ne parse pas sous
PHP 7.4 (`php7.4 -l` échoue : type `mixed`). Comme `backend/vendor/` est
gitignored, un `composer install` sur le Pi resterait verrouillé sur cette
v3 incompatible avec le PHP 7.4-FPM qui sert l'API.

`lib/PdfAutoload.php` charge `Psr\Log\*` depuis ce dossier plutôt que
`vendor/psr/log/src/`, pour rester correct même après un `composer install`
qui réinstallerait la v3.

Ne pas mettre à jour `psr/log` dans `composer.json` sans supprimer ce shim
et vérifier `php7.4 -l` sur les fichiers installés.
