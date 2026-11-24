from pathlib import Path

from scripts.backup.videos import Video, code_of, from_site, merge, next_status, rel_path, slug


def test_slug_drops_code_accents_and_punctuation():
    assert slug('[CH2012006] Corona: Griselda Jones de Redondo') == 'corona-griselda-jones-de-redondo'
    assert slug('Cân yr Arad Goch') == 'can-yr-arad-goch'
    assert slug('!!!') == 'video'
    assert len(slug('a' * 100)) == 40


def test_code_of():
    assert code_of('[CH2012006] Corona') == 'CH2012006'
    assert code_of('Ceremonia del Sillón') == ''


def test_rel_path_sorts_by_festival_year_code():
    v = Video('abc123', 'Eisteddfod_del_Chubut', 2012, 'ceremonia', '[CH2012006] Corona: Griselda Jones')
    assert rel_path(v) == Path('Eisteddfod_del_Chubut/2012/2012_CH2012006_corona-griselda-jones_abc123.mp4')
    undated = Video('x', 'Eisteddfod_Mimosa', None, 'sesion', 'Sesión')
    assert rel_path(undated) == Path('Eisteddfod_Mimosa/sin_fecha/sin_fecha_sesion_sesion_x.mp4')


def test_from_site_maps_slugs_to_archive_folders():
    [v] = from_site({'videos': [{'id': 'a', 'festival': 'juventud', 'year': 2013, 'kind': 'actuacion', 'title': 't', 'channel': 'c'}]})
    assert v.festival == 'Eisteddfod_de_la_Juventud' and v.sources == {'site'}


def test_merge_first_list_wins_and_fills_blanks():
    a = Video('a', 'Eisteddfod_del_Chubut', None, '', 'from tsv', '', {'VIDEOS.tsv'})
    b = Video('a', 'Eisteddfod_del_Chubut', 2010, 'sesion', 'from site', 'Chan', {'site'})
    c = Video('b', 'Eisteddfod_Mimosa', 2020)
    out = merge([a], [b, c])
    assert set(out) == {'a', 'b'}
    assert (out['a'].title, out['a'].year, out['a'].kind, out['a'].channel) == ('from tsv', 2010, 'sesion', 'Chan')
    assert out['a'].sources == {'VIDEOS.tsv', 'site'}


def test_next_status():
    assert next_status(True, True, False) == 'ok'
    assert next_status(True, None, False) == 'ok'
    assert next_status(False, None, False) == 'missing'
    assert next_status(False, True, False, failed=True) == 'error'
    # Gone from YouTube: kept if we have it, lost if not.
    assert next_status(True, False, False) == 'gone_kept'
    assert next_status(False, False, False) == 'gone_lost'
    # Not rechecked this run: the last verdict about YouTube stands.
    assert next_status(True, None, False, prev='gone_kept') == 'gone_kept'
    assert next_status(False, None, False, prev='gone_lost') == 'gone_lost'
    # Back on YouTube.
    assert next_status(True, True, False, prev='gone_kept') == 'ok'
    # A removal request beats everything.
    assert next_status(True, True, True) == 'removed'


def test_channels_file_limits_downloads(tmp_path):
    from scripts.backup.videos import may_download, read_channels
    assert read_channels(tmp_path) is None
    (tmp_path / 'channels.txt').write_text('# permission given\nEisteddfod del Chubut  # the association\n\n')
    allowed = read_channels(tmp_path)
    assert allowed == {'Eisteddfod del Chubut'}
    assert may_download(Video('a', 'f', 2020, channel='Eisteddfod del Chubut'), allowed)
    assert not may_download(Video('b', 'f', 2020, channel='Daniel'), allowed)
    assert may_download(Video('b', 'f', 2020, channel='Daniel'), None)


def test_write_index_sorts_int_and_str_years(tmp_path):
    from scripts.backup.videos import read_index, write_index
    base = {'kind': '', 'title': '', 'channel': '', 'file': '', 'bytes': '', 'duration': '', 'status': 'missing', 'checked': ''}
    rows = [{**base, 'id': 'b', 'festival': 'F', 'year': 2012, 'code': ''},   # from this run
            {**base, 'id': 'a', 'festival': 'F', 'year': '2003', 'code': ''},  # read back from INDEX.tsv
            {**base, 'id': 'c', 'festival': 'F', 'year': '', 'code': ''}]
    write_index(tmp_path, rows)
    assert list(read_index(tmp_path)) == ['a', 'b', 'c']


def test_channels_star_means_every_channel(tmp_path):
    from scripts.backup.videos import read_channels
    (tmp_path / 'channels.txt').write_text('# all uploaders\n*\n')
    assert read_channels(tmp_path) is None


