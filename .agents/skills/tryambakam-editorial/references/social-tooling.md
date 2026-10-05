# Social tooling capability receipt — 2026-09-30

## Verified source and runtime

| Tool | Source | Actual role | Current acceptance |
|---|---|---|---|
| Arcplume | Sheshiyer/arcplume at d298ff109b64aac052039dc34438589294d9c6c9 | Grok Build OAuth session and image generation; video separately uses API mode | Current SKILL and scripts supersede stale README's bird/cookie contract. Not an X publishing adapter. |
| Bird | Installed 0.8.0, d3dd4a0d | X whoami, account timeline/search/read/thread, tweet and reply commands | Commands exist. Both direct and protected-env identity probes failed; no authenticated identity or write acceptance claimed. |
| Glam | Sheshiyer/glam-cli at 0566a0244b54f76218a6ac0f20e75210d0235d3c; installed 0.3.0 | Instagram profiles, saved posts, stories, highlights, post downloads | whoami returned witnessalchemist but preceding GraphQL 403 retries make access degraded. No upload, publish or comment command. |
| Reddit Flux | Sheshiyer/reddit-flux at 592403d5ec4837a1c95dac483d836c193cd1d19a | Public subreddit/search/thread reads; OAuth user posts/replies | reddit-cli absent PATH; source exists upstream. Runtime auth and posting not verified. |
| Field Theory | Installed 1.3.22 | Bookmark corpus and source-backed account candidates | 465 cached bookmarks last updated September 29; not a live timeline. Its OAuth token path is absent. |

## Authentication evidence

Existing protected local credential sources were inspected for field presence only. A bounded Bird identity call loaded the existing AUTH_TOKEN and CT0 into subprocess memory, never arguments or files. It returned exit 1: `Could not parse settings page for user info`. This does not establish whether cookies are stale or Bird's parser is incompatible. Do not refresh credentials, repeatedly sync bookmarks, or exercise posting to diagnose it. Expected brand X handle remains witnessalchemst until independent identity confirmation. Instagram witnessalchemist does not establish X identity.

## Editorial integration contract

Use Bird for X account discovery after identity succeeds. Each public post/reply still passes the installed editorial queue's exact-payload approval, claim, single submission, and readback receipt. A create timeout means reconcile, never retry automatically. X Articles require independent entitlement/composer validation. Glam supplies visual research and downloads only. Reddit public reads can broaden research after a verified local CLI is located or installed through a separate concrete setup; OAuth writes still require expected-account verification and per-item approval. No DMs, mass engagement, or public writes as health checks.

X tests short ideas first; selected signals inform Substack expansion. Preserve the current nine-series calendar and publication frequency. Listen across all seven Aleph offering families, distinguishing brand intent from availability. Never infer an author's X handle from a Substack display name.

## Maintenance follow-up

Codex thread heartbeat `social-cli-maintenance-and-upgrades` is active weekly Sunday 10:00 Europe/Paris. Inspect current releases/commits, command surfaces, auth failures and compatibility. Preserve dirty source and private credentials; isolate upgrade preparation, run focused tests, provide backup/rollback. Notify for meaningful changes, failures, reviewable upgrades or user action only. No automated login, permission expansion, public posting, release/push/deploy, or replacement of installed runtime without approval of the exact upgrade.

## Remaining acceptance

Bird account identity and timeline readback; bounded deduplicated listener local tests; real relevant account watchlist; Reddit local runtime discovery/setup; individually approved publisher end-to-end readback; X Articles. No live listener or publisher acceptance is implied by the maintenance job.

Sources: https://github.com/Sheshiyer/arcplume/blob/main/SKILL.md, https://github.com/Sheshiyer/glam-cli, https://github.com/Sheshiyer/reddit-flux. CLI help and bounded local probes are authoritative for installed capabilities.

Execution receipt: Execute combo returned HTTP 429 with no implementation. Build selected command-code/xiaomi/mimo-v2.5-pro but produced no output or file changes for over three minutes and was stopped. Listener remains unimplemented. Existing queue test script passes; due query returns an empty list. Corrected the installed skill example to pass the runtime directory to `--state`.

## Bounded trial update

September 30: Bird search returned current complete post bodies and supports research-candidate preparation. Direct post reads, replies and account timelines returned 401; whoami remains unverified. Glam saved --limit 1 --metadata-only retrieved one post JSON successfully, despite GraphQL warnings during check. Reddit Flux was executed in an isolated checkout/venv; public auth and search returned 403, including a specific User-Agent check. Existing approval tests pass; a source-hashed candidate draft is held as not approved outside the live queue. See 2026-09-30-social-tooling-trial.md in docs/editorial. This is partial discovery acceptance, not listener or publisher acceptance.
