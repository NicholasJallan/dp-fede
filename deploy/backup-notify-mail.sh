#!/usr/bin/env bash
# Hook de notification pour deploy/backup.sh : envoie un e-mail de statut.
#
# Remplace pi-scripts/backup_report.php, qui dépend de lib/Smtp.php (supprimé
# du backend). Aucune dépendance PHP : utilise l'interface sendmail standard,
# fournie par exemple par msmtp-mta :
#   sudo apt install msmtp-mta
#   sudo $EDITOR /etc/msmtprc     # compte SMTP (mot de passe ICI, pas dans le dépôt)
#   sudo chmod 600 /etc/msmtprc
#
# Variables : BACKUP_MAIL_TO (exportée par backup.sh depuis backup.env)
# Usage     : backup-notify-mail.sh <OK|ERREUR> <message> [fichier]

set -euo pipefail

status="${1:?statut attendu}"
message="${2:-}"
file="${3:-}"
: "${BACKUP_MAIL_TO:?BACKUP_MAIL_TO non défini dans backup.env}"

SENDMAIL="$(command -v sendmail || echo /usr/sbin/sendmail)"
[[ -x "$SENDMAIL" ]] || { echo "sendmail absent (installer msmtp-mta)" >&2; exit 1; }

host="$(hostname)"
tag="OK"
[[ "$status" == "OK" ]] || tag="ERREUR"

{
  printf 'To: %s\n' "$BACKUP_MAIL_TO"
  printf 'Subject: [Sauvegarde %s] %s - dp-fede - %s\n' "$host" "$tag" "$(date '+%d/%m/%Y %H:%M')"
  printf 'Content-Type: text/plain; charset=UTF-8\n\n'
  printf 'Statut  : %s\n' "$status"
  printf 'Date    : %s\n' "$(date '+%F %T')"
  printf 'Message : %s\n' "$message"
  if [[ -n "$file" && -f "$file" ]]; then
    printf 'Fichier : %s (%s octets)\n' "$file" "$(stat -c '%s' "$file")"
  fi
  printf '\nSauvegardes locales :\n'
  ls -lh "$(dirname "${file:-/var/backups/dp-fede/x}")" 2>/dev/null | tail -n 5 || true
} | "$SENDMAIL" -t
