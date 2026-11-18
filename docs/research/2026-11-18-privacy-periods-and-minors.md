# How long content stays private, and what to do about children

Research notes, 2026-11-18. **Nothing here is implemented.** It gathers what is
needed to decide later. Not legal advice: for certainty, ask a lawyer in Chubut
and the associations that published the material.

## Where we stopped

- Planned feature (not built): link videos and photos to the competition they
  show, inside the transcribed programa, with in-site playback. The key is
  festival + year + competition number (`[CH2012006]` = Chubut 2012, comp. 6);
  12 of 12 spot checks matched. Design approach A (build-time links + a
  hand-approved list for uncoded ceremony videos).
- On hold: making results lists admin-only for every festival (today Chubut
  and Trevelin are public, Mimosa and Juventud admin-only), and whether a
  rolling period should open them later. This document is the input for that.

## What the archive holds today

| Content | Years | Shown now | Children? |
|---|---|---|---|
| Results lists, Chubut | 2006–2014 (10 docs) | public | some youth categories |
| Results lists, Trevelin | 2011 (1) | public | some youth categories |
| Results lists, Juventud | 2010–2014 (8) | admin only | yes, all |
| Results lists, Mimosa | 2010–2025 (6) | admin only | yes, all |
| Videos, Juventud | 348, nearly all 2010–2026 | **public** (thumbnail + YouTube link) | yes |
| Videos, Mimosa | 201, nearly all 2010–2026 | **public** | yes |
| Videos, Chubut / Trevelin | 1332 / 191 | public | some |
| Silla / Corona winners (facts) | 1937 onward | public | no (adult honours) |

Every results list falls inside the last 20 years, so "20-year rule" and
"everything private" give the same result today. The larger exposure of
children is the 549 youth-festival videos, not the lists.

## The legal frame (Argentina)

