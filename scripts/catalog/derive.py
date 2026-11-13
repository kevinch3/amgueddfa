"""Build low-res derivatives (WebP) and text excerpts for catalog items."""
import csv
import html
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from PIL import Image, ImageOps

from .model import Item

PAGE_LONG, PAGE_Q = 1200, 70
THUMB_LONG, THUMB_Q = 320, 60
PDF_DPI = 110
EXCERPT_LEN = 600

Image.MAX_IMAGE_PIXELS = None


def _save(im: Image.Image, dest: Path, long_side: int, quality: int) -> None:
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")
    im = im.copy()
    im.thumbnail((long_side, long_side), Image.LANCZOS)
    im.save(dest, "WEBP", quality=quality, method=6)


def _excerpt(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()[:EXCERPT_LEN]


def _html_text(path: Path) -> str:
    raw = path.read_bytes().decode("utf-8", errors="replace")
    raw = re.sub(r"(?is)<(script|style|head|noscript)\b.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<!--.*?-->", " ", raw)
    raw = re.sub(r"(?s)<[^>]*>", " ", raw)
    return html.unescape(raw)


def _office_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in (".docx", ".pptx"):
        try:
            with zipfile.ZipFile(path) as z:
                names = sorted(n for n in z.namelist()
                               if re.match(r"(word/document|ppt/slides/slide\d+)\.xml$", n))
                parts = [re.sub(r"<[^>]+>", " ", z.read(n).decode("utf-8", "replace"))
                         for n in names]
            return html.unescape(" ".join(parts))
        except (zipfile.BadZipFile, KeyError):
            return ""
    cmd = ["xls2csv", str(path)] if ext == ".xls" else ["catdoc", "-w", str(path)]
    if shutil.which(cmd[0]):
        r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if r.returncode == 0:
            return r.stdout
    return ""


def _fresh(files: list[Path], src: Path) -> bool:
    mt = src.stat().st_mtime
    return bool(files) and all(f.exists() and f.stat().st_mtime >= mt for f in files)


def _pages_on_disk(d: Path) -> list[Path]:
    return sorted(d.glob("p[0-9][0-9]*.webp"))


def derive(item: Item, archive: Path, out_root: Path) -> Item:
    archive, out_root = Path(archive), Path(out_root)
    src = archive / item.src_path
    out = out_root / item.id

    def rel(p: Path) -> str:
        return p.relative_to(out_root).as_posix()

    if item.kind == "image":
        thumb, page = out / "thumb.webp", out / "p01.webp"
        if not _fresh([thumb, page], src):
            tmp = out_root / f".tmp-{item.id}"
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True)
            try:
                with Image.open(src) as im:
                    _save(im, tmp / "p01.webp", PAGE_LONG, PAGE_Q)
                    _save(im, tmp / "thumb.webp", THUMB_LONG, THUMB_Q)
                shutil.rmtree(out, ignore_errors=True)
                tmp.rename(out)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        pages = [page]
    elif item.kind == "pdf":
        thumb = out / "thumb.webp"
        pages = _pages_on_disk(out)
        if not _fresh([thumb, *pages], src):
            tmp = out_root / f".tmp-{item.id}"
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True)
            try:
                r = subprocess.run(["pdftoppm", "-r", str(PDF_DPI), "-png", str(src),
                                    str(tmp / "pg")], capture_output=True, text=True,
                                   errors="replace")
                if r.returncode != 0:
                    raise RuntimeError(f"pdftoppm failed (exit {r.returncode}): {r.stderr.strip()}")
                rendered = sorted(tmp.glob("pg-*.png"))
                if not rendered:
                    raise RuntimeError("pdftoppm produced no pages")
                for n, png in enumerate(rendered, 1):
                    with Image.open(png) as im:
                        _save(im, tmp / f"p{n:02d}.webp", PAGE_LONG, PAGE_Q)
                        if n == 1:
                            _save(im, tmp / "thumb.webp", THUMB_LONG, THUMB_Q)
                    png.unlink()
                shutil.rmtree(out, ignore_errors=True)
                tmp.rename(out)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
            pages = _pages_on_disk(out)
    else:
        item.pages, item.thumb, item.page_paths = 0, None, []
        if item.kind == "doc":
            item.text_excerpt = _excerpt(_office_text(src)) or None
        elif item.kind == "web":
            item.text_excerpt = _excerpt(_html_text(src)) or None
        elif item.kind == "table":
            with open(src, newline="", encoding="utf-8-sig", errors="replace") as f:
                item.table = list(csv.DictReader(f))
        if item.restricted:  # extracted text must never reach the public catalog
            item.text_excerpt, item.table = None, None
        return item

    item.pages = len(pages)
    item.thumb = rel(thumb)
    item.page_paths = [rel(p) for p in pages]
    return item
