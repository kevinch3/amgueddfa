"""Keep a Colab runtime's kernel busy while the piece job runs (an idle kernel may get the runtime reclaimed):
run a ~9 min wait loop in one session, again and again, until the job ends or the runtime is gone.
python3 keepbusy.py RUNTIME   (watches /content/vis.log for ALLDONE)"""
import json, subprocess, sys, time, uuid, urllib.request
rt = sys.argv[1]
def call(args):
    tok = subprocess.run(["/snap/bin/gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    req = urllib.request.Request("https://colaboratory.googleapis.com/mcp", method="POST", data=json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "execute_code", "arguments": args}}).encode(),
        headers={"Authorization": f"Bearer {tok}", "x-goog-user-project": "amgueddfa-colab", "content-type": "application/json", "accept": "application/json, text/event-stream"})
    body = urllib.request.urlopen(req, timeout=700).read().decode()
    return json.loads(body[body.index("{"):]).get("result", {})
LOOP = '''
import time
end = time.time() + 540
log = ""
while time.time() < end:
    try: log = open("/content/vis.log").read()
    except OSError: pass
    if "ALLDONE" in log or "Traceback" in log: break
    time.sleep(20)
print("JOB ENDED" if ("ALLDONE" in log or "Traceback" in log) else "still running")
'''
r = call({"runtime": rt, "code": "1"})
session = r.get("structuredContent", {}).get("session")
if not session:
    print("no session:", json.dumps(r)[:300]); sys.exit(1)
print(time.strftime("%H:%M:%S"), "keeping busy", session, flush=True)
fails = 0
while True:
    try:
        r = call({"session": session, "code": LOOP, "executionId": str(uuid.uuid4())})
        fails = 0
    except Exception as e:  # a gateway blip (502, timeout) is not a lost runtime: retry, give up after 5 in a row
        fails += 1
        print(time.strftime("%H:%M:%S"), f"call failed ({fails}/5):", str(e)[:120], flush=True)
        if fails >= 5:
            break
        time.sleep(60)
        continue
    out = r.get("structuredContent", {}).get("stdout", "")
    if r.get("isError") or "JOB ENDED" in out:
        print(time.strftime("%H:%M:%S"), "stop:", out.strip()[:100] or json.dumps(r)[:200], flush=True); break
