# Claude ideas → article development

Updated 2026-10-01. This is the execution plan for the second-pass Claude intake. Its deliverable is a usable development backlog and briefs; article completion has separate source and author gates. No article is approved for publication by this plan.

## Start here

Read [the development dossier](../editorial/concepts/claude-ideas-2026-09-30/README.md), [article briefs](../editorial/concepts/claude-ideas-2026-09-30/ARTICLE-BRIEFS.md), and [the registry](../editorial/concepts/claude-ideas-2026-09-30/registry.json). Full carried notes are included locally under `sources/intake/`; chat URLs are provenance only. The unavailable conversations are not reconstructed.

The author chose **Gananatha first, in grounded blog voice**, and then explicitly chose to **wait for its two longer drafts before writing the article**. Preparation proceeds; the manuscript is held. **Consecration waits for the named Āgama/source text** the author will provide. These October 1 answers govern the older handoff's suggested sequence.

## What the review changed

- The first-pass plan contained five new-post candidates and one expansion. The second pass also contains Self-Worth, the project-held concepts, six video analyses, seeds, distribution work, formats, and product residue. All have registry rows and next actions.
- L4/L3 describe how far an idea reportedly reached in chat. They do not establish that its full prose is available now. Gananatha's two long texts and Consecration's study guide are not in the local notes. Project-held `08` carries summaries, not full recovered project conversations.
- The original folder contains **11 Markdown files, 78,341 bytes**. Readiness and inventory were checked against the actual files, rather than the pasted recap alone.
- The six videos were read as **generated analysis notes**. Neither the videos nor full transcripts were reviewed. The Iron Man source filename is `iron-man-tarot-analysis-v1-0-0.md`; the name in `09` is stale.
- Gananatha's central story needed correction: Ganesha demands uninterrupted writing; Vyasa requires understanding first. The traditional account is the *Mahābhārata*, not the *Bhāgavatam* named in the initial prompt. See [Ganguli, Ādi Parva I](https://sacred-texts.com/hin/m01/m01002.htm). Publication should not assert critical-edition/interpolation history without a separate scholarly source.

## Fit with the existing editorial plan

Use the **full-repertoire 26-week calendar**, whose durable [September 30 baseline](../editorial/concepts/claude-ideas-2026-09-30/sources/calendar/baseline-calendar.md) supersedes the early six-week Living Line proposal. The `/tmp/synchronocities-blog-release-20260930` checkout is unavailable, so this run uses the installed baseline with its date retained. The existing runner reads that calendar, not `registry.json`.

The private queue has seven `scheduled` Substack rows at inspection. Recorded article dates are October 1, 8, and 15; Notes are October 6, 10, 13, and 17 at 10:00 Europe/Paris. This is a local ledger observation, not fresh platform/public readback. October 1 delivery must be reconciled separately; no row is promoted here. No new concepts replace those items or receive dates.

| Strand | New development | Reader-facing connection |
|---|---|---|
| R — Runtime and self-authorship | Gananatha; Self-Worth; prompt-engineering seed | Attention, interpretation, and the capacity to choose |
| P — Pattern laboratory | Decision Mirror; completion/methods; divination seed | Observation before explanation, revisable patterns |
| E — Type under pressure | Witness between power and meaning | Response, defense, creative will; no type diagnosis |
| G — Geometry and time | Decision Mirror; 72 geometry; Entrodromia | Traditional units, mathematical models, cyclical imagination |
| B — Body, breath, and field | Clearing; breathing-sprite expansion; raga seed | Embodiment and physiology with separate evidence |
| S — Speech, memory, and witness | Gananatha; Consecration | Comprehension, recitation, ritual, accountability |
| C — Culture and inherited script | Inherited Sandbox; completion; initiation hub | Inheritance, institutions, interpretation |
| T — 55 days: lived arc | No invented travelogue | Preserve actual dated lived source |
| N — Narrative workshop | Houdini, Captain Marvel, Iron Man, Fool/Cap | Original cultural readings after attribution and source review |

Registry strand assignments are primary routing choices; a brief may connect to another strand. The notes' proposed October dates are placeholders, not editorial commitments.

## Development order and bounded sessions

| Order | Work unit | Start condition | Concrete output |
|---|---|---|---|
| 1 | Gananatha | Both long drafts supplied and compared with note `01` | One 2,000–6,000-word signal-essay draft; resolved claim ledger |
| 2 | Clearing | Primary physiology review plus title/coda choices | One 1,500–3,500-word framework draft with bounded mechanism claims |
| 3 | Inherited Sandbox + Entrodromia | Author confirms each outline and defines Entrodromia | Anchor outline → signal essay; companion form chosen without invented experience |
| 4 | Self-Worth + witness/power/meaning | Author confirms scope and metaphor boundaries | Two distinct outline-led arguments, or a consciously merged essay |
| 5 | Decision Mirror + initiation hub | Read project documents, verify units, confirm article scope | Symbolic framework plus routing hub; no engine availability claim |
| 6 | Consecration | Named Āgama/source supplied and scope clarified | Tradition-led framework; numerical correlation retained only if warranted |
| 7 | Six video candidates | Original video/transcript and independent relevant sources reviewed | One original cultural essay at a time; current-events item remains parked |
| Separate | Breath expansion | Author selects this existing-post revision | Patch in a scratch copy; before/after prose and metadata reviewed before application |
| Separate | Downstream Mind distribution | Full essay read; remote/history overlap checked | Complete thread, Substack teaser, Medium adaptation; each independent draft |

