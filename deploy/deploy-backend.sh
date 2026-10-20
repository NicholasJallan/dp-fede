#!/usr/bin/env bash
# Déploiement du backend PHP de DP Assistant sur le Pi.
#
# Usage : deploy/deploy-backend.sh [--dry-run] [--skip-tests] [--skip-backup]
#
#   --dry-run      n'écrit rien sur le serveur : affiche ce que rsync changerait
#                  dans le répertoire de prod (vendor/ et config.php exclus) et
#                  les commandes distantes qui seraient lancées.
#   --skip-tests   ne lance pas PHPUnit en local avant de déployer.
#   --skip-backup  ne lance pas la sauvegarde MariaDB avant les migrations.
#
# Déroulé (sans --dry-run) :
#   1. local  : php -l sur tout le backend + PHPUnit (si vendor/ local présent) ;
#   2. rsync  : backend/ → répertoire de STAGING sur le Pi (hors prod) ;
#   3. distant: composer install --no-dev --optimize-autoloader (en www-data) ;
#   4. distant: sauvegarde MariaDB (si dp-fede-backup est installé) ;
#   5. distant: php bin/migrate.php depuis le staging, encadré par
#               bin/workspaces-plan.php (plan de reprise des structures en
#               clubs enregistré avant, vérifié après : tout écart bloque la
#               bascule). La plupart des migrations sont additives et l'ANCIEN
#               code continue de tourner pendant ce temps ; la reprise des
#               structures (007) ne l'est pas : API en maintenance pour ce
#               déploiement-là (docs/deploy/php85.md) ;
#   6. distant: bascule staging → prod (rsync local au Pi), chown www-data,
#               reload PHP-FPM (vide l'opcache) ;
#   7. local  : test de fumée HTTPS sur /api/auth/me.
#
# Pourquoi un staging : le nouveau code peut dépendre des nouvelles migrations
# (ex. users.last_seen_at). Migrer AVANT de remplacer le code évite la fenêtre
# où le nouveau code tournerait sur l'ancien schéma.
#
# Aucun secret ici : la config vit dans /etc/dp-fede/config.php sur le Pi.
# Surcharges possibles par variables d'environnement (valeurs par défaut) :
#   DP_FEDE_REMOTE=pi@bullesenvalais.ch
#   DP_FEDE_DOMAIN=dp-fede.bullesenvalais.ch
#   DP_FEDE_APP_DIR=/var/www/dp-fede-api
#   DP_FEDE_STAGE_DIR=/var/www/dp-fede-api-release
#   DP_FEDE_PHP=php8.5
#   DP_FEDE_FPM_SERVICE=php8.5-fpm
#   DP_FEDE_BACKUP_CMD=/usr/local/sbin/dp-fede-backup

set -euo pipefail

REMOTE="${DP_FEDE_REMOTE:-pi@bullesenvalais.ch}"
DOMAIN="${DP_FEDE_DOMAIN:-dp-fede.bullesenvalais.ch}"
APP_DIR="${DP_FEDE_APP_DIR:-/var/www/dp-fede-api}"
STAGE_DIR="${DP_FEDE_STAGE_DIR:-/var/www/dp-fede-api-release}"
PHP_BIN="${DP_FEDE_PHP:-php8.5}"
FPM_SERVICE="${DP_FEDE_FPM_SERVICE:-php8.5-fpm}"
BACKUP_CMD="${DP_FEDE_BACKUP_CMD:-/usr/local/sbin/dp-fede-backup}"

