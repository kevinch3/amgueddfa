# One GPU job at a time (a second process runs the 8 GB card out of memory and kills both).
# Replaces queue_cy.sh after its first step: waits for run_cy.py cy-ids-rest.txt (BC61L8txOaQ),
# then 1) Spanish for the Spanish speech of the videos Whisper took for Welsh (issue #112),
# 2) Welsh for the published videos (cy-pub-ids.txt), as queue_cy.sh would have.
cd /mnt/raid2/data/V1/amgueddfa-whisper
while pgrep -f "[r]un_cy.py cy-ids-rest" >/dev/null; do sleep 60; done
L=$(venv/bin/python -c "import nvidia.cublas, nvidia.cudnn; print(nvidia.cublas.__path__[0]+'/lib:'+nvidia.cudnn.__path__[0]+'/lib')")
LD_LIBRARY_PATH=$L nice -n 10 venv/bin/python run_es.py es-ids.txt >> es.log 2>&1
LD_LIBRARY_PATH=$L nice -n 10 venv/bin/python run_cy.py cy-pub-ids.txt >> cy-pub.log 2>&1
