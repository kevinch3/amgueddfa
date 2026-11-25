#!/bin/bash
# bash go_chunk.sh <chunk name>: run vision chunk <name> on Colab to the end: start it, keep its kernel busy, fetch the packed results every 2 minutes,
# and when the runtime is lost, start again on a new one with the results so far (the model skips frames done).
SK=$(cd "$(dirname "$0")" && pwd)
V=${VISUAL_STORE:-$(cd "$SK/../../../.." && pwd)/.visual}
C=$1; LOG=$V/colab-chunk$C.log
while true; do
  R=$(python3 -I $SK/colab_chunk.py $C 2>>$LOG | tee -a $LOG | grep -o "RUNTIME runtimes/r-[a-z0-9-]*" | cut -d' ' -f2)
  [ -z "$R" ] && { echo "$(date +%H:%M) start failed, retrying" >> $LOG; sleep 120; continue; }
  fails=0
  while true; do
    ps -eo args | grep -q "[k]eepbusy_vis.py $R" || python3 -I $SK/keepbusy.py $R >> $LOG 2>&1 &
    ok=0
    python3 -I $SK/colab_files.py $R down content/vis.log $V/colab-chunk$C.vis.log >/dev/null 2>&1 && ok=1
    python3 -I $SK/colab_files.py $R down content/out.tar $V/colab-out-$C.new >/dev/null 2>&1 && \
      [ $(stat -c%s $V/colab-out-$C.new) -ge $(stat -c%s $V/colab-out-$C.tar 2>/dev/null || echo 0) ] && mv $V/colab-out-$C.new $V/colab-out-$C.tar
    [ $ok = 1 ] && fails=0 || fails=$((fails+1))
    if grep -q ALLDONE $V/colab-chunk$C.vis.log 2>/dev/null; then
      sleep 150; python3 -I $SK/colab_files.py $R down content/out.tar $V/colab-out-$C.tar >/dev/null 2>&1
      echo "$(date +%H:%M) CHUNK $C DONE on $R" >> $LOG; echo "CHUNK $C DONE"; exit 0
    fi
    [ $fails -ge 10 ] && { echo "$(date +%H:%M) runtime $R lost; resuming on a new one" >> $LOG; break; }
    sleep 120
  done
done
