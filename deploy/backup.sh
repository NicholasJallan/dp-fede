#!/usr/bin/env bash
# Sauvegarde MariaDB de DP Assistant (base dp_fede).
#
# Installation sur le Pi (cf. docs/deploy/README.md) :
#   sudo install -o root -g root -m 750 deploy/backup.sh /usr/local/sbin/dp-fede-backup
#   sudo install -o root -g root -m 600 deploy/backup.env.example /etc/dp-fede/backup.env
#   sudo $EDITOR /etc/dp-fede/backup.env
#
# Garanties :
#   - dump cohérent sans verrouiller les tables (--single-transaction, InnoDB) ;
#   - fichier vérifié AVANT d'être considéré valide : gzip -t, taille minimale,
#     marqueur de fin « -- Dump completed », présence de la table users ;
#   - écriture atomique (.partial puis mv) + empreinte .sha256 ;
#   - rétention N jours (RETENTION_DAYS) ;
#   - aucun secret dans ce script : tout vient de /etc/dp-fede/backup.env
#     (refusé s'il n'est pas en mode 600/400) ; le mot de passe passe par un
#     fichier d'options temporaire 600, jamais en ligne de commande ;
#   - hooks optionnels : BACKUP_UPLOAD_HOOK (copie distante),
#     BACKUP_NOTIFY_HOOK (notification, appelé en cas de succès ET d'échec) ;
#   - code de sortie ≠ 0 au moindre échec (cron / supervision).
#
# Usage : dp-fede-backup            (variable DP_FEDE_BACKUP_ENV pour un autre fichier)

set -euo pipefail
umask 077

ENV_FILE="${DP_FEDE_BACKUP_ENV:-/etc/dp-fede/backup.env}"

STEP="initialisation"
STATUS="ERREUR"
FINAL=""
TMP=""
OPTS_FILE=""

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { STEP="$1"; log "ERREUR : $1" >&2; exit 1; }

notify() {
  local status="$1" message="$2"
  [[ -n "${BACKUP_NOTIFY_HOOK:-}" ]] || return 0
  if [[ ! -x "$BACKUP_NOTIFY_HOOK" ]]; then
    log "ATTENTION : BACKUP_NOTIFY_HOOK non exécutable : $BACKUP_NOTIFY_HOOK" >&2
    return 0
  fi
  "$BACKUP_NOTIFY_HOOK" "$status" "$message" "$FINAL" || log "ATTENTION : le hook de notification a échoué" >&2
}

on_exit() {
  local rc=$?
  [[ -n "$OPTS_FILE" ]] && rm -f "$OPTS_FILE"
  [[ -n "$TMP" && -f "$TMP" ]] && rm -f "$TMP"
  if (( rc == 0 )); then
    STATUS="OK"
    notify "$STATUS" "Sauvegarde ${DB_NAME:-?} réussie : ${FINAL}"
  else
    notify "$STATUS" "Sauvegarde ${DB_NAME:-?} en échec (étape : ${STEP}, code ${rc})"
  fi
  exit "$rc"
}
trap on_exit EXIT

# ── Configuration ───────────────────────────────────────────────────────────
STEP="lecture de ${ENV_FILE}"
[[ -f "$ENV_FILE" ]] || fail "fichier de configuration absent : ${ENV_FILE}"
perms="$(stat -c '%a' "$ENV_FILE")"
owner="$(stat -c '%U' "$ENV_FILE")"
[[ "$perms" == "600" || "$perms" == "400" ]] || fail "${ENV_FILE} doit être en mode 600 (actuel : ${perms})"
[[ "$owner" == "root" || "$owner" == "$(id -un)" ]] || fail "${ENV_FILE} doit appartenir à root (actuel : ${owner})"
# shellcheck source=/dev/null
source "$ENV_FILE"

DB_NAME="${DB_NAME:-dp_fede}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dp-fede}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_SIZE_BYTES="${MIN_SIZE_BYTES:-2048}"
BACKUP_UPLOAD_HOOK="${BACKUP_UPLOAD_HOOK:-}"
BACKUP_NOTIFY_HOOK="${BACKUP_NOTIFY_HOOK:-}"
# Variables destinées aux hooks (exemples fournis dans deploy/).
export BACKUP_MAIL_TO="${BACKUP_MAIL_TO:-}"
export RCLONE_REMOTE="${RCLONE_REMOTE:-}"

