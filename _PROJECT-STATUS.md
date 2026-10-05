# synchronocities-blog — Project Status

> Updated 2026-09-12 after reconciling GitHub issues, historical plans, and the
> live tree at `5986f6e`. Full infra evidence: [`docs/INFRA.md`](docs/INFRA.md).
> Live execution queue: [`docs/plans/2026-09-12-pending-work.md`](docs/plans/2026-09-12-pending-work.md).

## Links

- **Agent context:** [`AGENTS.md`](AGENTS.md)
- **Infrastructure map:** [`docs/INFRA.md`](docs/INFRA.md)
- **Live site:** https://synchronocities.tryambakam.space
- **Live AI worker:** https://synchronocities-ai.tryambakam.space
- **GitHub:** https://github.com/Sheshiyer/synchronocities-blog

## Git state

- **Branch:** `main` @ `5986f6e`, tracking `origin/main`, working tree clean.
- **Remote:** `origin` → `https://github.com/Sheshiyer/synchronocities-blog.git`
- **CI:** four workflows. Daily probe and weekly audit have been running on the remote all along.

## Deployment truth

| Unit | Where | State |
|---|---|---|
| `synchronocities-site` (Astro) | Workers Static Assets, zone `tryambakam.space` | live at synchronocities.tryambakam.space; workflow `synchronocities-site-deploy.yml` |
| `synchronocities-ai` Worker | Cloudflare acct `9d9d23b2…c0f10` | live at synchronocities-ai.tryambakam.space + `*.workers.dev` |
| Vectorize `synchronocities-corpus` | Cloudflare | 1024-d cosine; blog reindexed on Qwen3 (v5); vault reindex still running |
| R2 `synchronocities-artifacts` | Cloudflare | live; `clusters-v5.json` is blog-scoped (126 posts, k=12) |
| KV `SYNCHRONOCITIES_CACHE` | Cloudflare | live (`5e7bd812…aa88`) |

## Recently resolved (2026-09-12)

1. Embeddings and rerank moved off dead NIM models onto Nebius. `/search` and `/chat` restored.
2. Local git reattached to the real remote history and pushed. CI was never actually broken.
3. `source_type` filters on `/related` and `/maps`; cluster artifact rebuilt blog-only.
4. Site deploy workflow added; AI Worker change-detection fixed to diff the whole push range.

## In flight

- **Vault reindex v5** — `workers/.vault-reindex-v5.log`. `02-Areas` finished (2,876 emitted, 0 errors); `03-Resources` in progress (~3,692 chunks embedded when last read). Until it finishes, unfiltered `/search` and `/chat` mix fresh blog vectors with stale vault ones.

## Live queue (see the 2026-09-12 plan)

1. Let the vault reindex finish. Do not start a second one.
2. ~~GitHub hygiene~~ — done 2026-09-12. Milestone [#5](https://github.com/Sheshiyer/synchronocities-blog/milestone/5), 34 open issues all on it; 14 false-closed expansions reopened; #201–#210 closed as duplicates.
3. Expansion tooling #243 / #245 before the next auto-expand loop.
4. `404.astro` + `not_found_handling: "404-page"`.
5. Decide Cloudflare Managed robots.txt vs `llms.txt`.
6. Voice review of the 12 Qwen3 Drift posts.
7. Remaining 4× expansions (epic #242), one post per session, via `/expand/v2`.
8. Optional: move `tryambakam.com` nameservers to Cloudflare.

## What is *not* pending

- Non-card article engine, Downstream Mind pilot, `/start.txt` / `llms*` surfaces — shipped (milestone #4 closed).
- `/journeys` travelogue-only cleanup — shipped (`tasks/todo.md`).
- Historical March–May plans in `docs/plans/` — history, not the board.
- `_processing/the-body-is-the-first-country-*` — staging residue; the post is already published. The leftover v2.4 patch does not apply cleanly.

## GitHub snapshot (2026-09-12, after hygiene)

- Open issues: **34**, all on milestone [#5 Corpus + edge leftovers](https://github.com/Sheshiyer/synchronocities-blog/milestone/5). Open PRs: **0**.
- Epic still open: [#242](https://github.com/Sheshiyer/synchronocities-blog/issues/242) (annotated).
- Draft intake leftovers #201–#210: **closed as duplicate**.
- 14 expansions previously closed without meeting word targets: **reopened**.
