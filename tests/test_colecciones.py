"""The Python scripts read the same collection list as the site (docs/reglas.md, rule 1)."""
import json

from scripts import colecciones
from scripts.catalog import scan
from scripts import export_video_transcripts, export_videos


def test_scripts_share_the_collection_list():
    data = json.loads(colecciones.FILE.read_text(encoding="utf-8"))
    folders = {c["carpeta"]: c["id"] for c in data["colecciones"]}
    assert scan.FESTIVALS == folders
    assert export_videos.SLUGS == folders
    assert export_video_transcripts.FESTIVALS == {c["id"] for c in data["colecciones"] if c["texto_de_videos"]}
    assert set(folders.values()) == {"chubut", "juventud", "mimosa", "trevelin"}
