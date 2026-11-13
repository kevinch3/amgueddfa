"""Build low-res derivatives (WebP) and text excerpts for catalog items."""
import csv
import html
from html.parser import HTMLParser
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


# Elements whose whole subtree is boilerplate (navigation, widgets, comments).
_SKIP_TAGS = {"script", "style", "head", "noscript", "nav", "header", "footer",
              "aside", "form", "iframe", "svg", "button", "select", "textarea"}
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
         "meta", "param", "source", "track", "wbr"}
_SKIP_ATTR = re.compile(
    r"(?i)^(?:.*comment.*|.*respond.*|.*reply.*|menu.*|.*-menu|sub-?menu|"
    r"widget.*|sidebar.*|.*breadcrumb.*|subheader|header.*|footer.*|top_bar.*|"
    r"share.*|social.*|navigation|nav|.*-nav|.*-nav-.*|nav-.*|.*related.*|"
    r".*searchform.*)$")
_BLOCK = {"p", "div", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
          "br", "section", "article", "table", "ul", "ol", "dd", "dt", "blockquote"}
# Text-level comment-section markers: cut the excerpt at the first one
# (with any comment count right before it, e.g. "2 Comentarios").
_COMMENT_MARK = re.compile(
    r"(?i)(?:\d+\s+)?(?:comentarios|deja(?:r)? un comentario|leave a reply|"
    r"responder|commented on|comments)|\s(?:dice|says):")


_BR = "\x00"  # block boundary marker
_NAME_SPAN = 60  # a marker this close to its block start: drop the whole block


class _TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip_tag: str | None = None
        self.skip_depth = 0

    def _skippable(self, tag, attrs) -> bool:
        if tag in _SKIP_TAGS:
            return True
        if tag in ("html", "body"):
            return False
        for k, v in attrs:
            if k in ("class", "id") and v and any(_SKIP_ATTR.match(t) for t in v.split()):
                return True
        return False

    def handle_starttag(self, tag, attrs):
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_depth += 1
            return
        if tag not in _VOID and self._skippable(tag, attrs):
            self.skip_tag, self.skip_depth = tag, 1
            return
        if tag in _BLOCK:
            self.out.append(_BR)

    def handle_endtag(self, tag):
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_depth -= 1
                if self.skip_depth == 0:
                    self.skip_tag = None
            return
        if tag in _BLOCK:
            self.out.append(_BR)

    def handle_data(self, data):
        if not self.skip_tag:
            self.out.append(data)


def _decode(b: bytes) -> str:
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("cp1252", errors="replace")


def _html_text(path: Path) -> str:
    p = _TextOnly()
    p.feed(_decode(path.read_bytes()))
    p.close()
    text = re.sub(r"[ \t\r\n\f\v]+", " ", "".join(p.out).replace("\u00a0", " "))
    m = _COMMENT_MARK.search(text)
    if m:
        cut = m.start()
        start = text.rfind(_BR, 0, cut)
        if start >= 0 and cut - start <= _NAME_SPAN:  # e.g. "<p>María López dice: …"
            cut = start
        text = text[:cut]
    return re.sub(r"\s+", " ", text.replace(_BR, " ")).strip()


# Line breaks lost in the SQL->CSV export of the competition tables survive as
# literal "\r\n"/"\n" or as bare "rn"/"n" glued to the neighbouring words.
_L = r"[^\W\d_]"  # a letter
_CELL_FIXES = [
    (re.compile(r"\\r\\n|\\n|\r\n|\r"), "\n"),
    (re.compile(r"(?:rn){2,}"), "\n"),                       # "artesrnrnvisuales"
    (re.compile(rf"(?<!{_L})rn"), "\n"),                     # word-initial: " rn", ":rnNivel", "rna)"
    (re.compile(rf"(?<={_L})rn(?=[A-ZÁÉÍÓÚÑ0-9¿¡]|[\"“]+[¿¡]?[A-ZÁÉÍÓÚÑ])"), "\n"),  # "EisteddfodrnTrabajo"
    (re.compile(rf"(?<={_L})rn$"), ""),                       # trailing "Freyerrn"
    (re.compile(rf"(?:(?<=\s)|(?<=[.…:;]))n(?=\s|$|[a-z]\))"), "\n"),  # lone "n" from "\n"
]


def _demojibake(s: str) -> str:
    if "Ã" not in s and "Â" not in s:
        return s
    try:
        return s.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def clean_cell(v):
    if not isinstance(v, str):
        return v
    s = _demojibake(v)
    for rx, rep in _CELL_FIXES:
        s = rx.sub(rep, s)
    s = re.sub(r"[ \t]*\n\s*", "\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


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

    if item.restricted:  # captions of restricted items may name participants
        item.note_public = ""

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
                item.table = [{clean_cell(k): clean_cell(v) for k, v in row.items()}
                              for row in csv.DictReader(f)]
        if item.restricted:  # extracted text must never reach the public catalog
            item.text_excerpt, item.table = None, None
        return item

    item.pages = len(pages)
    item.thumb = rel(thumb)
    item.page_paths = [rel(p) for p in pages]
    return item
