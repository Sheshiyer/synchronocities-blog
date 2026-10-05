# Bounded social tooling trial — September 30, 2026

## Outcome

The editorial preparation scope partially works with existing tools: Bird retrieves current public conversation search results and Glam retrieves saved Instagram post metadata. Neither proves a working public publisher. Reddit Flux executes in an isolated environment but public reads are denied by Reddit.

| Probe | Observation | Acceptance |
|---|---|---|
| Bird search: AI and judgment, three results | Current posts returned as JSON | Conversation discovery works |
| Bird author-specific search | Complete target post body returned with author, ID, timestamp and conversation ID | Exact post can seed a research packet |
| Bird direct read | HTTP 401 | Direct lookup blocked |
| Bird account timeline | HTTP 401 | Account listener remains blocked |
| Bird replies, corrected documented flags | HTTP 401 | Thread context remains blocked |
| Bird whoami, prior bounded probe | Settings page parse failed | Publishing account unverified |
| Glam check | Reports valid credentials and witnessalchemist, but emits GraphQL 403 retries | Identity response alone insufficient |
| Glam saved --limit 1 --metadata-only | Exit 0, one post JSON and cursor, no stderr | Saved-post metadata retrieval works |
| Reddit Flux public auth check | HTTP 403 | Public read blocked |
| Reddit Flux three-result topical search | HTTP 403 | Discovery blocked |
| Reddit public check with specific User-Agent | HTTP 403 | Failure persists without OAuth; no auth expansion attempted |
| Editorial approval-ledger tests | PASS | Local approval/claim/reconciliation safeguards verified |
| Trial candidate gate | `not approved` | Draft cannot publish |

Reddit source revision: `592403d5ec4837a1c95dac483d836c193cd1d19a`. Isolated checkout and virtual environment live under `/tmp/tryambakam-social-tool-trial/`; no global CLI replacement occurred. Instagram retrieval used installed Glam 0.3.0. Bird 0.8.0 used existing protected credential values only in subprocess memory, without command-line credentials or credential persistence.

## Review packet

One deterministic packet is saved outside Git under `~/.codex/editorial/tryambakam/trials/2026-09-30/packet-x-2105300414291652844.json`. It names the exact target, preserves the retrieved post body, hashes the search receipt and the fully read local `three-modes-of-intelligence.md` source, and carries a 216-character link-free contribution draft. Its status is research-candidate/draft, not ready or approved. The linked external source could not be opened and replies could not be retrieved, so context is incomplete. The expected publishing handle is not verified. No live queue row was added or changed.

Instagram source metadata, cursor and its checksum receipt also remain in the private runtime trial directory. One metadata retrieval does not establish complete pagination, continuous listening, media download, or publishing acceptance.

## Usable scope and remaining work

Use X search and Instagram metadata to prepare reviewable research packets. Keep the account listener and publisher held until identity and thread context work. Restore Reddit public access or independently verify an existing authorized OAuth session before relying on it. No posts, replies, comments, likes, follows, messages, provider activation or credential changes were performed. Arcplume remains optional Grok Build imagery; generation was not needed for this trial.
