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
