"""A vision model's reading of chosen frames: on-screen text and one sentence on what happens (cues are read from it).

  python -m scripts.visual.vlm <frames dir> [model=Qwen/Qwen2.5-VL-7B-Instruct] [every=4]

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
# Things that can be seen, read from the model's own sentence (2026-11-25, 2001 chairing ceremony):
# - a one-word scene label was too coarse: anyone at a podium was "ceremony", and the chairing was missed;
# - yes/no questions came back without their labels and one short (5 answers for 6), at 4.3 s per frame;
# - the free sentence named them reliably ("kneel on the stage", "a bouquet", "blue robes"): dancing then kneeling
#   at 34:45-36:00 is the chairing. The words are matched whole, so "robust" is not robes.
CUES = {
    "robes": r"robes?|gowns?",
    "dance": r"danc\w*",
    "flowers": r"flowers?|bouquets?",
    "kneel": r"kneel\w*|knelt",
    "judges": r"judges?|panel",
}
PROMPT = (
    "This is a frame from a video of a music and poetry festival. Answer in exactly two lines:\n"
    "TEXT: copy every word written in the image (slides, captions, banners, logos, signs), or NONE\n"
    "WHAT: describe in one sentence what is happening and what the people wear and do\n"
    "Never name or guess who a person is; describe roles only."
)
_ECHO = ("copy every word", "any text in the image")


def cues_in(sentence: str) -> set[str]:
    return {c for c, words in CUES.items() if re.search(rf"\b(?:{words})\b", sentence, re.I)}


def parse_reply(reply: str) -> dict:
    """{"text", "cues", "what"}: the screen text ("" for NONE or echoed instructions), the cues the sentence names,
    and the sentence. A reply without labels counts its first line as the text and its last as the sentence."""
    def line(key: str) -> str | None:
        m = re.search(rf"^\s*{key}:\s*(.*)$", reply, re.M | re.I)
        return m.group(1).strip() if m else None
    lines = [l.strip() for l in reply.strip().splitlines() if l.strip()]
    text, what = line("TEXT"), line("WHAT")
    if text is None and what is None and len(lines) >= 2:
        text, what = lines[0], lines[-1]
    text, what = text or "", what or ""
    if text.upper() == "NONE" or any(e in text.lower() for e in _ECHO):
        text = ""
    return {"text": text, "cues": cues_in(what), "what": what}


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
    every = int(argv[2]) if len(argv) > 2 else EVERY  # 1 reads every kept frame (tests)
    meta = json.loads((folder / "frames.json").read_text(encoding="utf-8"))
    ocr_rows = json.loads((folder / "ocr.json").read_text(encoding="utf-8"))
    times = select(meta["kept"], {r["t"] for r in ocr_rows if has_text(r["text"])}, set(meta["cuts"]), every)
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
                ids = model.generate(**inputs, max_new_tokens=120, do_sample=False)
            reply = proc.batch_decode(ids[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0].strip()
            f.write(json.dumps({"t": t, "reply": reply, "s": round(time.time() - t0, 2)}, ensure_ascii=False) + "\n")
            f.flush()
    print(f"{folder.name}: {len(times)} frames read by {model_id} ({'4-bit' if q else 'fp16'})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
