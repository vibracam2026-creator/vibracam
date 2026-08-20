#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_FILE="${1:?Usage: restore-database.sh /path/to/vibracam-YYYYMMDDTHHMMSSZ.sql.gz}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  printf 'Backup file not found: %s\n' "$BACKUP_FILE" >&2
  exit 1
fi

readarray -t DB_PARTS < <(node -e 'const u=new URL(process.argv[1]); for (const value of [u.hostname, u.port || "3306", decodeURIComponent(u.username), decodeURIComponent(u.password), u.pathname.replace(/^\//, "")]) console.log(value)' "$DATABASE_URL")

HOST="${DB_PARTS[0]}"
PORT="${DB_PARTS[1]}"
USER="${DB_PARTS[2]}"
PASSWORD="${DB_PARTS[3]}"
NAME="${DB_PARTS[4]}"

printf 'Restoring %s into database %s at %s:%s. This replaces matching tables. Continue? [y/N] ' "$BACKUP_FILE" "$NAME" "$HOST" "$PORT"
read -r CONFIRMATION
if [[ "$CONFIRMATION" != "y" && "$CONFIRMATION" != "Y" ]]; then
  printf 'Restore cancelled.\n'
  exit 0
fi

MYSQL_PWD="$PASSWORD" gzip -dc "$BACKUP_FILE" | MYSQL_PWD="$PASSWORD" mysql --host="$HOST" --port="$PORT" --user="$USER" "$NAME"
unset MYSQL_PWD
printf 'Restore completed.\n'
