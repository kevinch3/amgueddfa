import hashlib
import shutil
from pathlib import Path

import pytest

from scripts.catalog.scan import scan

FIX = Path(__file__).parent / "fixtures" / "mini_archive"


@pytest.fixture(scope="module")
def items():
    return scan(FIX, set())


def by_title(items, title):
    return next(i for i in items if i.title == title)


def test_ids_are_content_hash(items):
    it = by_title(items, "Suelto")
    expect = hashlib.sha256((FIX / it.src_path).read_bytes()).hexdigest()[:12]
    assert it.id == expect and len(it.id) == 12


def test_slugs_and_years(items):
    s = by_title(items, "Suelto")
    assert (s.festival, s.year, s.category, s.kind) == ("chubut", 1990, "otros", "image")
    g = by_title(items, "Reglas web wayback 20060430")
    assert (g.festival, g.year, g.undated, g.category, g.kind) == ("mimosa", None, False, "otros", "web")
    assert g.year_inferred is True
    fb = by_title(items, "fechas-importantes")
    assert fb.category == "bases" and fb.year_inferred is True
    assert fb.note_public == "Atención FECHAS IMPORTANTES"
    assert fb.source_label == "Facebook"
    assert by_title(items, "Programa 1990").category == "programa"
    assert [i.festival for i in items] == sorted(i.festival for i in items)


def test_resultados_restricted_and_extra_list(items):
    r = by_title(items, "Resultados 2016")
    assert r.category == "resultados" and r.restricted is True
    assert by_title(items, "Suelto").restricted is False
    extra = scan(FIX, {by_title(items, "Suelto").id})
    assert by_title(extra, "Suelto").restricted is True


def test_duplicate_bytes_one_item_with_alt_paths(items):
    pdfs = [i for i in items if i.kind == "pdf"]
    assert len(pdfs) == 1
    assert len(pdfs[0].alt_paths) == 1
    assert {pdfs[0].src_path, *pdfs[0].alt_paths} == {
        "Eisteddfod_del_Chubut/1990/Programa/Programa_1990.pdf",
        "Eisteddfod_del_Chubut/1990/Varios/Copia_programa.pdf",
    }
    assert len({i.id for i in items}) == len(items) == 6


def test_pre_existing_source_label(items):
    p = by_title(items, "Programa 1990")
    assert p.source_url is None
    assert p.source_label == "Colección inicial (origen no registrado)"


def test_kpc_source_has_no_url(items):
    k = by_title(items, "Tapa programa foto 1")
    assert k.source_url is None
    assert k.source_label == "Archivo personal (kpc)"
    assert k.year_inferred is True


def test_other_host_label(items):
    assert by_title(items, "Suelto").source_label == "www.gaiman.gov.ar"


def test_file_missing_from_sources_raises(tmp_path):
    shutil.copytree(FIX, tmp_path / "a")
    (tmp_path / "a/Eisteddfod_Mimosa/2016/Nuevo.jpg").write_bytes(b"new")
    with pytest.raises(ValueError, match="Nuevo.jpg"):
        scan(tmp_path / "a", set())


def test_restricted_if_any_duplicate_path_is_resultados(tmp_path):
    a = tmp_path / "a"
    (a / "Eisteddfod_Mimosa/2016/Bases_y_avisos").mkdir(parents=True)
    (a / "Eisteddfod_Mimosa/2016/Resultados").mkdir(parents=True)
    first = a / "Eisteddfod_Mimosa/2016/Bases_y_avisos/a.jpg"
    second = a / "Eisteddfod_Mimosa/2016/Resultados/b.jpg"
    first.write_bytes(b"same-bytes")
    second.write_bytes(b"same-bytes")
    (a / "SOURCES.tsv").write_text(
        "path\tsource_url\tretrieved\tmime\tnotes\n"
        "Eisteddfod_Mimosa/2016/Bases_y_avisos/a.jpg\thttp://x/a\t2026-11-13\timage/jpeg\t\n"
        "Eisteddfod_Mimosa/2016/Resultados/b.jpg\thttp://x/b\t2026-11-13\timage/jpeg\t\n"
    )
    items = scan(a, set())
    assert len(items) == 1
    assert items[0].category == "bases"
    assert items[0].restricted is True
