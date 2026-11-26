export const meta = {
  name: 'asset-intake',
  description: 'Read new archive assets (documents or videos), extract candidate facts with roles and sources, cross-check each, dedupe against approved facts and draft closed questions. Read-only.',
  whenToUse: 'After filing new assets (programa del día, locutores script, programa, resultados, press, ceremony cards, videos). Skill: .claude/skills/asset-intake',
  phases: [
    { title: 'Extract', detail: 'one reader per asset' },
    { title: 'Verify', detail: 'one skeptic per candidate: second source, role, spelling' },
    { title: 'Merge', detail: 'dedupe against approved facts, closed questions, draft batch' },
    { title: 'Critic', detail: 'what was not read, what to run next' },
  ],
}

// args: {items: [{kind: 'document'|'video', id, note?}], note?, repo?, visual?}
const A = args || {}
const items = A.items || []
if (!items.length) return { error: 'args.items is empty: pass [{kind: "document"|"video", id: "<catalog id or YouTube id>"}]' }
const REPO = A.repo || 'the current working directory (the amgueddfa repo or a worktree of it)'
const VIS = A.visual || '../.visual (beside the repo)'

const RULES = `You are READ-ONLY: no edits, commits, pushes, uploads, DB writes or messages; never read or print .env.
Repo: ${REPO}. Private picture store: ${VIS}/<video id>/ (ocr.json, vlm.4bit.jsonl). Skill to follow: .claude/skills/asset-intake/SKILL.md and reference.md (read both first).
Rules: names come from text, never from faces; a heard name is a candidate and its spelling needs a text source; keep the role exact (session host = presentadores; presider "presidir/designación del presidente de la sesión" = other; ceremony conductor "Conduce:"/hand-over next to ceremonia, Círculo, Gorsedd = other; juror; choir director); never copy lyrics, prayers, anthems or scripted text into any output (quotes under 15 words, names and roles only); minors (Juventud, Mimosa, children's categories) are flagged, not extracted for loading.`

const CAND = {
  type: 'object',
  properties: {
    asset: { type: 'string', description: 'festival, year, title, kind as read' },
    candidates: { type: 'array', items: { type: 'object', properties: {
      festival: { type: 'string' }, year: { type: 'integer' },
      field: { type: 'string', enum: ['start_date', 'end_date', 'venue', 'presentadores', 'ganador_silla', 'ganador_corona', 'edicion_realizada', 'competencia', 'other'] },
      value: { type: 'string', description: 'as it would be loaded, in Spanish, role first for other ("Presidió la primera sesión: X.")' },
      role_verb: { type: 'string', description: 'the exact wording that gives the role' },
      source_kind: { type: 'string', enum: ['document', 'ocr', 'vlm', 'speech', 'press'] },
      fuente: { type: 'string', description: 'max 200 chars, in the skill format (video link with &t=, or https://amgueddfa.org/item/<id>/)' },
      evidence: { type: 'string', description: 'exact place (file + line/t/page) and a quote under 15 words' },
      minor: { type: 'boolean' },
    }, required: ['festival', 'year', 'field', 'value', 'role_verb', 'source_kind', 'fuente', 'evidence'] } },
    gaps: { type: 'array', items: { type: 'string' }, description: 'what could not be read or needs a run first (no OCR yet, no ../.visual data, pages missing)' },
    findings: { type: 'array', items: { type: 'string' }, description: 'bugs or data problems seen on the way (wrong year/festival, missing transcription)' },
  },
  required: ['asset', 'candidates', 'gaps', 'findings'],
}

const VERD = {
  type: 'object',
  properties: {
    keep: { type: 'boolean' },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
    second_source: { type: 'string', description: 'an independent source that agrees (file/t/url), or empty' },
    role_ok: { type: 'boolean' },
    corrected_value: { type: 'string', description: 'the value with role/spelling fixed, or empty if unchanged' },
    reason: { type: 'string' },
  },
  required: ['keep', 'confidence', 'second_source', 'role_ok', 'corrected_value', 'reason'],
}

function extractPrompt(it) {
  const route = it.kind === 'video'
    ? `VIDEO ${it.id}. Find its festival/year/title in src/data/videos.json. Read public/transcripciones-video/${it.id}.json (speech: role phrases from reference.md § Roles) and, if present, ${VIS}/${it.id}/vlm.4bit.jsonl TEXT lines and ${VIS}/${it.id}/ocr.json (on-screen banners, ceremony cards, captions). For screen text, note whether Tesseract at the same t agrees. Times as h:mm:ss with a https://www.youtube.com/watch?v=${it.id}&t=<s>s link.`
    : `DOCUMENT ${it.id}. Find it in src/data/catalog.json (src_path, kind, category, festival, year). Read its text: src/data/transcripciones/${it.id}.md if it exists; otherwise the source file under the archive root (parent of the repo) at src_path (.doc/.docx/web via _html_text in scripts/catalog/derive.py, PDFs via pdftotext -layout, images: tesseract into a temp file outside the repo), or src/data/ocr/${it.id}.json. Fuente: "<title> <year> (archivo): https://amgueddfa.org/item/${it.id}/".`
  return `${RULES}\n\nExtract every candidate fact this asset gives. Priority: session presenters (a programa del día's credits block "Locución:" in its SOURCE file, since transcriptions leave people out), presiders, ceremony conductors and Bardic Circle officers, jurors, prize sponsors/makers/donors, dates and venue, winners missing from Ganadores. Prayer leaders, anthem directors, accompanists and opening acts: one collapsed low-priority row per edition at most. Also open SIBLING items of the same edition and category (src/data/catalog.json) when this asset points to them (a locutores script never names the locutores). ${route}\n${it.note ? 'Maintainer note: ' + it.note : ''}${A.note ? '\nBatch note: ' + A.note : ''}`
}

