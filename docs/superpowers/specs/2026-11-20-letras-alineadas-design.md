# Lyrics aligned to video transcripts (experiment)

**Why.** YouTube's automatic text turns sung pieces into nonsense ("tan foras, tan bellas"). The
programa says which piece is sung, so the real words can replace the guesses at roughly the
right moment. The first case is Chubut 2025, comp. 75 (`h5zX7SaZJt8`), with «Rosa Amarela».

**Approaches.**

| | Trade-off |
|---|---|
| **Text alignment (chosen).** Match the lyric's words in order against YouTube's timed lines. Each match is an anchor, and lines between anchors are spread by syllables. | Light and testable, and it reruns on any video. Timing is approximate. In a spike, 10 of 12 lines anchored. |
| Audio forced alignment (whisperX on the private copy). | Heavy install. Speech models struggle with choirs. |
| Timing by hand. | Exact, but doesn't scale. |

**Design.**
- **Lyrics.** `data/letras/<slug>.md` holds front matter (`titulo`, `autor`, `idioma`, `derechos`, `fuente`) and the text, with stanzas separated by blank lines. Only texts whose rights allow publishing go here; the maintainer confirms the rights.
- **Which video and when.** `data/letras/videos.json` maps a video id to a list of `{letra, desde, hasta}` spans in seconds.
- **Repeats.** Choirs repeat stanzas. The aligner tries each stanza sung 1–3 times and keeps the version that best matches YouTube's words.
- **Pipeline.** `scripts/align_lyrics.py` replaces the lines inside each span with the aligned lyric lines. It runs inside `export_video_transcripts`, so a re-export keeps the result. The file gains `letras: [{desde, hasta, titulo, autor, idioma}]`.
- **Player.** Lyric lines get `lang` set to the piece's language and a ♪ style. The badge adds "letra alineada", and a note below says the times are approximate.
- **Non-goals.** Word-level timing, audio alignment, and lyrics typed by Claude. Texts always come from the maintainer.
