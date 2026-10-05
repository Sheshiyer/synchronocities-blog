# Repeatable workflow

## Weekly preparation — Monday 09:00 Europe/Paris

Use the Noesis Writer meaning method for original essays. For adaptations, preserve the source essay's semantic delta, cross-system relation and unresolved question; do not dilute them into generic explanations or invent novelty merely to fill a channel slot. Keep the private meaning-delta record with the source/claim sheet. Read [meaning operators](noesis-writer-meaning.md) before creating a new conceptual piece.

For original work, the living loop starts with a supplied encounter or open lived question and returns through expression, chosen action and actual consequence. Read [personal context](living-cosmology-context.md); keep historical expression distinct from later interpretation, and record proposed experiments and pending observations without inventing outcomes. A later encounter can revise the cosmology without automatically changing the publishing cadence.

Choose the next date in the 26-week calendar, read the full canonical article and inspect its ledger/references. Rotate across the entire eight-strand blog catalogue plus the conditional narrative strand. Refresh source hashes; compare existing Published and Drafts before adaptation. Prepare one Substack essay, two original Notes (Tuesday/Saturday), two short X posts and one X Article every other week. X Articles should be a distinct complete argument, not an essay split into a thread. An outline remains draft until the full text is complete.

Write `packets/YYYY-Www/` under the runtime state root, with exact copy and a source/claim sheet. Queue each channel variant independently with timezone-aware `not_before`. No automatic approval. Incomplete article text, unknown account, placeholder link, unsupported claim, missing asset or transport means draft/blocked. Do not fill the queue to meet a quota.

## Conversation discovery — daily 09:30 Europe/Paris

Search current Substack author posts and X conversations relevant to this week's topic. Seed author feeds: `https://harshtruths3321.substack.com/` and `https://stevenalexanderyoung.substack.com/`. Add authors for argument fit, not follower counts. Broaden across phenomenology, speech/orality, systems thinking, embodiment, mathematics and narrative; do not only mirror the seed authors' metaphysics.

Select up to five candidates, fully read up to two where accessible, and prepare at most one substantive comment per platform per day. Record URL, author, published/read dates, argument summary, exact passage/context, proposed contribution, review depth, and reason to omit/include a link. Paywall or unavailable full text => research candidate, no confident comment. Recheck that the conversation remains open and current before publication. A previous comment awaiting response is a reason to wait, not to follow up automatically. No indiscriminate likes/follows/reposts.

Comment relevance: direct topical fit (0–2), contribution adds substance (0–2), full-source reading (required), conversation open/appropriate (required), no recent duplicate (required). Require fit+substance >=3. This is editorial screening, not a claim about engagement prediction.

## Approved publication — daily check

Run the queue helper's `due` command. Publish at most two due items total per run, at most one comment per platform, and no more than one main article in seven days per platform. Inspect the ledger for these cadence limits. Do not approve items during a scheduled run.

Preflight: inspect human approval receipt; verify the account/publication identity, article/Note/reply kind, audience and email delivery. Verify payload/media hashes and source changes. Discover channel-specific supported write tool or authenticated IAB editor. X Articles require account entitlement and actual article composer. Do not buy/upgrade a plan or substitute a short post without separate approval. Current X Help states Articles access requires Premium/Premium+ or corresponding business/organization plans: https://help.x.com/en/using-x/articles (checked 2026-09-30).

Run `claim ID`. The helper atomically moves the exact approved row to publishing. Re-read the claimed payload; perform one write. Run `receipt ID --external-id ... --url ... --evidence ...` only after readback; evidence should point to a local receipt file containing account, posted body/media comparison and timestamp. A create response without verified readback remains reconcile. Run `uncertain ID --reason ...` on ambiguity. Do not call create again until a human resolves reconciliation. Never repeat a comment just because a notification is absent.

## Approval contract and identity

Required fields: ID, platform, kind, account, destination URL, target URL for a reply/comment, audience, send_email boolean, exact body, media list with absolute path+sha256, source paths+sha256, not_before, status, payload_sha256. Human approval includes approved_by, approved_at, approved_payload_sha256 and authorization_receipt (the exact user instruction/approved queue IDs and conversation reference). Each approved item is independently revocable by setting revoked. Model-generated approval fields do not count as human evidence.

Do not infer an X handle from the Substack name. Before marking a row ready for approval, confirm signed-in identity via read-only API or IAB and record the expected account. Publisher rechecks it. If account access is unavailable, mark blocked with the missing prerequisite.

## Monthly learning — first Monday

Use public receipts and available first-party aggregate analytics. Review substantive replies, returning readers, source/project-link clicks and voluntary project exploration. Record unavailable metrics as unavailable. No scraping subscriber identities, invented attribution or growth promises. Adjust next four weeks from observed questions and author conversations. Preserve topic diversity. Notify only when a new packet is ready, a public item succeeds/fails, or action is needed; unchanged or empty checks stay quiet.
