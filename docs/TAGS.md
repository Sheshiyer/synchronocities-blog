# Tag Taxonomy

The Synchronocities corpus uses a flat tag set with one structural overlay: `cluster:*` prefix tags that establish faceted-browsing axes. Specific topical tags coexist beneath the clusters as siblings, not children.

## The 7 Clusters

| Cluster | Domain |
|---|---|
| `cluster:consciousness` | Consciousness-as-architecture program — bioelectric systems, runtime models, debugging protocols, neural-architecture metaphors, qualia, valence, witness-OS work |
| `cluster:lorenz-kundli` | Chaos × Vedic astrology — Lorenz attractors, Markov chains, cellular automata, hypercube/Ashtakavarga, Fibonacci/Nakshatra, tensor/Shadbala, neural-network/Bhava studies |
| `cluster:enneagram` | Enneagram × endocrine × muse — typology, hormonal architecture, Human Design overlays, breath/state protocols |
| `cluster:tarot` | Major Arcana journal — tarot-anchored field notes and symbolic essays |
| `cluster:travelogue` | Lived field-movement record — location-anchored entries (Bangkok, Chiang Mai, Samui, Pai, Phangan, Shenzhen, etc.) |
| `cluster:sonic` | Sonic infrastructure — akshara, mantra, sanskrit phonetics, kha-ba-la, nadi, varna/sphota work |
| `cluster:geometry` | Sacred geometry — symmetry, wallpaper groups, sri yantra, meru prastara, hyperbolic tilings, fibonacci, hypercube |

A post can belong to **multiple clusters** when it spans domains. For example:
- *Spell-Work Reservoir* → `cluster:sonic + cluster:geometry + cluster:consciousness`
- *Sri Yantra and the Geometry That Doesn't Fit* → same triple
- *The Word as Code* → `cluster:lorenz-kundli + cluster:sonic + cluster:consciousness`
- A Bangkok tarot field-note → `cluster:tarot + cluster:travelogue`

## Tag Conventions

### Tarot card tags (Major Arcana)

Canonical form: **`tarot-NN-name`** where `NN` is the 2-digit Major Arcana number (00–21) and `name` matches the Thoth-deck convention (`fool`, `magus`, `priestess`, `empress`, `emperor`, `hierophant`, `lovers`, `chariot`, `adjustment`, `hermit`, `fortune`, `lust`, `hanged-man`, `death`, `art`, `devil`, `tower`, `star`, `moon`, `sun`, `aeon`, `universe`).

Why Thoth: matches `src/lib/tarot.ts`'s `thothName` field and the existing `/cards/tarot-NN-name.webp` asset paths.

Examples:
- `tarot-00-fool` (was `fool` / `the-fool`)
- `tarot-14-art` (was `art` / `temperance`)
- `tarot-20-aeon` (was `aeon` / `judgement`)
- `tarot-21-universe` (was `universe` / `world` / `the-world`)

### Cluster tags

Always lowercase, singular, prefix `cluster:`. Add via `scripts/apply-cluster-tags.ts` which reads each post's existing tag fingerprint and applies clusters by trigger-pattern match. Idempotent — re-running won't duplicate.

### Specific topical tags

Free-form, lowercase, hyphenated. Examples: `runtime`, `debugging`, `bioelectric`, `bangkok`, `chiang-mai`, `pingala`, `wallpaper-groups`.

Avoid:
- Single-occurrence orphans (consider whether the orphan should be merged into a cluster or genuinely earns its own keyword)
- Mixed singular/plural (`pattern` vs `patterns` — pick one consistently per concept)
- Tarot-card aliases not in canonical form (use `tarot-NN-name`)

### `concepts` field (separate from tags)

Title-cased phrases for thesaurus / LLM canonical references. Used by hub posts. Example: `concepts: ["consciousness architecture", "bioelectric systems", "information processing"]`.

Rule: if a phrase appears in `concepts` AND in `tags`, prefer keeping it in `concepts` only. Tags are for filtering; concepts are for semantic retrieval.

## Validation

`npm run validate:posts` runs cross-document validators in `scripts/lib/postMigration.ts`:

- `validateDocument` — per-post schema (article-mode, entry-kind, concepts, llm.cluster)
- `validateRelatedPostsRefs` — flags `related_posts` slugs that don't resolve
- `validateSeriesCoherence` — flags `series` values with fewer than 2 posts
- `validateTagCoverage` — flags posts with empty tags + tags used on only 1 post (orphan candidates)

Validators warn but don't block the build for legacy contract issues; only schema-level violations are errors.

## Cluster application script

`scripts/apply-cluster-tags.ts` is idempotent — safe to re-run. Trigger-pattern table is in the script. Add a new cluster by:
1. Adding the rule to `CLUSTERS` array
2. Re-running the script
3. Updating this doc

## History

- 2026-05-01 — first pass. 93 posts received cluster tags. Tarot tag standardization applied across 15 posts ([d26b125](https://github.com/Sheshiyer/synchronocities-blog/commit/d26b125)).
- Earlier — `series` field stripped from 4 single-post orphans; bidirectional `related_posts` back-refs added between hubs and their cited essays.
