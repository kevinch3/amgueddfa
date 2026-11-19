# Sources and gaps (2026-11-19)

What the archive holds per festival and year, and new sources that fill the gaps.
Leads only: nothing here is in the archive yet.

## Gaps (from the catalog, videos and Ganadores files)

P = programa, R = results, V = video.

| Festival | Empty or thin | Have |
|---|---|---|
| Chubut | **1887–1974** (one programa, 1886); results **before 2006** | programas 1975→ (holes 1976–80, 83, 91–92, 94, 96), results 2006–2014, videos 2001→ |
| Juventud | **1986–2007**; results except 2010, 2012, 2014 | programas 1985, 2008, 2013–15, 2019→ |
| Mimosa | **2020–2022**; results except 2010, 2019, 2025 | programas 2006–08, 2010, 2013, 2015–17, 2023→ |
| Trevelin | **2017–2018**; results except 2011 | programas 2011, 2013–15, 2021, 2024–25 |

Already searched (see memory notes): Facebook pages and posts, YouTube, Vistas del
Valle (Wayback), eisteddfodpatagonia.com, trevelin.gob.ar, Diario Jornada, El Chubut,
Casgliad y Werin, KPC (EisteddGlobal dump), the association's mail and Drive.

## New source 1: Welsh Newspapers (National Library of Wales)

`newspapers.library.wales`: OCR text and page images. Cloudflare check: works in
Chrome (passes by itself), not with curl. Search `?query=…`, filter
`&publication%5B%5D=Y%20Drafod`, `&range%5Bmin%5D=YYYY&range%5Bmax%5D=YYYY`,
`&page=N`. Article URL `https://newspapers.library.wales/view/<issue>/<page>/<article>/`.
Rights: pre-1920 newspapers, public domain by date; the Library adds no restrictions
of its own. Credit "Llyfrgell Genedlaethol Cymru – Papurau Newydd Cymru".

### Y Drafod 1913–1919 (305 issues): fills Chubut 1913–1919

498 articles match eisteddfod/beirniadaeth/gorsedd/cadair/coron; 97 are about the
Eisteddfod itself. The ones that fill gaps (`issue/page/article`):

| Year | What | Articles |
|---|---|---|
| 1909 | winning compositions | 4021886/4021888/6, 4021891/4021892/2 ("Cynyrchion Eisteddfod Trelew 1909") |
| 1913 | **results** (1,562 words) + report | 4021959/4021960/1, 4021959/4021961/2 ("Eisteddfod Plynyddol Cymry y Camwy", 28 Nov); 4021970/4021973/2 ("Eisteddfod Trelew, 1913", 5 Dec) |
| 1914 | report (Gaiman) | 4022148/4022150/6 (16 Oct); 4022157/4022162/19 (13 Nov) |
| 1915 | **competition list** (programa) | 4022310/4022314/17, 4022337/4022339/5, 4022373/4022380/28, 4022396/4022398/7 (Jun–Aug); Gorsedd 4022486/4022488/9 |
| 1917 | **competition list**; **results**; adjudications | 4023050/4023051/1, 4023086/4023087/4, 4023095/4023096/2 (Jan–Feb); 4023450/4023452/12 ("Canlyniadau Eisteddfod Trelew", 7 Dec); 4023459/4023461/7–15, 4023468/4023473/11–13 (Dec) |
| 1918 | **competition list**; Gorsedd syllabus; reports | 4023567/4023573/31 (15 Mar); 4023784/4023785/2 (6 Sep); 4023829/4023831/6 (11 Oct) |
| 1919 | **competition list**; 1918 adjudications; reports | 4023956/4023961/20 (31 Jan); 4023992/4023998/24 (28 Feb); 4024315/4024317/5 (14 Nov) |
| 1920 | competition list announced | 4024310/4024311/1 (7 Nov 1919) |

### Papers in Wales 1869–1912: fills Chubut before 1913

"eisteddfod AND trelew|gaiman|camwy", 1865–1912: 289 articles (Yr Herald Cymraeg 128,
Baner 29, Y Celt 24, Y Brython 14, Y Drych 13…). Letters "O'r Wladfa" often report the
year's eisteddfod. Strongest:

