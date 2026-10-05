# Claude Ideas Intake — 2026-09-30

> October 1 continuation: the second pass is integrated in [the concept development plan](2026-10-01-concept-development-plan.md) and its source-carrying dossier. The first-pass queue below is retained as historical context. Gananatha is first, but its manuscript waits for both longer drafts; Consecration waits for the named Āgama/source. No new publication date is assigned.

> Proposal-only. No posts created, no frontmatter touched, nothing deployed.
> Source of truth: vault `01-Projects/tryambakam-noesis/content/synchronocities-blog/intake/2026-09-30-claude-ideas-pass/_INDEX.md`

## What this is

A deep pass over Claude chat history for fleshed-out ideas not yet on the blog. Deduped against all 126 posts (filename plus full-text grep). Result: **5 new posts** and **1 expansion**. Everything else in the review is either already published or only a seed.

## Queue

| # | Slug | Tier (`article_mode`) | State | Blocking |
|---|---|---|---|---|
| 1 | `the-gananatha-protocol` | signal-essay | draft-ready | epistemic re-edit, voice choice |
| 2 | `the-clearing` | research-essay | developed | prune rung 6, Rank/Frankl fix |
| 3 | `the-inherited-sandbox` | signal-essay | thesis only | needs drafting + citations |
| 4 | `entrodromia-all-learning-is-remembering` | field-note | thesis only | needs short draft |
| 5 | `consecration-as-configuration` | research-essay | developed | source the ‘64-step’ claim |
| — | `the-ineffable-secrets-of-a-breathing-sprite` | expansion | developed | merge as new section |

One post per session, matching the #242 expansion cadence.

## Per-post procedure

```bash
VAULT='/Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/content/synchronocities-blog/intake/2026-09-30-claude-ideas-pass'

# 1. create the post from the note’s proposed frontmatter + drafted body, draft: true
#    src/content/posts/<slug>.md

# 2. dry-run the importer against the vault note
node --experimental-strip-types scripts/propose-processing-import.ts \
  "$VAULT/01-the-gananatha-protocol.md" --target the-gananatha-protocol

# 3. review the JSON patch, then apply
node --experimental-strip-types scripts/propose-processing-import.ts \
  "$VAULT/01-the-gananatha-protocol.md" --target the-gananatha-protocol --write

# 4. gate
npm run validate:posts
```

## Notes for the agent doing intake

- Each vault note’s frontmatter uses only the importer-mapped keys (`title, subtitle, platform, status, tags, vault_sources, kha_ba_la_mapping, quality_gates_passed, date`) plus a `vault:` block. `vault:` will show as unmapped — expected.
- `kha_ba_la_mapping` lands in `experience.framework_axes`.
- `quality_gates_passed.voice_pass` and `fact_check` are **false** on every note. Flip them only after `docs/VOICE.md` review and the note’s epistemic ledger is resolved.
- New tags will raise orphan warnings; consolidate into existing clusters per `docs/TAGS.md` rather than adding siblings.
- Each note’s ‘Epistemic ledger’ lists claims to cut or hedge. Several origin drafts contain overclaims (e.g. Schumann = alpha, heart-field 60×, ‘64 is a mathematical inevitability’) that must not reach published text.
- A merged post triggers the AI Worker reindex via CI on push. Don’t push mid-reindex (see `_PROJECT-STATUS.md`).


## Importer caveats (found by dry-run, 2026-09-30)

A dry-run against note 06 → `the-ineffable-secrets-of-a-breathing-sprite` succeeded and surfaced two behaviours of `buildProcessingImportProposal` (`scripts/lib/postMigration.ts`):

1. **`article_mode` is hard-coded to `signal-essay`** and `hero.variant` to `image` on every import. Posts proposed as `research-essay` (the-clearing, consecration-as-configuration) or `field-note` (entrodromia) will be re-tiered. The expansion target would be too. **After `--write`, restore the intended `article_mode` by hand**, or patch the importer to read `article_mode` from the source doc (small change: add it to the mapped-field set and prefer the source value).
2. **`subtitle` overwrites `hero.subtitle`.** Fixed in note 06 by removing its subtitle, so the published post keeps its own. For new posts it is intended.
