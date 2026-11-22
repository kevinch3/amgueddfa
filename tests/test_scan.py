import hashlib
import shutil
from pathlib import Path

import pytest

from scripts.catalog.scan import number_repeats, readable_title, scan

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
    assert g.note_public == ""  # internal note "year inferred" is not published
    fb = by_title(items, "Fechas importantes")
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
    assert len({i.id for i in items}) == len(items) == 7


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


def test_only_source_captions_are_published(items):
    # Internal working notes never reach the site: only a Facebook post's text
    # or the caption column (a platform's own description).
    for i in items:
        if i.source_label not in ("Facebook", "Casgliad y Werin Cymru", "Papurau Newydd Cymru", "Wikimedia Commons"):
            assert i.note_public == "", i.src_path


def test_videos_tree_is_not_scanned(tmp_path):
    # YouTube thumbnails live in a separate Videos/ tree with their own VIDEOS.tsv;
    # they must not become catalog items nor need SOURCES.tsv rows.
    a = tmp_path / "a"
    shutil.copytree(FIX, a)
    before = {i.id for i in scan(a, set())}
    v = a / "Videos/Eisteddfod_de_Dolavon/2015"
    v.mkdir(parents=True)
    (v / "yt_coro_AbCdEfGhIjK.jpg").write_bytes(b"thumb")
    (a / "VIDEOS.tsv").write_text("video_id\turl\n", encoding="utf-8")
    assert {i.id for i in scan(a, set())} == before


def test_named_source_without_url():
    from scripts.catalog.scan import _source
    assert _source("Asociación Eisteddfod del Chubut") == (None, "Asociación Eisteddfod del Chubut")
    assert _source("https://drive.google.com/file/d/x/view") == ("https://drive.google.com/file/d/x/view", "Google Drive")
    u = "https://newspapers.library.wales/view/4021959/4021960/1/"
    assert _source(u) == (u, "Papurau Newydd Cymru")


def test_platform_source_with_rights_and_caption(items):
    g = by_title(items, "Gorsedd Trelew 1913")
    assert g.source_label == "Casgliad y Werin Cymru"
    assert g.source_url == "https://www.casgliadywerin.cymru/items/522464"
    assert g.rights == "Llyfrgell Genedlaethol Cymru (LLGC) · Creative Archive Licence"
    assert g.note_public == "Eisteddfod Trelew, 1913, yr Orsedd."  # the platform caption is public
    assert by_title(items, "Suelto").rights == ""


@pytest.mark.parametrize("raw, year, want", [
    ("bases", 2022, "Bases"),
    ("programa-del-dia", 2019, "Programa del día"),
    ("piezas-recitacion", 2016, "Piezas de recitación"),
    ("desde-casa-competencias", 2020, "Competencias desde casa"),
    ("cierre-inscripciones-competencias", 2014, "Cierre de inscripciones a competencias"),
    ("semana-programa", 2018, "Programa de la semana"),
    ("bases-gales", 2022, "Bases en galés"),
    ("EisteddAdre-programa-reglamento", 2020, "EisteddAdre: programa y reglamento"),
    ("avisos-erratas", 2015, "Avisos y erratas"),
    ("comp-29-30", 2019, "Competencias 29 y 30"),
    ("web programa-eisteddfod-del-chubut-2016", 2016, "Programa del Eisteddfod del Chubut"),
    ("villagra danzas-inscripcion-2019", 2019, "Danzas: inscripción"),
    ("web chubutcultural corona-del-poeta-2019", 2019, "Corona del poeta"),
    ("ig afiche-2-3-mayo-2025", 2025, "Afiche 2 y 3 de mayo"),
    ("web rhaglen-y-dydd 2023", 2023, "Rhaglen y dydd"),
    ("web resultados-preliminar-regional-zona-trelew feed wayback 20150519", 2015, "Resultados preliminar regional zona Trelew"),
    ("web competencias-fotografia-y-diseno-grafico", 2018, "Competencias fotografía y diseño gráfico"),
    ("web reglamento", None, "Reglamento"),
    ("web resultados vivo 2012", 2012, "Resultados en vivo"),
    ("web banner Programa 2008", 2008, "Banner Programa 2008"),
    ("web Tapa 2008", 2008, "Tapa 2008"),
    ("culturagaiman agenda-septiembre-DirCulturaGaiman", 2019, "Agenda de septiembre (Dirección de Cultura de Gaiman)"),
])
def test_readable_title_from_a_file_name(raw, year, want):
    assert readable_title(raw, year) == want


