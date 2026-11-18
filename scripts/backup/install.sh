#!/usr/bin/env bash
# Install the monthly private backup for the current user (no root).
#
#   AMG_BACKUP_ROOT=/path/on/the/backup/disk/amgueddfa-backup scripts/backup/install.sh [--tools]
#
# Optional settings: AMG_DISK (the disk's mount point: the run is skipped when it is
# not mounted), AMG_PULL=1 (git pull before each run, for a clone used only for this),
# AMG_ARCHIVE (the archive folder holding VIDEOS.tsv; linked into lists/).
# --tools fetches a current yt-dlp into <root>/bin (official GitHub release);
# monthly.sh keeps it updated. With node or deno on the machine, no other tool is needed.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="${AMG_BACKUP_ROOT:?usage: AMG_BACKUP_ROOT=/path/amgueddfa-backup $0 [--tools]}"
[ -d "$(dirname "$ROOT")" ] || { echo "$(dirname "$ROOT") is not there: mount the backup disk first"; exit 1; }
mkdir -p "$ROOT/lists" "$ROOT/bin" "$ROOT/logs" ~/.config/systemd/user

cat >~/.config/amgueddfa-backup.env <<CONF
# Read by scripts/backup/monthly.sh (written by install.sh on $(date +%F)).
AMG_REPO='$REPO'
AMG_BACKUP_ROOT='$ROOT'
AMG_DISK='${AMG_DISK:-}'
AMG_PULL='${AMG_PULL:-0}'
CONF

if [ "${1:-}" = "--tools" ]; then
  curl -fsSL -o "$ROOT/bin/yt-dlp" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
  chmod +x "$ROOT/bin/yt-dlp"
  echo "yt-dlp $("$ROOT/bin/yt-dlp" --version)"
fi

# The archive's master list, always current.
ARCHIVE="${AMG_ARCHIVE:-$(dirname "$REPO")}"
[ -f "$ARCHIVE/VIDEOS.tsv" ] && ln -sfn "$ARCHIVE/VIDEOS.tsv" "$ROOT/lists/VIDEOS.tsv"

# Only these channels are downloaded (permission given); add a line to widen it.
[ -e "$ROOT/channels.txt" ] || printf '%s\n' '# One YouTube channel name per line, exactly as in VIDEOS.tsv.' 'Eisteddfod del Chubut' >"$ROOT/channels.txt"

chmod +x "$REPO/scripts/backup/monthly.sh" "$REPO/scripts/backup/videos.py"
sed -e "s|@MONTHLY@|$REPO/scripts/backup/monthly.sh|" -e "s|@DOCS@|$REPO/docs/backup.md|" \
  "$REPO/scripts/backup/systemd/amgueddfa-backup.service" >~/.config/systemd/user/amgueddfa-backup.service
cp "$REPO/scripts/backup/systemd/amgueddfa-backup.timer" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now amgueddfa-backup.timer
systemctl --user list-timers amgueddfa-backup.timer --no-pager
