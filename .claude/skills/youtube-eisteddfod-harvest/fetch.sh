#!/bin/bash
# bash fetch.sh IDS.txt OUT.jsonl
# Resumable: skips ids already in OUT.jsonl. One compact JSON object per video, no download.
# Paced on purpose: 3 unpaced parallel runs got ~800 false "Este vídeo no está disponible"
# (throttling) after ~1300 videos. Re-run the same command later to retry failures.
# Errors (deleted, private, sign-in required) go to OUT.jsonl.err.
set -u
ids="$1"; out="$2"
done_ids=$(mktemp)
grep -o '"id": *"[^"]*"' "$out" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/' > "$done_ids"
grep -vxFf "$done_ids" "$ids" | sed 's#^#https://www.youtube.com/watch?v=#' > "$ids.todo"
yt-dlp --no-update --skip-download --ignore-errors --no-warnings \
  --sleep-requests 1 --sleep-interval 2 --max-sleep-interval 5 \
  --extractor-args "youtube:lang=es" -a "$ids.todo" \
  --print "%(.{id,title,channel,channel_url,uploader_id,upload_date,release_date,duration,description,live_status,was_live,availability})j" \
  >> "$out" 2>> "$out.err"
rm -f "$done_ids" "$ids.todo"
