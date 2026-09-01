#!/usr/bin/env bash
# Snapshot the live SQLite database before any deploy / backend restart / migration.
# A ScoreSpace DB is a single self-contained file, so a copy is a complete backup.
# Keeps the most recent snapshots and prunes older auto-backups so the dir stays small.
set -euo pipefail

DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../data" && pwd)"
DB="$DATA_DIR/scorespace.sqlite"
KEEP=20   # how many auto-backups to retain

if [[ ! -f "$DB" ]]; then
  echo "backup-db: no database at $DB — nothing to back up" >&2
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$DATA_DIR/scorespace.sqlite.autobak-$STAMP"
cp -p "$DB" "$DEST"
echo "backup-db: snapshot -> $DEST ($(du -h "$DEST" | cut -f1))"

# Prune: keep the newest $KEEP auto-backups, delete the rest.
mapfile -t OLD < <(ls -1t "$DATA_DIR"/scorespace.sqlite.autobak-* 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if [[ ${#OLD[@]} -gt 0 ]]; then
  rm -f "${OLD[@]}"
  echo "backup-db: pruned ${#OLD[@]} old auto-backup(s)"
fi