def test_caption_state(tmp_path):
    import json
    from scripts.backup.videos import caption_state
    dest = tmp_path / '2012_CH2012006_x_abc.mp4'
    assert caption_state(dest) == 'missing'          # no info yet
    dest.with_suffix('.info.json').write_text(json.dumps({'automatic_captions': {}, 'subtitles': {}}))
    assert caption_state(dest) == 'none'             # YouTube has no transcription
    dest.with_suffix('.info.json').write_text(json.dumps({'automatic_captions': {'uk-orig': [], 'es': []}}))
    assert caption_state(dest) == 'missing'          # misdetected language still counts
    (tmp_path / '2012_CH2012006_x_abc.uk-orig.vtt').write_text('WEBVTT')
    assert caption_state(dest) == 'yes'


def test_signin_gate_is_not_a_tool_failure():
    from scripts.backup.videos import needs_signin
    assert needs_signin("ERROR: [youtube] ABYirmAXp3M: Please sign in. This helps protect our community.")
    assert not needs_signin("ERROR: unable to download video data: HTTP Error 403: Forbidden")
    assert not needs_signin("[PYI-2124995:ERROR] Failed to extract entry: Cryptodome/Cipher/_ARC4.abi3.so.")


def test_live_chat_is_not_a_transcription(tmp_path):
    import json
    from scripts.backup.videos import caption_langs, caption_state
    assert caption_langs({'subtitles': {'live_chat': []}, 'automatic_captions': {'es': []}}) == []
    assert caption_langs({'subtitles': {'es-419': [], 'live_chat': []}, 'automatic_captions': {'es-orig': [], 'en': []}}) == ['es-419', 'es-orig']
    dest = tmp_path / 'v_abc.mp4'
    dest.with_suffix('.info.json').write_text(json.dumps({'subtitles': {'live_chat': []}}))
    assert caption_state(dest) == 'none'


def test_whisper_states(tmp_path):
    import json
    from scripts.backup.videos import caption_state
    dest = tmp_path / 'v_abc.mp4'
    dest.with_suffix('.info.json').write_text(json.dumps({'subtitles': {}}))
    assert caption_state(dest) == 'none'
    dest.with_suffix('.whisper.json').write_text('{"segments": []}')
    assert caption_state(dest) == 'no_speech'
    (tmp_path / 'v_abc.cy-whisper.vtt').write_text('WEBVTT')
    assert caption_state(dest) == 'whisper'
    (tmp_path / 'v_abc.es-orig.vtt').write_text('WEBVTT')
    assert caption_state(dest) == 'yes'


def test_import_cy_copies_bangor_results_next_to_videos(tmp_path):
    import json
    from scripts.backup.videos import cmd_import_cy
    root = tmp_path / "backup"
    (root / "videos/C/2025").mkdir(parents=True)
    (root / "videos/C/2025/a_AAAAAAAAAAA.mp4").write_bytes(b"")
    (root / "INDEX.tsv").write_text("id\tfile\nAAAAAAAAAAA\tC/2025/a_AAAAAAAAAAA.mp4\n", encoding="utf-8")
    src = tmp_path / "out-cy"
    src.mkdir()
    (src / "AAAAAAAAAAA.json").write_text(json.dumps({"id": "AAAAAAAAAAA", "segments": [{"s": 1.0, "text": "Croeso"}]}), encoding="utf-8")
    (src / "ZZZZZZZZZZZ.json").write_text("{}", encoding="utf-8")  # not in the backup: skipped
    assert cmd_import_cy(root, src) == 0
    assert json.loads((root / "videos/C/2025/a_AAAAAAAAAAA.cy-techiaith.json").read_text())["segments"][0]["text"] == "Croeso"


def test_import_es_copies_the_spanish_pass_next_to_videos(tmp_path):
    import json
    from scripts.backup.videos import main
    root = tmp_path / "backup"
    (root / "videos/C/2021").mkdir(parents=True)
    (root / "videos/C/2021/a_AAAAAAAAAAA.mp4").write_bytes(b"")
    (root / "INDEX.tsv").write_text("id\tfile\nAAAAAAAAAAA\tC/2021/a_AAAAAAAAAAA.mp4\n", encoding="utf-8")
    src = tmp_path / "out-es"
    src.mkdir()
    (src / "AAAAAAAAAAA.json").write_text(json.dumps({"id": "AAAAAAAAAAA", "segments": [{"s": 1.0, "e": 3.0, "es": 0.99, "cy": 0.0, "text": "Muchas gracias"}]}), encoding="utf-8")
    assert main(["--root", str(root), "import-es", str(src)]) == 0
    assert json.loads((root / "videos/C/2021/a_AAAAAAAAAAA.whisper-es.json").read_text())["segments"][0]["text"] == "Muchas gracias"