@pytest.mark.parametrize("human", ["Corona del Eisteddfod de Trelew 1909", "Y Drafod 1913-11-28 t1", "Reglas web wayback 20060430", "Tapa programa foto 25"])
def test_readable_title_keeps_titles_written_by_people(human):
    assert readable_title(human, 1913) == human


def test_same_title_in_one_edition_is_numbered_in_file_order():
    from scripts.catalog.model import Item
    mk = lambda path, title: Item(id=path, festival="chubut", year=2022, undated=False, category="bases", title=title, kind="image",
                                  src_path=path, source_url=None, source_label="Facebook", retrieved="", note_public="", rights="",
                                  year_inferred=False, restricted=False)
    its = [mk("b/fb_bases_2.jpg", "Bases"), mk("b/fb_bases_1.jpg", "Bases"), mk("b/fb_fechas_3.jpg", "Fechas")]
    number_repeats(its)
    assert {i.src_path: i.title for i in its} == {"b/fb_bases_1.jpg": "Bases (1 de 2)", "b/fb_bases_2.jpg": "Bases (2 de 2)", "b/fb_fechas_3.jpg": "Fechas"}


def test_numbered_titles_sort_in_number_order():
    from scripts.catalog.scan import title_key
    assert sorted(["Bases (10 de 12)", "Bases (2 de 12)", "Bases (1 de 12)"], key=title_key) == ["Bases (1 de 12)", "Bases (2 de 12)", "Bases (10 de 12)"]


def test_numbering_counts_only_public_documents_of_the_same_category():
    from scripts.catalog.model import Item
    mk = lambda path, cat="programa", **kw: Item(id=path, festival="chubut", year=2024, undated=False, category=cat, title="Tapa del programa",
                                                 kind="image", src_path=path, **kw)
    its = [mk("a.jpg", hidden=True), mk("b.jpg"), mk("c.jpg", cat="bases"), mk("d.jpg", restricted=True)]
    number_repeats(its)
    assert [i.title for i in its] == ["Tapa del programa"] * 4  # each public one is alone in its category


@pytest.mark.parametrize("caption, want", [
    ("Competencias de Fotografía. Mirá más competencias para participar", "Competencias de Fotografía"),
    ("Competencia: DANZAS.", "Competencia de danzas"),
    ("Competencias: RECITACIÓN, en castellano y galés.", "Competencias de recitación, en castellano y galés"),
    ("Competencias de música: COROS.", "Competencias de música: coros"),
    ("Les presentamos las competencias de DANZAS - DAWNS, argentinas, galesas y celtas.", "Competencias de danzas - dawns, argentinas, galesas y celtas"),
    ("Presentamos las competencias de #COROS - #CORAU.", "Competencias de coros - corau"),
    ("Competencia - Literatura: poesía en castellano y galés.", "Competencia de Literatura: poesía en castellano y galés"),
    ("Competencia especial de la edición 2026 del Eisteddfod del Chubut", "Competencia especial de la edición 2026 del Eisteddfod del Chubut"),
    ("COMPETENCIAS DE COCINA EN LA EDICIÓN 2024 DEL EISTEDDFOD DEL CHUBUT. La inscripción", "Competencias de cocina en la edición 2024 del Eisteddfod del Chubut"),
])
def test_caption_title_names_the_competition(caption, want):
    from scripts.catalog.scan import caption_title
    assert caption_title(caption) == want


@pytest.mark.parametrize("caption", ["¡Sumate al Eisteddfod del Chubut!", "Para tener en cuenta!", "This photo is from a post.",
                                     "Acá te mostramos algunas de las competencias que tendremos en la Edición 2014", "", None,
                                     "Competencias " + "muy largas " * 12])
def test_caption_title_ignores_generic_captions(caption):
    from scripts.catalog.scan import caption_title
    assert caption_title(caption) is None


def test_caption_titles_replace_only_numbered_slug_titles():
    from scripts.catalog.model import Item
    from scripts.catalog.scan import caption_titles
    mk = lambda path, title, note: Item(id=path, festival="chubut", year=2014, undated=False, category="bases", title=title,
                                        kind="image", src_path=path, note_public=note)
    its = [mk("a.jpg", "Bases", "Competencias de Fotografía."), mk("b.jpg", "Bases", "Para tener en cuenta!"),
           mk("c.jpg", "Bases", "Competencias de Artesanías."), mk("d.jpg", "Programa 1990", "Competencias de música.")]
    caption_titles(its)
    number_repeats(its)
    assert [i.title for i in its] == ["Competencias de Fotografía", "Bases", "Competencias de Artesanías", "Programa 1990"]
