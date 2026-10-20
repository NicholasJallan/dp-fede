#!/usr/bin/env bash
# Hook d'upload pour deploy/backup.sh : copie le dump et son .sha256 via rclone.
#
# rclone gère pCloud, S3, Backblaze, SFTP… avec des jetons OAuth renouvelés
# automatiquement : il remplace l'ancien pi-scripts/save.sh qui extrayait un
# jeton pCloud depuis des cookies de navigateur copiés dans le script.
#
# Pré-requis (une fois, en root) :
#   sudo apt install rclone
#   sudo rclone config            # crée le remote, ex. « pcloud » (OAuth)
#   → la config (jetons) est dans /root/.config/rclone/rclone.conf (mode 600)
#
# Variables : RCLONE_REMOTE (exportée par backup.sh depuis backup.env),
#             ex. RCLONE_REMOTE=pcloud:Sauvegardes/dp-fede
# Usage     : backup-upload-rclone.sh /var/backups/dp-fede/dp_fede-YYYYmmdd-HHMMSS.sql.gz

set -euo pipefail

file="${1:?chemin du dump attendu}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE non défini dans backup.env}"

command -v rclone >/dev/null || { echo "rclone absent" >&2; exit 1; }
[[ -f "$file" ]] || { echo "fichier introuvable : $file" >&2; exit 1; }

rclone copy --checksum "$file" "$RCLONE_REMOTE"
if [[ -f "${file}.sha256" ]]; then
  rclone copy --checksum "${file}.sha256" "$RCLONE_REMOTE"
fi
# Vérifie que le fichier est bien présent côté distant avec la même taille.
rclone check --size-only --one-way "$(dirname "$file")" "$RCLONE_REMOTE" --include "$(basename "$file")"