“First” is development priority, not a reason to stop independent outlining while source text is pending. Work on one manuscript per session. L2 work may reach a substantive outline and author decision sheet now; L1/L0 gets attributed thesis options or a fold/park decision.

## Manuscript workflow

1. Select a registry ID and read its full snapshot, brief, and named blog neighbours. Resolve semantic overlap through close reading; keyword absence alone does not prove novelty. Record source hashes and the selected edition.
2. Recover missing text into a dated source note. For project summaries, obtain the in-project dump or explicit author confirmation of a new outline. Label newly developed prose separately from recovered wording.
3. Resolve the claim ledger **before** drafting the disputed bridges. Use primary traditional texts and original research for empirical statements. A note's `fact_check: false` remains false until its actual claims are checked.
4. Draft in `docs/editorial/concepts/claude-ideas-2026-09-30/manuscripts/<slug>.md` with `draft: true`, intended tier, complete body, and a private claim sheet. Keep editorial machinery outside the public prose. Do not invent author memories to satisfy a field-note register.
5. Compare against `docs/VOICE.md`: thesis-led signal essay, structural framework, lived field note, or routing hub. Restore cultural specificity and image-led transitions; do not pad a short concept to hit a quota.
6. Prepare the complete blog frontmatter in a **scratch copy**. Proposed source-note frontmatter is incomplete for some tiers; add summary, concepts, questions, correct experience enum values, existing tag clusters, and resolving related slugs.
7. Run the importer without `--write`, inspect the entire patch, and record what it would change. It merges metadata into a target; it neither creates nor fleshes out the article body. The dry-run against `06` remains a diagnostic, not an expansion.
8. Stage a reviewed local post only after metadata and draft-visibility behavior are checked. Run `npm run validate:posts`, relevant tests, and `npm run build`; inspect the rendered page locally if post/layout content changed. No CI/push/deploy/reindex belongs to this development operation.

### Importer and draft visibility

The existing importer forces `article_mode: signal-essay` and `hero.variant: image`; expansions can also lose their subtitle or source metadata. Current notes' `draft` status is not sufficient protection against a metadata patch. Review `draft`, `article_mode`, hero, tags, source bridge, and experience fields together; omit `subtitle` for expansions. A future importer fix is a separately scoped task, not necessary to prepare these briefs.

Before adding `src/content/posts/<slug>.md`, check how the **current** routes, content collection, feeds/text endpoints, and indexing select `draft: true`. A draft flag alone does not establish exclusion from static build/retrieval. Until that behavior is verified, manuscripts stay under `docs/editorial/concepts/`. Existing public post `the-ineffable-secrets-of-a-breathing-sprite` remains unchanged.

### Adaptation and publication

After a blog manuscript passes editorial review, prepare self-contained Substack/X variants. Choose a free future slot only after checking the actual calendar, existing queue, and platform overlap; this registry is a development board, not a submission queue. Use the installed calendar runner for calendar inspection and complete-packet draft intake. Run `enqueue-draft` only for completed copy with real source/media hashes, account, destination, audience and timezone-aware date.

Exact public approval covers an individual payload and destination. Publication/release authorization is distinct from preparing an article. Medium is not a supported adapter in the current runner; prepare a manual handoff. X Articles and media also retain their recorded capability holds. No automation or queue status changes are made here.

## Author inputs retained for the relevant session

Already answered: Gananatha first; grounded voice; wait for its two long drafts; named Āgama/source forthcoming. Do not re-ask these.

- Gananatha: receive both long texts, then compare title and Adamu handling; grounded voice does not itself decide that aside.
- Clearing: title register and whether a symbolic coda belongs; neither choice overrides evidence.
- Inherited Sandbox: what “asynchronous” means in the author's thesis; ancestry as enrichment rather than deterministic inheritance.
- Entrodromia: the author's definition, omniscience versus omnipotence, and whether this is contemplation or lived observation.
- Self-Worth and witness/power/meaning: one coupled essay or two; retain dignity independent of wealth.
- Decision Mirror and initiation: confirm interpretive scope and current canonical project documents; no inferred biological output.
- Project-held material: the WitnessOS, Tryambakam, TWC, and Phasion in-project passes remain missing. Their absence blocks recovery claims, not the rest of this backlog.
- Seeds: the author's intended meanings of profane/profound, raga, and Going Under; suggested meanings stay suggestions.

Collect these decisions when the corresponding concept is selected; there is no repeated questionnaire during this integration.

## Acceptance of this integration

The source-manifest hashes match the carried content; every registry row has a state and next action; the briefs develop real argument arcs; source gaps and author holds are explicit; current editorial planning links here; old work and the private queue remain preserved. Evidence is in [VERIFICATION.md](../editorial/concepts/claude-ideas-2026-09-30/VERIFICATION.md). Root `ISA.md` owns the acceptance criteria. Completing this integration does not complete the manuscripts.
