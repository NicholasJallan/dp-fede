#!/usr/bin/env bash
# Déploiement du frontend : build esbuild → rsync dist/ vers le Pi.
# (Reprise versionnée et sans secret de l'ancien pi-scripts/deploy-frontend.sh.)
#
# Usage : deploy/deploy-frontend.sh [--dry-run]
#
# La VERSION du Service Worker (dist/sw.js) est calculée par le build (hash du
# contenu) : ne jamais la modifier à la main.
# La clé Google Maps n'est JAMAIS dans dist/ : le HTML contient le placeholder
# __GOOGLE_MAPS_API_KEY__, remplacé au vol par nginx (sub_filter).
#
# Surcharges (valeurs par défaut) :
#   DP_FEDE_REMOTE=pi@bullesenvalais.ch
#   DP_FEDE_WEB_DIR=/var/www/html/dp-fede

set -euo pipefail

REMOTE="${DP_FEDE_REMOTE:-pi@bullesenvalais.ch}"
WEB_DIR="${DP_FEDE_WEB_DIR:-/var/www/html/dp-fede}"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[DP frontend] %s\n' "$*"; }
die() { printf '[DP frontend] ERREUR : %s\n' "$*" >&2; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."

log "Build…"
npm run build
[[ -d dist ]] || die "dist/ absent après le build"

# Garde-fou : aucune vraie clé Google Maps ne doit partir sur le serveur.
if grep -rIlE 'AIza[0-9A-Za-z_-]{35}' dist/ >/dev/null 2>&1; then
  die "clé Google Maps (AIza…) détectée dans dist/ — elle doit rester dans la config nginx"
fi

VERSION="$(sed -nE "s/^const VERSION = '([^']+)';/\1/p" dist/sw.js 2>/dev/null || true)"

if (( DRY_RUN == 1 )); then
  log "[dry-run] VERSION sw.js : ${VERSION:-inconnue}"
  rsync -avn --rsync-path="sudo rsync" dist/ "${REMOTE}:${WEB_DIR}/"
  exit 0
fi

rsync -av --rsync-path="sudo rsync" dist/ "${REMOTE}:${WEB_DIR}/"
ssh "$REMOTE" "sudo chown -R www-data:www-data '${WEB_DIR}'"

log "Frontend déployé — sw.js VERSION=${VERSION:-inconnue}"
