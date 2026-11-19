#!/usr/bin/env bash
# Private backup, once a month (systemd user timer amgueddfa-backup.timer).
# The timer fires daily; this script does the work only on the first day of a
# month on which the backup disk is mounted, and does nothing the other days.
#  1. (optional) update the repository the tool runs from
#  2. videos: download new ones, check that saved ones are still on YouTube
#  3. catalog media from R2 (issue #23), only once rclone and the r2: remote exist
#  4. keep README.md in the backup root current
# Settings: ~/.config/amgueddfa-backup.env (written by install.sh).
set -uo pipefail

[ -f "$HOME/.config/amgueddfa-backup.env" ] && . "$HOME/.config/amgueddfa-backup.env"
REPO="${AMG_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
ROOT="${AMG_BACKUP_ROOT:?set AMG_BACKUP_ROOT in ~/.config/amgueddfa-backup.env}"
MONTH="$(date +%Y-%m)"

# The backup disk must be mounted; never write the tree onto another disk.
if [ ! -d "$(dirname "$ROOT")" ] || { [ -n "${AMG_DISK:-}" ] && ! mountpoint -q "$AMG_DISK"; }; then
  echo "backup disk not mounted ($ROOT): skipped, will try again tomorrow"
  exit 0
fi
mkdir -p "$ROOT/logs" "$ROOT/lists" "$ROOT/tmp"
# The private yt-dlp is a one-file build that unpacks itself into $TMPDIR on every
# call; a full /tmp (seen 2026-11-19: "Failed to extract entry") stops the run.
export TMPDIR="$ROOT/tmp"
DONE="$ROOT/logs/done-$MONTH"
if [ -e "$DONE" ] && [ "${1:-}" != "--force" ]; then
  echo "already done this month ($DONE)"
  exit 0
fi
LOG="$ROOT/logs/$MONTH.log"
say() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }

say "monthly backup: start"
if [ "${AMG_PULL:-0}" = 1 ]; then
  git -C "$REPO" pull --ff-only --quiet || say "git pull failed; using the copy already here"
fi

# Private tools: Ubuntu's yt-dlp goes stale and YouTube then answers 403, so the
# private copy updates itself on every run. YouTube also needs a JS runtime.
BIN="$ROOT/bin"
if [ -x "$BIN/yt-dlp" ]; then
  "$BIN/yt-dlp" -U >>"$LOG" 2>&1 || say "yt-dlp -U failed; using the version already here"
  export YTDLP="$BIN/yt-dlp"
fi
if [ -x "$BIN/deno" ]; then export YTDLP_JS="deno:$BIN/deno"
elif command -v node >/dev/null; then export YTDLP_JS="node:$(command -v node)"
elif [ -x "$HOME/.local/bin/node" ]; then export YTDLP_JS="node:$HOME/.local/bin/node"
fi
say "yt-dlp $(${YTDLP:-yt-dlp} --version 2>/dev/null), js ${YTDLP_JS:-none}"

python3 "$REPO/scripts/backup/videos.py" --root "$ROOT" run --check
videos=$?

if command -v rclone >/dev/null && rclone listremotes 2>/dev/null | grep -qx 'r2:'; then
  say "media: rclone sync from r2:amgueddfa-media/media"
  rclone sync r2:amgueddfa-media/media "$ROOT/media" --checksum \
    --backup-dir "$ROOT/media-deleted/$(date +%F)" --log-file "$LOG" --log-level NOTICE \
    || say "media: rclone sync failed"
else
  say "media: skipped (rclone or the r2: remote is not set up here, see issue #23)"
fi

cp "$REPO/docs/backup.md" "$ROOT/README.md" 2>/dev/null || true
# Done for the month only if the video step finished; otherwise tomorrow retries.
[ "$videos" = 0 ] && touch "$DONE"
say "monthly backup: end (videos exit $videos)"
exit "$videos"