DRY_RUN=0
SKIP_TESTS=0
SKIP_BACKUP=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --skip-tests)  SKIP_TESTS=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    -h|--help)     sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[DP backend] %s\n' "$*"; }
die() { printf '[DP backend] ERREUR : %s\n' "$*" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${REPO_ROOT}/backend"
[[ -f "${SRC}/index.php" && -f "${SRC}/composer.lock" ]] || die "backend/ introuvable ou composer.lock absent (${SRC})"

# Fichiers jamais envoyés (et jamais supprimés côté Pi : rsync protège les
# chemins exclus de --delete). config.php : la vraie config vit dans /etc/dp-fede/.
RSYNC_EXCLUDES=(
  '--exclude=/vendor/'
  '--exclude=/tests-php/'
  '--exclude=/config.php'
  '--exclude=/.phpunit*'
  '--exclude=/phpunit.xml'
  '--exclude=/composer.phar'
  '--exclude=.DS_Store'
  '--exclude=*.log'
)

# ── 1. Vérifications locales ────────────────────────────────────────────────
log "Lint PHP local…"
lint_failed=0
while IFS= read -r -d '' f; do
  if ! out="$(php -l "$f" 2>&1)"; then
    printf '%s\n' "$out" >&2
    lint_failed=1
  fi
done < <(find "$SRC" -name '*.php' -not -path "${SRC}/vendor/*" -print0)
(( lint_failed == 0 )) || die "erreurs de syntaxe PHP"

if (( SKIP_TESTS == 0 )); then
  if [[ -x "${SRC}/vendor/bin/phpunit" ]]; then
    log "PHPUnit local…"
    (cd "$SRC" && vendor/bin/phpunit --colors=never) || die "tests PHPUnit en échec"
  else
    log "vendor/ local absent : tests PHPUnit sautés (composer install dans backend/ pour les activer)"
  fi
fi

# ── Dry-run : diff vs prod, aucune écriture ─────────────────────────────────
if (( DRY_RUN == 1 )); then
  log "[dry-run] Changements que la bascule appliquerait dans ${REMOTE}:${APP_DIR} :"
  rsync -azn --delete --itemize-changes --rsync-path="sudo rsync" \
    "${RSYNC_EXCLUDES[@]}" --filter='P /lib/Smtp.php' \
    "${SRC}/" "${REMOTE}:${APP_DIR}/"
  cat <<EOF
[dry-run] Commandes distantes qui seraient exécutées :
  rsync backend/ → ${STAGE_DIR}/ (staging)
  sudo -u www-data ${PHP_BIN} composer install --no-dev --optimize-autoloader (dans ${STAGE_DIR})
  sudo ${BACKUP_CMD}   (si installé, sauf --skip-backup)
  sudo -u www-data ${PHP_BIN} ${STAGE_DIR}/bin/workspaces-plan.php --save /var/lib/dp-fede/workspaces-plan.json
  sudo -u www-data ${PHP_BIN} ${STAGE_DIR}/bin/migrate.php
  sudo -u www-data ${PHP_BIN} ${STAGE_DIR}/bin/workspaces-plan.php --verify …   (si un plan a été enregistré)
  sudo rsync -a --delete ${STAGE_DIR}/ ${APP_DIR}/   (config.php et lib/Smtp.php protégés)
  sudo chown -R www-data:www-data ${APP_DIR} && sudo systemctl reload ${FPM_SERVICE}
EOF
  exit 0
fi

# ── 2. Envoi vers le staging ────────────────────────────────────────────────
log "rsync backend/ → ${REMOTE}:${STAGE_DIR}/"
rsync -az --delete --rsync-path="sudo rsync" \
  "${RSYNC_EXCLUDES[@]}" \
  "${SRC}/" "${REMOTE}:${STAGE_DIR}/"

# ── 3 à 6. Étapes distantes ────────────────────────────────────────────────
log "Étapes distantes (composer, sauvegarde, migrations, bascule)…"
# Heredoc entre quotes : aucune expansion locale, les valeurs passent en arguments.
ssh "$REMOTE" bash -s -- "$STAGE_DIR" "$APP_DIR" "$PHP_BIN" "$FPM_SERVICE" "$BACKUP_CMD" "$SKIP_BACKUP" <<'REMOTE_SCRIPT'
set -euo pipefail
STAGE_DIR="$1"; APP_DIR="$2"; PHP_BIN="$3"; FPM_SERVICE="$4"; BACKUP_CMD="$5"; SKIP_BACKUP="$6"
say() { printf '[Pi] %s\n' "$*"; }

command -v "$PHP_BIN" >/dev/null || { say "ERREUR : $PHP_BIN absent (voir docs/deploy/php85.md)"; exit 1; }
COMPOSER="$(command -v composer || true)"
[[ -n "$COMPOSER" ]] || { say "ERREUR : composer absent sur le Pi (voir docs/deploy/README.md)"; exit 1; }
[[ -f /etc/dp-fede/config.php ]] || { say "ERREUR : /etc/dp-fede/config.php absent"; exit 1; }

sudo chown -R www-data:www-data "$STAGE_DIR"

say "composer install --no-dev --optimize-autoloader"
sudo -u www-data env COMPOSER_HOME=/tmp/dp-fede-composer \
  "$PHP_BIN" "$COMPOSER" install --working-dir="$STAGE_DIR" \
  --no-dev --optimize-autoloader --no-interaction --no-progress

if [[ "$SKIP_BACKUP" == "1" ]]; then
  say "Sauvegarde sautée (--skip-backup)"
elif [[ -x "$BACKUP_CMD" ]]; then
  say "Sauvegarde MariaDB avant migration"
  sudo "$BACKUP_CMD"
else
  say "ATTENTION : $BACKUP_CMD absent — pas de sauvegarde avant migration (voir deploy/backup.sh)"
fi

# Reprise des structures (002_workspaces) en clubs : plan calculé AVANT la
# migration 007, comparé APRÈS. Sans effet si la base est déjà migrée.
PLAN_FILE=/var/lib/dp-fede/workspaces-plan.json
sudo install -d -o www-data -g www-data -m 750 /var/lib/dp-fede
say "Plan de reprise des structures"
sudo -u www-data "$PHP_BIN" "$STAGE_DIR/bin/workspaces-plan.php" --save "$PLAN_FILE"

say "Migrations"
sudo -u www-data "$PHP_BIN" "$STAGE_DIR/bin/migrate.php"

if sudo test -f "$PLAN_FILE"; then
  say "Vérification de la reprise des structures"
  if ! sudo -u www-data "$PHP_BIN" "$STAGE_DIR/bin/workspaces-plan.php" --verify "$PLAN_FILE"; then
    say "ERREUR : reprise non conforme au plan — code NON basculé. Restaurer la sauvegarde (deploy/restore.md) avant toute nouvelle tentative."
    exit 1
  fi
  sudo mv "$PLAN_FILE" "${PLAN_FILE%.json}-$(date +%Y%m%d%H%M%S).ok.json"
fi

say "Bascule staging → prod"
# P = protect : lib/Smtp.php n'existe plus dans le dépôt mais l'ancien
# pi-scripts/backup_report.php l'inclut encore. À retirer quand ce script
# sera remplacé par deploy/backup.sh + deploy/backup-notify-mail.sh.
sudo rsync -a --delete --exclude=/config.php --filter='P /lib/Smtp.php' "$STAGE_DIR/" "$APP_DIR/"
sudo chown -R www-data:www-data "$APP_DIR"
sudo systemctl reload "$FPM_SERVICE"
say "OK"
REMOTE_SCRIPT

# ── 7. Test de fumée ────────────────────────────────────────────────────────
log "Test de fumée https://${DOMAIN}/api/auth/me"
body="$(curl -fsS --max-time 15 "https://${DOMAIN}/api/auth/me")" || die "l'API ne répond pas — consulter /var/log/dp-fede-php.log sur le Pi"
[[ "$body" == *'"ok":true'* ]] || die "réponse inattendue : ${body}"
log "Backend déployé."