[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]  || fail "DB_NAME invalide"
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS >= 1 )) || fail "RETENTION_DAYS doit être un entier ≥ 1"
[[ "$MIN_SIZE_BYTES" =~ ^[0-9]+$ ]] || fail "MIN_SIZE_BYTES doit être un entier"
for bin in mysqldump gzip flock sha256sum find; do
  command -v "$bin" >/dev/null || fail "commande absente : ${bin}"
done

# ── Préparation ─────────────────────────────────────────────────────────────
STEP="préparation de ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

exec 9>"${BACKUP_DIR}/.lock"
flock -n 9 || fail "une sauvegarde est déjà en cours"

STAMP="$(date +%Y%m%d-%H%M%S)"
FINAL_PATH="${BACKUP_DIR}/${DB_NAME}-${STAMP}.sql.gz"
TMP="${FINAL_PATH}.partial"

# Fichier d'options client : évite le mot de passe dans `ps`.
OPTS_FILE="$(mktemp)"
{
  echo "[client]"
  echo "host=${DB_HOST}"
  if [[ -n "$DB_USER" ]]; then
    echo "user=${DB_USER}"
    # Échappement des \ et " pour le format des fichiers d'options MariaDB.
    esc="${DB_PASSWORD//\\/\\\\}"
    esc="${esc//\"/\\\"}"
    echo "password=\"${esc}\""
  fi
} > "$OPTS_FILE"
# DB_USER vide → authentification unix_socket de l'utilisateur courant (root).

# ── Dump ────────────────────────────────────────────────────────────────────
STEP="mysqldump"
log "Dump de ${DB_NAME} → ${FINAL_PATH}"
mysqldump --defaults-extra-file="$OPTS_FILE" \
  --single-transaction --quick --routines --triggers --hex-blob \
  --no-tablespaces --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -c > "$TMP"

# ── Vérifications ───────────────────────────────────────────────────────────
STEP="vérification gzip"
gzip -t "$TMP" || fail "archive gzip corrompue"

STEP="vérification taille"
size="$(stat -c '%s' "$TMP")"
(( size >= MIN_SIZE_BYTES )) || fail "dump trop petit (${size} octets < ${MIN_SIZE_BYTES})"

STEP="vérification contenu"
# Lecture complète (pas de grep -q : avec pipefail, le SIGPIPE de gzip ferait échouer le test).
last_line="$(gzip -dc "$TMP" | tail -n 1)"
[[ "$last_line" == "-- Dump completed"* ]] || fail "dump incomplet (marqueur de fin absent)"
users_tables="$(gzip -dc "$TMP" | grep -c 'CREATE TABLE `users`' || true)"
(( users_tables >= 1 )) || fail "table users absente du dump"

STEP="finalisation"
mv "$TMP" "$FINAL_PATH"
TMP=""
FINAL="$FINAL_PATH"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256")
log "OK : $(basename "$FINAL") (${size} octets)"

# ── Rétention ───────────────────────────────────────────────────────────────
STEP="rétention"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "${DB_NAME}-*.sql.gz" -o -name "${DB_NAME}-*.sql.gz.sha256" -o -name "${DB_NAME}-*.sql.gz.partial" \) \
  -mtime +"$RETENTION_DAYS" -print -delete
kept="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}-*.sql.gz" | wc -l | tr -d " ")"
log "Rétention ${RETENTION_DAYS} j : ${kept} sauvegarde(s) conservée(s)"

# ── Copie distante (optionnelle) ────────────────────────────────────────────
if [[ -n "$BACKUP_UPLOAD_HOOK" ]]; then
  STEP="upload distant"
  [[ -x "$BACKUP_UPLOAD_HOOK" ]] || fail "BACKUP_UPLOAD_HOOK non exécutable : ${BACKUP_UPLOAD_HOOK}"
  "$BACKUP_UPLOAD_HOOK" "$FINAL" || fail "le hook d'upload a échoué"
  log "Copie distante OK"
fi

STEP="terminé"
exit 0