phase('Extract')
const perItem = await pipeline(
  items,
  it => agent(extractPrompt(it), { label: `read:${it.kind}:${it.id}`, phase: 'Extract', schema: CAND }),
  (res, it) => res && parallel(res.candidates.map((c, k) => () =>
    agent(`${RULES}\n\nSkeptic. Try to REFUTE this candidate. Re-open the evidence yourself. Then look for an INDEPENDENT second source in the repo: approved facts (data/approved/contributions.json), the edition's transcriptions (src/data/transcripciones, src/data/ganadores), other videos' transcripts and ${VIS}/*/ocr.json (another recording of the same ceremony), Tesseract at the same t for vision-model text. Check the role against reference.md § Roles and the spelling against text sources. alta = two independent texts agree (or text + speech); media = one text; baja = speech or vision model only. keep=false if the evidence does not say it.\n\nCandidate: ${JSON.stringify(c)}`,
      { label: `verify:${it.id}:${k}`, phase: 'Verify', schema: VERD })
      .then(v => ({ ...c, verdict: v, asset_id: it.id }))))
    .then(vs => ({ asset: res.asset, id: it.id, kind: it.kind, gaps: res.gaps, findings: res.findings, candidates: vs.filter(Boolean) })),
)
const done = perItem.filter(Boolean)
const kept = done.flatMap(d => d.candidates.filter(c => c.verdict && c.verdict.keep))
log(`${kept.length} candidates kept of ${done.reduce((n, d) => n + d.candidates.length, 0)} from ${done.length}/${items.length} assets`)

phase('Merge')
const MERGE = {
  type: 'object',
  properties: {
    table: { type: 'array', items: { type: 'object', properties: {
      edition: { type: 'string' }, field: { type: 'string' }, value: { type: 'string' }, role_verb: { type: 'string' },
      fuente: { type: 'string' }, second_source: { type: 'string' }, confidence: { type: 'string' },
      status: { type: 'string', enum: ['new', 'already_loaded', 'conflicts', 'merge_with_other_row'] }, note: { type: 'string' },
    }, required: ['edition', 'field', 'value', 'fuente', 'confidence', 'status'] } },
    questions: { type: 'array', items: { type: 'object', properties: {
      question: { type: 'string' }, header: { type: 'string', description: 'max 12 chars' },
      options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'description'] } },
    }, required: ['question', 'header', 'options'] }, description: 'closed questions, 2-4 options each, most important first' },
    batch_draft: { type: 'array', items: { type: 'object', properties: {
      festival: { type: 'string' }, years: { type: 'object', description: '{"<year>": [[field, value, fuente], ...]} for rows that would load if every answer is yes' },
    }, required: ['festival', 'years'] } },
  },
  required: ['table', 'questions', 'batch_draft'],
}
const merged = kept.length ? await agent(`${RULES}\n\nMerge these verified candidates into one table. Dedupe against the approved facts in data/approved/contributions.json (status already_loaded: same edition+field+meaning; conflicts: contradicts a loaded fact -> becomes a question, never an edit; reuse existing spellings of venues and names). Merge duplicates across assets (keep the best fuente, list the other as second_source). Apply app-data-update interpretation rules (winner without silla/corona -> other "Ganador: X."; a winner or venue for an edition without edicion_realizada -> add it). Then write closed questions for the maintainer (role, spelling, field, load or not; the #29 question when minor=true) and a batch draft in the db.py facts format with per-row fuente.\n\nCANDIDATES: ${JSON.stringify(kept)}`,
  { label: 'merge', phase: 'Merge', schema: MERGE }) : { table: [], questions: [], batch_draft: [] }

phase('Critic')
const critic = await agent(`${RULES}\n\nCompleteness critic for this intake. Assets: ${JSON.stringify(items)}. Gaps the readers reported: ${JSON.stringify(done.map(d => ({ id: d.id, gaps: d.gaps })))}. Rows produced: ${merged.table.length}. Which asset was not fully read, which step must run first (programa transcription, frames/OCR, vision chunk, export_videos), which role or source angle was missed (e.g. another recording of the same ceremony, press for that year)? Return a short numbered list of next actions, cheapest first.`,
  { label: 'critic', phase: 'Critic' })

return {
  table: merged.table, questions: merged.questions, batch_draft: merged.batch_draft,
  dropped: done.flatMap(d => d.candidates.filter(c => !c.verdict || !c.verdict.keep).map(c => ({ id: c.asset_id, value: c.value, why: c.verdict ? c.verdict.reason : 'no verdict' }))),
  findings: done.flatMap(d => d.findings.map(f => `${d.id}: ${f}`)),
  gaps: done.flatMap(d => d.gaps.map(g => `${d.id}: ${g}`)),
  next: critic,
  missing_assets: items.filter(it => !done.find(d => d.id === it.id)).map(it => it.id),
}
