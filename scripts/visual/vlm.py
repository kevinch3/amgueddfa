"""A vision model's reading of chosen frames: on-screen text, a scene label, and one sentence on what happens.

  python -m scripts.visual.vlm <frames dir> [model=Qwen/Qwen2.5-VL-7B-Instruct]

Reads <dir>/frames.json and <dir>/ocr.json, picks the frames (`select`), and appends to <dir>/vlm.jsonl one row per
frame: {"t", "reply", "s"} (raw reply, seconds taken); `parse_reply` reads a reply. Resumes where it stopped.
Runs on a GPU (Colab, or KPC with immich ML paused). The 7B loads in 4 bits on cards under 20 GB.

Tested 2026-11-25: the 3B broke the format and made up screen text; the 7B in 4 bits on a T4 kept the format and
took 1.8 s per frame. The prompt names no festival: a model told "Eisteddfod" reads that word into frames without it.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

MODEL = "Qwen/Qwen2.5-VL-7B-Instruct"
EVERY = 4  # every 4th kept frame, plus OCR hits with their neighbours, plus scene cuts
SCENES = ("ceremony", "jury", "presenters", "performance", "audience", "sponsors", "slide", "other")
PROMPT = (
    "This is a frame from a video of a music and poetry festival. "
    "Look at it and answer in exactly three lines:\n"
    "TEXT: copy every word written in the image (slides, captions, banners, logos, signs), or NONE\n"
    "SCENE: pick one word: " + ", ".join(SCENES) + "\n"
    "WHAT: describe what is happening in one sentence of your own\n"
    "Never name or guess who a person is; describe roles only."
)
_ECHO = ("copy every word", "pick one word", "any text in the image")


def parse_reply(reply: str) -> dict:
    """{"text", "scene", "what"} from the full three-line form or the short "text | scene | what" one. An unknown
    scene is None; text that repeats the instructions, or NONE, is ""."""
    fields = {}
    for key in ("TEXT", "SCENE", "WHAT"):
        m = re.search(rf"^\s*{key}:\s*(.*)$", reply, re.M | re.I)
        if m:
            fields[key] = m.group(1).strip()
    if not fields:
        parts = [p.strip() for p in reply.replace("\n", " | ").split("|") if p.strip()]
        if len(parts) >= 2:
            fields = {"TEXT": parts[0], "SCENE": parts[1], "WHAT": " ".join(parts[2:])}
    text = fields.get("TEXT", "")
    if text.upper() == "NONE" or any(e in text.lower() for e in _ECHO):
        text = ""
    scene = fields.get("SCENE", "").strip().lower().rstrip(".")
    return {"text": text, "scene": scene if scene in SCENES else None, "what": fields.get("WHAT", "")}


def select(kept: list[int], ocr_hits: set[int], cuts: set[int], every: int = EVERY) -> list[int]:
    """The kept frames the model reads: every `every`-th one, each OCR hit with the kept frames either side, every cut."""
    chosen = set(kept[::every]) | cuts
    for i, t in enumerate(kept):
        if t in ocr_hits:
            chosen.update(kept[max(0, i - 1):i + 2])
    return sorted(chosen)


def main(argv: list[str]) -> int:  # pragma: no cover - needs a GPU
    import torch
    from PIL import Image
    from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2_5_VLForConditionalGeneration

    from scripts.visual.ocr_frames import has_text

    folder, model_id = Path(argv[0]), argv[1] if len(argv) > 1 else MODEL
    meta = json.loads((folder / "frames.json").read_text(encoding="utf-8"))
    ocr_rows = json.loads((folder / "ocr.json").read_text(encoding="utf-8"))
    times = select(meta["kept"], {r["t"] for r in ocr_rows if has_text(r["text"])}, set(meta["cuts"]))
    out = folder / "vlm.jsonl"
    done = {json.loads(l)["t"] for l in out.read_text(encoding="utf-8").splitlines()} if out.exists() else set()
    small = torch.cuda.get_device_properties(0).total_memory < 20e9
    q = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16) \
        if small and "7B" in model_id else None
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(model_id, torch_dtype=torch.float16, device_map="cuda",
                                                               quantization_config=q)
    proc = AutoProcessor.from_pretrained(model_id)
    msgs = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
    chat = proc.apply_chat_template(msgs, add_generation_prompt=True)
    with out.open("a", encoding="utf-8") as f:
        for t in times:
            if t in done:
                continue
            t0 = time.time()
            with Image.open(folder / f"f{t:06d}.jpg") as im:
                inputs = proc(text=[chat], images=[im.convert("RGB")], return_tensors="pt").to("cuda")
            with torch.no_grad():
                ids = model.generate(**inputs, max_new_tokens=200, do_sample=False)
            reply = proc.batch_decode(ids[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0].strip()
            f.write(json.dumps({"t": t, "reply": reply, "s": round(time.time() - t0, 2)}, ensure_ascii=False) + "\n")
            f.flush()
    print(f"{folder.name}: {len(times)} frames read by {model_id} ({'4-bit' if q else 'fp16'})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
