# Mixed Welsh/Spanish pass: thresholds and machines (Task 7)

Plan: `docs/superpowers/plans/2026-11-24-gales-castellano-mezclados.md`, Task 7. Design: `docs/superpowers/specs/2026-11-24-gales-castellano-mezclados-design.md`.
Counts and times only. The maintainer's cases are kept privately, because they hold recited words.

## What ran

| Session | Stretch | KPC (Quadro P4000) | Colab (Tesla T4) |
|---|---|---|---|
| utHSvsjwvwo | 0–30 min | done, 0.50 s of work per s of audio | (pilot, PR #154) |
| keGA5Rcmgng | 0–30 min | done, 0.41 | done, about 0.29 |
| MVjm5Hj4_k4 | 0–43 min | done, 0.44 | Bangor done; turbo lost when the runtime was reclaimed |
| BC61L8txOaQ | 12:30–14:30 | — | done |

Colab reclaimed a runtime twice during this task. Each time it took the files that hadn't been downloaded yet.

## Language per Bangor line (KPC files, CLEAR 0.10)

| Session | Lines | Welsh | Spanish | Word by word |
|---|---|---|---|---|
| utHSvsjwvwo | 304 | 122 | 118 | 64 |
| keGA5Rcmgng | 299 | 180 | 56 | 63 |
| MVjm5Hj4_k4 | 297 | 78 | 120 | 99 |

**How sensitive the result is to CLEAR**, counted as lines that change side against 0.10:

| CLEAR | utHSvsjwvwo | keGA5Rcmgng | MVjm5Hj4_k4 |
|---|---|---|---|
| 0.05 | 41 | 36 | 40 |
| 0.15 | 31 | 23 | 35 |
| 0.20 | 61 | 47 | 64 |

A change in either direction moves about 10–15 % of the lines. 0.15 moves the fewest.

## The confidence floor (Ruling 11)

Bangor rows under `MIN_CY_CONF` (0.6) are removed *before* the language is decided. Some of those rows are Spanish speech, where turbo clearly wins.

| Session | Rows removed | Turbo clearly wins | Still covered by another Spanish line | Spanish with no line |
|---|---|---|---|---|
| utHSvsjwvwo | 78 | 53 | 48 | 5 rows, 30 s |
| keGA5Rcmgng | 60 | 27 | 27 | 0 |
| MVjm5Hj4_k4 | 112 | 63 | 41 | 22 rows, 139 s |

The rows removed as English (6, all on utHSvsjwvwo) were never Spanish.

**Decided (maintainer, 2026-11-24): decide first, then filter.** An unsure row keeps the Spanish turbo heard in it, and never its Welsh. The unsure rows are decided apart, so their Welsh is never joined to a sure line.
- Turbo's Spanish lines from those rows that reach the output: 50 of 52 on MVjm5Hj4_k4, 45 of 50 on utHSvsjwvwo. The rest are covered by other Spanish lines.
- The seconds in the table above overstated the loss: most of those rows are long, and turbo heard speech in only part of them.

**Also decided:** CLEAR stays at 0.10, and the full-length passes run on Colab.

## Same audio, two machines

| Session | Bangor words matched | Turbo words matched | Language per half second agrees |
|---|---|---|---|
| keGA5Rcmgng | 72 % | 69 % | 84 % (50 disagreeing stretches) |
| MVjm5Hj4_k4 | 39 % | — | — |
| utHSvsjwvwo (pilot) | 52 % | | |

- On MVjm5Hj4_k4 the gap is spread over the whole session (24–60 % per 5 minutes), not one bad stretch.
- A guess, not tested: it is the most Spanish of the sessions, and Bangor's writing over Spanish speech is its least stable output.
- Either way, the published text depends on the machine. One machine should do a video's whole pass.

## Cases

| Video | Before (#157) | After #160 | Note |
|---|---|---|---|
| utHSvsjwvwo, 10 cases | 8 | 9 | The last one, 7:34, is now offered to the model as an alternative. It can pass only after a rebuild. |
| BC61L8txOaQ, 4 new cases | 0 today | 4 with the pass | 13:05 Welsh phrase; 13:14 Spanish; 13:31–13:52 Spanish present |

#160 also adds two things:
- a line whose words repeat a decided line is dropped, even when its span is stretched;
- a different Welsh hearing is kept as an alternative for the model: 6 on utHSvsjwvwo, 30 on keGA5Rcmgng, 0 on MVjm5Hj4_k4. Checker rule 6 forbids publishing both.

## For the maintainer to listen to

| Why | Video | Times |
|---|---|---|
| Gap at the CLEAR threshold | utHSvsjwvwo | 13:57, 14:46 |
| | keGA5Rcmgng | 0:35, 26:37 |
| | MVjm5Hj4_k4 | 18:17, 19:39 |
| Spanish lost under the floor | utHSvsjwvwo | 16:31–16:46, 21:01–21:11 |
| | MVjm5Hj4_k4 | 27:44–28:10, 39:33–39:55 |

## Caution

These three videos have pass files for their first 30–43 minutes only, and `has_mezcla()` makes the whole video use the new rules. **None of them may be rebuilt** until full-length files replace the partial ones.