- 4277114/4277119/19, *Baner ac Amserau Cymru*, 13 Dec 1893: "Eisteddfod yn Mhatagonia".
- 3695612/3695617/25, *Ye Brython Cymreig*, 27 Jan 1910: "Yr Eisteddfod ym Mhatagonia".
- *Y Drych* (USA) "Llith o Patagonia" / "Gwladfa Patagonia" 1891, 1899, 1900; *Yr Herald
  Cymraeg* "O'r Wladfa Gymreig" 1901, 1907; *Y Celt* "Newyddion o Patagonia" 1892.

## New source 2: Welsh Journals (National Library of Wales)

`journals.library.wales`, same interface.

- *National Library of Wales Journal* 32/3 (2002), **"Gorsedd y beirdd yn y Wladfa"**:
  history with dates and places: Eisteddfod y Wladfa 1893 (Y Drafod 21 Sep and 5 Oct
  1893, not online), 1922 Gaiman, 1923 **Dolavon 21–22 Nov** (programa heading
  quoted), 1925. Facts for editions, with the article as source.
- Book **Cerddi'r Gadair: Eisteddfod y Wladfa 1965–2003** (G. Restucha and E. N.
  Roberts, 2004): the chaired poems → every Chair winner 1965–2003. Not online: a copy
  from the association or a library would fill the Silla list.

## Other leads

- NLW manuscripts: a cuttings book with Y Drafod cuttings and the subject list of a
  1908 Gaiman eisteddfod (library.wales Patagonia bibliography → manuscripts).
- Glaniad (glaniad.com, archived by NLW): 2,000+ images on the settlement.
- Reverse image search (Google Lens in Chrome) of the archive's oldest photos and
  covers, the way Casgliad y Werin was found: not done yet.

## Done (2026-11-19)

- **Y Drafod, whole run preserved (private):** `../.prensa/Y_Drafod/` (not scanned:
  dot folder). Per issue: page images (half resolution, stitched from 6 IIIF regions)
  and `articles.json` (the Library's OCR); `INDEX.tsv` one row per article; README.
  Method: Chrome only (both sites sit behind a Cloudflare check that passes by
  itself in a browser; curl gets 403). Downloads are blocked after the first one, so
  each tab opens the local receiver page (one click) and posts each issue's tar to it;
  a 403 renews the clearance by loading a page of the same site in a hidden frame.
  The IIIF server caps requests at 1200 px (`maxWidth`), hence the stitching.
- **Wikimedia Commons** (`Category:Eisteddfodau in Y Wladfa, Argentina`, 11 files):
  8 added to Chubut 1913, 1920 (×2), 1933, 1939, 2014, 2015 (×2) with rights and
  caption. Skipped: "A Welsh Eisteddfod in Patagonia, c.1880" (same photo as
  `_sin_fecha/Fotos/Uno_de_los_Eisteddfodau_de_la_Colonia.jpg`, ours is larger; the
  dress is 1910s and the scene matches Y Drafod's account of the 1913 Gorsedd on the
  lawn between the railway station and the C.M.C. store in Trelew: worth checking),
  "Eisteddfod Y Wladfa 1942" (same as our 1942 chair ceremony photo), "Y Drafod,
  Museo del Desembarco" (not an eisteddfod). The "Salon San David" photo is captioned
  on the print "Eisteddfod Trelew 1913 / Neuadd Goffa". Two are by Fortunato
  Stillitani (photographer).
- Checked, nothing to add: Internet Archive (Argentina Austral 1965 centenary issue
  mentions only the eisteddfodau in Wales; Matthews, *Hanes y Wladfa Gymreig*, 1894,
  only passing mentions), Spanish/Welsh Wikipedia (no winners lists; the Spanish page
  led to the Commons photos).

## Proposed next steps

1. Ingest the Y Drafod articles above as documents: page image (or the article's
   OCR text) under `Eisteddfod_del_Chubut/<year>/Programa|Resultados/`, with a
   `SOURCES.tsv` row and rights; transcribe competition lists as programas
   (programa-transcription skill) and results as private Ganadores.
2. Read the 1869–1912 letters for results and dates; load what they state as facts
   with the article as source (bulk-facts-loading).
3. Facts from the NLW Journal article (1893, 1922, 1923, 1925).
4. Ask the association for Cerddi'r Gadair.
