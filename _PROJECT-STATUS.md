# synchronocities-blog — Project Status

> Manually verified 2026-09-12 by a deep infra pass (Cloudflare account, live HTTP probes,
> DNS, Vercel account). Supersedes the 2026-07-28 auto-generated snapshot — do not
> regenerate over this without re-running the checks in `docs/INFRA.md`.

## 🔗 Links

- **Agent context:** [`AGENTS.md`](AGENTS.md)
- **Infrastructure map:** [`docs/INFRA.md`](docs/INFRA.md)
- **Live site:** https://synchronocities.tryambakam.space
- **Live AI worker:** https://synchronocities-ai.tryambakam.space
- **GitHub repo (referenced, not connected):** https://github.com/Sheshiyer/synchronocities-blog

## 📍 Where the project is at (git state)

- **Branch:** `main`
- **History:** one empty `2081568 Initial commit` — **0 tracked files, 21 untracked
  top-level entries.** The working tree has never been committed.
- **Remote:** **none configured.** All three GitHub Actions workflows are therefore inert.
- **Package:** `synchronocities-blog` (node, engines `>=22.12.0`)

## 🚦 Deployment truth

| Unit | Where | State |
|---|---|---|
| `synchronocities-site` (Astro) | Workers Static Assets, zone `tryambakam.space` | ✅ live at synchronocities.tryambakam.space — deployed 2026-09-12, **by hand** (no workflow) |
| `synchronocities-ai` Worker | Cloudflare acct `9d9d23b2…c0f10` | ✅ live at synchronocities-ai.tryambakam.space + `*.workers.dev`; redeployed 2026-09-12 (picked up the Jul 23 → Aug 7 delta) |
| Vectorize `synchronocities-corpus` | Cloudflare | 1024-d cosine, 28,290 vectors, last mutation 2026-07-22 — **orphaned** (see blockers) |
| R2 `synchronocities-artifacts` | Cloudflare | live; serves the cached cluster artifact |
| KV `SYNCHRONOCITIES_CACHE` | Cloudflare | live (`5e7bd812…aa88`) |

## 🟢 Recently resolved (2026-09-12)

1. **Embedding model EOL** — `nv-embedqa-e5-v5` retired 2026-08-25. Embeddings moved to
   Nebius (`Qwen3-Embedding-8B` @ 1024-d). `/search` and `/chat` restored.
2. **Rerank model unreachable** — `nemotron-mini-4b-instruct` gone; rerank was failing
   open. Moved to Nebius `Qwen3-30B-A3B-Instruct-2507`.
3. **Git detached from origin** — the local repo had been re-initialized with an empty
   commit and no remote. Reattached to the real 294-commit history and pushed. CI itself
   was never broken.
4. **Vault chunks leaking into blog surfaces** — `source_type` metadata index + filters
   on `/related` and `/maps`.
5. **Site had no deploy pipeline**, and the Worker's CI gate silently skipped real
   deploys. Both fixed.

## 🟠 In flight

- **Vault reindex** (~28,290 chunks, ~6h at ~1.4/sec) — `workers/.vault-reindex-v5.log`.
  Idempotent and resumable. Until it finishes, `/search` and `/chat` mix fresh blog
  vectors with stale vault ones.

## ✅ Suggested next actions

- [x] ~~Stand up a host for the Astro build and point DNS at it~~ — done 2026-09-12 (Workers Static Assets + custom domain)
- [x] ~~Deploy the 2026-07-23 → 2026-08-07 Worker delta~~ — done 2026-09-12
- [ ] Commit the working tree and attach a git remote, then push (unblocks CI + the daily model probe)
- [ ] Choose a ≤1536-d embedding model (or a new index at the replacement's native width) and reindex
- [ ] Add `src/pages/404.astro`, then flip `not_found_handling` to `"404-page"`
- [ ] Decide the Cloudflare Managed robots.txt question (it blocks the AI crawlers `llms.txt` targets)
- [ ] Add a deploy workflow for `synchronocities-site`
- [ ] Filter `/related` and `/maps` by `source_type` so vault chunks stop leaking into blog surfaces

## 🧠 Agent context

`AGENTS.md` exists at the repo root. `.cursor/rules/codegraph.mdc` configures CodeGraph MCP
for structural search.

## ♻️ PAI workflow state

No PAI artifacts (`.prd/`, `.planning/`, `MEMORY/WORK/`). The last closed task loop is
recorded in `tasks/todo.md` (`/journeys` travelogue reprioritization).
