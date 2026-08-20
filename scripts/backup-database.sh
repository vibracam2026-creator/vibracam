#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

readarray -t DB_PARTS < <(node -e 'const u=new URL(process.argv[1]); for (const value of [u.hostname, u.port || "3306", decodeURIComponent(u.username), decodeURIComponent(u.password), u.pathname.replace(/^\\//, "")]) console.log(value)' "$DATABASE_URL")

HOST="${DB_PARTS[0]}"
PORT="${DB_PARTS[1]}"
USER="${DB_PARTS[2]}"
PASSWORD="${DB_PARTS[3]}"
NAME="${DB_PARTS[4]}"
OUTPUT="$BACKUP_DIR/vibracam-${STAMP}.sql.gz"

MYSQL_PWD="$PASSWORD" mysqldump --single-transaction --routines --triggers --host="$HOST" --port="$PORT" --user="$USER" "$NAME" | gzip -9 > "$OUTPUT"
unset MYSQL_PWD
chmod 600 "$OUTPUT"
printf 'Created %s\n' "$OUTPUT"