- **Ley 26.061, art. 22 (dignity of children):** forbids spreading data or
  images that identify a child against their will (or their parents'), when it
  harms their dignity or reputation. Courts apply it to photos and TV images of
  minors. This is the strongest constraint, and it does not expire with time
  in the text: it protects the person while a child; afterwards the adult's
  own image rights apply.
- **Código Civil y Comercial, art. 53 (image and voice):** capturing or
  reproducing someone's image or voice needs consent, except, among others,
  participation in public acts, or cultural/scientific purposes without harm.
  An eisteddfod stage is a public act, but courts decide this case by case.
  For people who died, heirs consent; **20 years after death, non-offensive
  reproduction is free.**
- **Ley 25.326 (personal data), art. 5.2.a:** no consent needed for data
  taken from sources of unrestricted public access. Printed results in
  programas and newspapers can count; that argues against secrecy for adults.
- **CSJN, Denegri c/ Google (28-06-2022):** the Supreme Court rejected a
  "right to be forgotten" based on the passing of time alone: information that
  was part of public debate does not lose that character just because time
  went by, or history and social memory would be at risk. It supports
  keeping old public results public. It concerned an adult's voluntary public
  role, not children.
- **Open question:** if the site's operator lives in the EU or UK, GDPR / UK
  GDPR may apply too (with its exemption for archiving in the public
  interest, art. 89). To check.

## What archives and festivals do

- **UK National Archives:** a "100-year" closure is a lifetime assumption, not
  a rule. Adults of unknown age are assumed at least 16, so 84 years is often
  used; 100 years stays relevant for **sensitive** data about children.
  Local archives: children's records 75–100 years. These are for sensitive
  records (care, health, adoption); a results list is not sensitive data, so
  these are an upper bound, not a guide.
- **Other eisteddfodau:** Sydney publishes entrants' full names and suburbs in
  programmes and on its website, but uses **first names only for children's
  photos on social media**. Gold Coast treats entering as consent to publish
  results. Jersey relies on parental consent for minors. The Urdd warns that
  events are photographed and filmed and uses them publicly; I found no Urdd
  rule on children's names in results.

## Periods to choose from

What sets the period is when the youngest person named stops being a child,
plus a margin so the adult can object first. Youngest competitors are about
4 years old.

| Option | Children's festivals (Juventud, Mimosa) | Adult festivals (Chubut, Trevelin) |
|---|---|---|
| Minimum | edition + 14 (youngest turns 18) | public now (published at the time) |
| **Recommended** | **edition + 30** | **edition + 20** |
| Archive-style | edition + 75 to 100 | edition + 84 |

Recommended, by content type:

1. **Results lists, children's festivals:** admin-only until edition + 30.
2. **Results lists, adult festivals:** admin-only until edition + 20 (or
   public now: they were printed publicly, and Denegri favours that).
3. **Silla / Corona winners:** public, any age.
4. **Videos of children (Juventud, Mimosa, youth categories):** they are not
   ours; we show a thumbnail and the uploader's public link. Keep them, but
   for recent ones (under edition + 30): add no names of our own (titles come
   from YouTube as they are), never join them to results lists, and act on
   "Informar" removal requests quickly. If the uploader removes a video, it
   stops playing on its own. In-site playback should use the no-cookie
   player, loaded only on click; it shows no comments.
5. **Photos of identifiable children in the catalog:** restricted unless
   there is consent (art. 53) or they are older than edition + 30.
6. **Programas and the links between programa and video:** public; a
   programa names competitions, not children.

## How it would be built (later)

- One rule in one place: `privateUntil(festival, kind, year)` in `src/lib`,
  checked at build, so a list opens by itself the year it passes its period.
  The same rule in Python for the catalog side.
- Supabase: `transcriptions.public` already exists, with admin-only reads.
  The constraint `transcriptions_private_winners` would change from a
  per-festival rule to the per-year rule (or the flag is set by the build).
- `PUBLIC_WINNERS` in `src/lib/ganadores.ts` becomes the period rule.
- The public GitHub repository keeps old copies of the Chubut and Trevelin
  results in its history; removing them is a separate decision.

## Still to decide

1. The periods (30 / 20 recommended above).
2. Whether the operator is in the EU or UK (GDPR).
3. Whether to ask the associations for their stance, especially Juventud
   and Mimosa, and whether their channels upload the youth videos.
4. Whether the youth videos already on the site get the same period
   (hidden until edition + 30), or stay as uploader-published links.

## Sources

- Ley 26.061, text: https://salud.neuquen.gob.ar/wp-content/uploads/2024/07/Ley-26061-Proteccion-Integral-de-los-Derechos-de-NNYA.pdf
- Minors' image case law: https://beccarvarela.com/novedades/jurisprudencia-derecho-a-la-imagen-menores-ausencia-de-relevancia-publica-en-la-difusion/
- Children's privacy good-practice guide (Ministerio Público Tutelar, 2024): https://mptutelar.gob.ar/sites/default/files/2024-MPT-Guia-buenas-practicas-derecho-intimidad.pdf
- CCyC art. 53 commentary: https://aldiaargentina.microjuris.com/2022/02/25/doctrina-derecho-a-la-imagen-personal-comentario-a-un-fallo-esclarecedor/
- 20 years after death (Olmedo case): https://aldiaargentina.microjuris.com/2020/12/21/fallos-capitan-piluso-a-mas-de-20-anos-del-fallecimiento-de-olmedo-ypf-puede-utilizar-su-retrato-sin-consentimiento-de-los-herederos/amp/
- Ley 25.326, official text: https://www.argentina.gob.ar/normativa/nacional/64790/texto
- Denegri c/ Google: https://www.palabrasdelderecho.com.ar/articulo/3750/La-Corte-Suprema-fallo-en-contra-de-Natalia-Denegri-en-el-caso-Google-por-el-derecho-al-olvido
- UK National Archives, lifetime closure: https://nationalarchives.gov.uk/about/freedom-of-information/information-requests/life-expectancy-closure-period-policy/
- Devon Archives periods: https://swheritage.org.uk/devon-archives/?p=404
- Sydney Eisteddfod media policy: https://sydneyeisteddfod.com.au/wp-content/uploads/2023/02/MediaPhotogPolicy.pdf
- Gold Coast Eisteddfod privacy: https://www.goldcoasteisteddfod.com.au/privacy-policy-2026
- Urdd photography policy: https://www.urdd.cymru/files/4316/3214/4043/Ffurflen_cofrestru_a_polisi_ffotograffiaeth_-_Urdd.pdf
- YouTube on minors: https://blog.youtube/news-and-events/an-update-on-our-efforts-to-protect/
