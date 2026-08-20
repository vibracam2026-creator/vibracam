#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:?BASE_URL is required}"
health="$(curl -fsS "$BASE_URL/health")"
printf '%s\n' "$health" | grep -q '"status":"ok"'
admin_code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/trpc/admin.stats")"
[ "$admin_code" = "403" ] || { echo "Expected admin.stats=403, got $admin_code" >&2; exit 1; }
media_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/trpc/media.upload" -H 'content-type: application/json' --data '{"json":{"base64":"AA==","mimeType":"image/png","fileName":"x.png","kind":"post"}}')"
[ "$media_code" = "401" ] || { echo "Expected media.upload=401, got $media_code" >&2; exit 1; }
ice_code="$(curl -sS -o /tmp/vibracam-ice-smoke.json -w '%{http_code}' "$BASE_URL/api/trpc/system.iceServers")"
[ "$ice_code" = "200" ] || { echo "Expected system.iceServers=200, got $ice_code" >&2; exit 1; }
grep -q 'iceServers' /tmp/vibracam-ice-smoke.json || { echo "system.iceServers response is missing iceServers" >&2; exit 1; }
rm -f /tmp/vibracam-ice-smoke.json
printf 'Production smoke checks passed for %s\n' "$BASE_URL"
