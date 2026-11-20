"""One window to Claude through Claude Code's non-interactive mode, on the maintainer's
subscription (no API key; --bare would refuse it). The reply is the structured output
of the last `result` event."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Callable

from scripts.reconstruct.windows import Window

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RUN_DIR = REPO.parent / ".reconstruccion" / "run"  # scratch cwd: no project CLAUDE.md is loaded
MODEL = "claude-sonnet-5-5"
NO_MCP = RUN_DIR / "nomcp.json"

CLAUDE_ARGV = [
    "claude", "-p", "--model", MODEL, "--effort", "medium", "--tools", "",
    "--strict-mcp-config", "--mcp-config", str(NO_MCP), "--no-session-persistence",
    "--output-format", "json", "--system-prompt-file", str(HERE / "prompt.md"),
    "--json-schema", (HERE / "schema.json").read_text(encoding="utf-8"),
]


class ModelError(Exception):
    pass


def window_prompt(w: Window) -> str:
    src = "\n".join(f"[{l.t:g}] ({l.src}, {l.lang}) {l.text}" for l in w.lines)
    return (f"WINDOW: {w.t0:g} to {w.t1:g} seconds\n\nSOURCES:\n{src}\n\nCONTEXT:\n{w.context.text}\n\n"
            f"WORD LIST:\n{', '.join(sorted(w.context.words))}\n")


def _run_claude(argv: list[str], cwd: str, timeout: int = 300) -> subprocess.CompletedProcess:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    if not NO_MCP.exists():
        NO_MCP.write_text('{"mcpServers": {}}', encoding="utf-8")
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def ask(w: Window, run: Callable[[list[str], str], subprocess.CompletedProcess] = _run_claude, timeout: int = 300) -> dict:
    """The model's reply for one window; `_usd` carries the reported API-equivalent cost when given."""
    try:
        cp = run(CLAUDE_ARGV + [window_prompt(w)], str(RUN_DIR))
    except subprocess.TimeoutExpired as e:
        raise ModelError(f"timeout after {e.timeout}s") from e
    if cp.returncode != 0:
        raise ModelError(f"claude exited {cp.returncode}: {(cp.stderr or cp.stdout)[-300:]}")
    try:
        events = json.loads(cp.stdout)
    except ValueError as e:
        raise ModelError("output is not JSON") from e
    events = events if isinstance(events, list) else [events]
    results = [e for e in events if isinstance(e, dict) and e.get("type") == "result"]
    if not results or results[-1].get("is_error") or not isinstance(results[-1].get("structured_output"), dict):
        raise ModelError(f"no structured output: {str(results[-1:])[:300]}")
    out = dict(results[-1]["structured_output"])
    if results[-1].get("total_cost_usd") is not None:
        out["_usd"] = results[-1]["total_cost_usd"]
    return out
