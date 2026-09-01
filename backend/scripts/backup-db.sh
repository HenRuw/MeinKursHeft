#!/usr/bin/env bash
# Snapshot the live SQLite databases before any deploy / backend restart / migration.
# A meinKursHeft DB is a single self-contained file, so a copy is a complete backup.
# Each account has its own database (meinkursheft.sqlite = account 1, meinkursheft.user2.sqlite
# = account 2); every one that exists is backed up. Keeps the most recent snapshots per
# database and prunes older auto-backups so the dir stays small.
set -euo pipefail

DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../data" && pwd)"
KEEP=20   # how many auto-backups to retain per database
STAMP="$(date +%Y%m%d-%H%M%S)"

# Every account database, primary first.
DBS=("$DATA_DIR/meinkursheft.sqlite" "$DATA_DIR/meinkursheft.user2.sqlite")

backed_up=0
for DB in "${DBS[@]}"; do
  [[ -f "$DB" ]] || continue
  DEST="$DB.autobak-$STAMP"
  cp -p "$DB" "$DEST"
  echo "backup-db: snapshot -> $DEST ($(du -h "$DEST" | cut -f1))"
  backed_up=$((backed_up + 1))

  # Prune: keep the newest $KEEP auto-backups of THIS database, delete the rest.
  mapfile -t OLD < <(ls -1t "$DB".autobak-* 2>/dev/null | tail -n +$((KEEP + 1)) || true)
  if [[ ${#OLD[@]} -gt 0 ]]; then
    rm -f "${OLD[@]}"
    echo "backup-db: pruned ${#OLD[@]} old auto-backup(s) for $(basename "$DB")"
  fi
done

if [[ "$backed_up" -eq 0 ]]; then
  echo "backup-db: no databases found in $DATA_DIR — nothing to back up" >&2
fi
