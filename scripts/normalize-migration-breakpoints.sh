#!/usr/bin/env bash
set -euo pipefail

for file in drizzle/*.sql; do
  if grep -q -- "--> statement-breakpoint" "$file"; then
    continue
  fi
  tmp="${file}.tmp"
  awk '{ print; if ($0 ~ /;[[:space:]]*$/) print "--> statement-breakpoint"; }' "$file" > "$tmp"
  sed -i '${/^--> statement-breakpoint$/d;}' "$tmp"
  mv "$tmp" "$file"
done

printf '%s\n' "Migration statement breakpoints normalized."