def _one_video(tmp_path, year="2025"):
    root = tmp_path / "backup"
    (root / f"videos/C/{year}").mkdir(parents=True)
    (root / f"videos/C/{year}/a_AAAAAAAAAAA.mp4").write_bytes(b"")
    from scripts.backup.videos import INDEX_COLS
    row = {c: "" for c in INDEX_COLS} | {"id": "AAAAAAAAAAA", "festival": "C", "year": year, "file": f"C/{year}/a_AAAAAAAAAAA.mp4"}
    (root / "INDEX.tsv").write_text("\t".join(INDEX_COLS) + "\n" + "\t".join(row[c] for c in INDEX_COLS) + "\n", encoding="utf-8")
    src = tmp_path / "out"
    src.mkdir()
    return root, src


def test_import_keeps_the_earlier_version_of_a_changed_file(tmp_path):
    import os
    from scripts.backup.videos import cmd_import_cy
    root, src = _one_video(tmp_path)
    dest = root / "videos/C/2025/a_AAAAAAAAAAA.cy-techiaith.json"
    dest.write_text('{"segments": "old"}', encoding="utf-8")
    os.utime(dest, (1795000000, 1795000000))  # 2026-11-19 ~ when the old run arrived
    (src / "AAAAAAAAAAA.json").write_text('{"segments": "new"}', encoding="utf-8")
    assert cmd_import_cy(root, src) == 0
    assert dest.read_text() == '{"segments": "new"}'
    kept = list((root / "versiones/C/2025").glob("a_AAAAAAAAAAA.cy-techiaith.*.json"))
    assert len(kept) == 1 and kept[0].read_text() == '{"segments": "old"}'
    assert "2026-11-" in kept[0].name


def test_import_of_an_identical_file_keeps_no_extra_version(tmp_path):
    from scripts.backup.videos import cmd_import_cy
    root, src = _one_video(tmp_path)
    (root / "videos/C/2025/a_AAAAAAAAAAA.cy-techiaith.json").write_text('{"segments": []}', encoding="utf-8")
    (src / "AAAAAAAAAAA.json").write_text('{"segments": []}', encoding="utf-8")
    assert cmd_import_cy(root, src) == 0
    assert not (root / "versiones").exists()


def test_two_reimports_keep_both_earlier_versions(tmp_path):
    from scripts.backup.videos import cmd_import_es
    root, src = _one_video(tmp_path)
    for text in ("v1", "v2", "v3"):
        (src / "AAAAAAAAAAA.json").write_text(f'{{"t": "{text}"}}', encoding="utf-8")
        cmd_import_es(root, src)
    kept = sorted(p.read_text() for p in (root / "versiones/C/2025").glob("a_AAAAAAAAAAA.whisper-es.*.json"))
    assert kept == ['{"t": "v1"}', '{"t": "v2"}']
    assert (root / "videos/C/2025/a_AAAAAAAAAAA.whisper-es.json").read_text() == '{"t": "v3"}'


def test_import_whisper_keeps_earlier_json_and_vtt(tmp_path):
    import json
    from scripts.backup.videos import cmd_import_whisper
    root, src = _one_video(tmp_path)
    d = root / "videos/C/2025/a_AAAAAAAAAAA"
    d.with_suffix(".whisper.json").write_text(json.dumps({"language": "es", "segments": ["old"]}), encoding="utf-8")
    d.with_suffix(".es-whisper.vtt").write_text("WEBVTT old", encoding="utf-8")
    (src / "AAAAAAAAAAA.json").write_text(json.dumps({"language": "es", "segments": ["new"]}), encoding="utf-8")
    (src / "AAAAAAAAAAA.vtt").write_text("WEBVTT new", encoding="utf-8")
    assert cmd_import_whisper(root, src) == 0
    v = root / "versiones/C/2025"
    assert [json.loads(p.read_text())["segments"] for p in v.glob("a_AAAAAAAAAAA.whisper.*.json")] == [["old"]]
    assert [p.read_text() for p in v.glob("a_AAAAAAAAAAA.es-whisper.*.vtt")] == ["WEBVTT old"]
    assert d.with_suffix(".es-whisper.vtt").read_text() == "WEBVTT new"


def test_remove_deletes_the_kept_versions_too(tmp_path):
    from scripts.backup.videos import cmd_import_cy, cmd_remove
    root, src = _one_video(tmp_path)
    (root / "videos/C/2025/a_AAAAAAAAAAA.cy-techiaith.json").write_text("old", encoding="utf-8")
    (src / "AAAAAAAAAAA.json").write_text("new", encoding="utf-8")
    cmd_import_cy(root, src)
    (root / "versiones/C/2025/b_BBBBBBBBBBB.cy-techiaith.2026-11-01T0000.json").write_text("other video", encoding="utf-8")
    assert cmd_remove(root, "AAAAAAAAAAA", "test") == 0
    assert list((root / "versiones/C/2025").glob("a_AAAAAAAAAAA.*")) == []
    assert (root / "versiones/C/2025/b_BBBBBBBBBBB.cy-techiaith.2026-11-01T0000.json").exists()
