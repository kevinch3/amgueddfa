"""Start (or resume) one vision chunk on a Colab GPU: get a runtime (every 2 min, any eligible GPU), upload the code,
the chunk's frames, its list and the results so far, then run the 7B in 4-bit over the list. On the runtime a loop
packs the finished results into /content/out.tar every 2 minutes. Prints the runtime name.

  python3 -I colab_chunk.py <chunk name>

Reads $VISUAL_STORE/chunks/<name>.txt (video ids, one per line) and <name>.tar (those folders, made by
kaggle_chunk.py prepare). Results so far, if any: $VISUAL_STORE/colab-out-<name>.tar.
"""
import json, os, subprocess, sys, time, urllib.request, uuid
from pathlib import Path
SK = Path(__file__).resolve().parent
REPO = SK.parents[2]
V = Path(os.environ.get("VISUAL_STORE", REPO.parent / ".visual"))
C = sys.argv[1]
SPECS = [("L4", "SHAPE_STANDARD"), ("A100", "SHAPE_STANDARD"), ("G4", "SHAPE_STANDARD"), ("T4", "SHAPE_STANDARD"), ("T4", "SHAPE_HIGHMEM")]


def call(name, args):
    tok = subprocess.run(["/snap/bin/gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    req = urllib.request.Request("https://colaboratory.googleapis.com/mcp", method="POST", data=json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}).encode(),
        headers={"Authorization": f"Bearer {tok}", "x-goog-user-project": "amgueddfa-colab", "content-type": "application/json",
                 "accept": "application/json, text/event-stream"})
    body = urllib.request.urlopen(req, timeout=900).read().decode()
    return json.loads(body.split("data: ")[-1] if "data: " in body else body).get("result", {})


def up(rt, local, remote):
    subprocess.run(["python3", "-I", str(SK / "colab_files.py"), rt, "up", str(local), remote], check=True)


rt = None
while not rt:
    for acc, shape in SPECS:
        try:
            r = call("create_runtime", {"runtime": {"runtimeSpec": {"variant": "VARIANT_GPU", "accelerator": acc, "shape": shape}},
                                        "requestId": str(uuid.uuid4())})
        except Exception as e:
            print(time.strftime("%H:%M"), "error", e, flush=True)
            continue
        if not r.get("isError") and "structuredContent" in r:
            rt = r["structuredContent"]["name"]
            print(time.strftime("%H:%M"), "GRANTED", acc, rt, flush=True)
            break
    if not rt:
        time.sleep(120)

# The code, the chunk's list and frames, and the results so far.
code_tar = V / "code.tar"
subprocess.run(["tar", "-cf", str(code_tar), "-C", str(REPO), "scripts/__init__.py", "scripts/ocr.py", "scripts/visual"], check=True)
up(rt, code_tar, "content/code.tar")
up(rt, V / "chunks" / f"{C}.txt", f"content/chunk{C}_all.txt")
up(rt, V / "chunks" / f"{C}.tar", f"content/chunk{C}.tar")
prev = V / f"colab-out-{C}.tar"
if prev.exists():
    up(rt, prev, "content/out.tar")
code = rf'''import subprocess, os
subprocess.run("cd /content && tar -xf code.tar && tar -xf chunk{C}.tar && rm chunk{C}.tar && (test -f out.tar && tar -xf out.tar || true)", shell=True, check=True)
subprocess.Popen("cd /content && pip -q install bitsandbytes > vis.log 2>&1 && "
  "python -m scripts.visual.vlm chunk{C}_all.txt Qwen/Qwen2.5-VL-7B-Instruct 4 4 >> vis.log 2>&1; echo ALLDONE >> vis.log", shell=True, start_new_session=True)
subprocess.Popen("cd /content && while true; do ls ./*/vlm.4bit.jsonl >/dev/null 2>&1 && tar -cf out.tmp ./*/vlm.4bit.jsonl && mv out.tmp out.tar; sleep 120; done",
  shell=True, start_new_session=True)
print("started", len(open("/content/chunk{C}_all.txt").read().split()), "videos")'''
print(call("execute_code", {"runtime": rt, "code": code}).get("structuredContent", {}).get("stdout"), flush=True)
print("RUNTIME", rt, flush=True)
