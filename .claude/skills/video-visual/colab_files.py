"""Upload/download files to a Colab runtime via the hosted MCP's get_runtime connectionInfo (token never printed).
  python3 colab_files.py RUNTIME up LOCAL REMOTE_PATH | down REMOTE_PATH LOCAL | mkdir REMOTE_DIR"""
import base64, json, subprocess, sys, urllib.request
rt, op = sys.argv[1], sys.argv[2]
tok = subprocess.run(["/snap/bin/gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
req = urllib.request.Request("https://colaboratory.googleapis.com/mcp", method="POST", data=json.dumps(
    {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_runtime", "arguments": {"name": rt}}}).encode(),
    headers={"Authorization": f"Bearer {tok}", "x-goog-user-project": "amgueddfa-colab", "content-type": "application/json",
             "accept": "application/json, text/event-stream"})
body = urllib.request.urlopen(req).read().decode()
body = body[body.index("{"):] if not body.startswith("{") else body
ci = json.loads(body.split("\ndata: ")[-1] if "data: " in body else body)["result"]["structuredContent"]["connectionInfo"]
H = {"X-Colab-Runtime-Proxy-Token": ci["token"], "content-type": "application/json"}
def put(path, payload):
    r = urllib.request.Request(f"{ci['url']}/api/contents/{path}", method="PUT", data=json.dumps(payload).encode(), headers=H)
    return urllib.request.urlopen(r).status
if op == "mkdir":
    print(put(sys.argv[3], {"type": "directory"}))
elif op == "up":
    data, path, CH = open(sys.argv[3], "rb").read(), sys.argv[4], 30_000_000
    parts = [data[i:i + CH] for i in range(0, len(data), CH)] or [b""]
    for n, p in enumerate(parts, 1):
        pl = {"type": "file", "format": "base64", "content": base64.b64encode(p).decode()}
        if len(parts) > 1:
            pl["chunk"] = -1 if n == len(parts) else n
        put(path, pl)
    print("uploaded", path, len(data))
elif op == "down":
    r = urllib.request.Request(f"{ci['url']}/files/{sys.argv[3]}", headers=H)
    open(sys.argv[4], "wb").write(urllib.request.urlopen(r).read()); print("downloaded", sys.argv[4])
