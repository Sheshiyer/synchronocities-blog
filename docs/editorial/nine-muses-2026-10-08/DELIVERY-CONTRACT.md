# Muse ownership and the delivery boundary

Observed 8 October 2026. Nine distinct Grok Bots were created through native UI and received the role briefs in registry.json. Persistent chat briefs were read back. Calliope and Polymnia report saving their roles to their own memory; those memory stores were not independently inspected.

The existing Field Report remains owner-private. The six publication payloads are unchanged. The Substack companion has a current exact human approval (8 October, 13:02:45 UTC) and no queued publication. The current queue is empty. Creating Muses is editorial routing; it does not implement the delivery adapter.

## Current capability evidence

| Surface | Evidence | Delivery consequence |
|---|---|---|
| Field Report | Bots report unsigned requests return 401 | Bots cannot read the private queue with current access |
| Archive source | Calliope reports /Volumes/madara outside her allowed local folder | Local source reading is unavailable to that Bot |
| X | Calliope and Polymnia report research tools but no create-post tool | Connector publication unsupported; browser path unverified |
| Substack | Both report no connected publishing toolkit | Browser publication would require an authenticated exact account and a verified draft/publish flow |
| Reddit | Both report Composio create-post tool on u/Cautious_Bet1792 | Account differs from intended draft identity u/Mrhigh3r; no submission |
| Local ft CLI | ft 1.3.22 help lists bookmark/library tooling and no posting command | Useful for source/category work; not a publishing adapter |

These are current UI reports, not successful delivery tests. No public test posts, new schedules, account grants or folder permission expansion were performed.

## Required executor contract

1. A human approves the exact current payload in Field Report. A human queues that approved payload.
2. An executor receives only the queued item and source material needed for it, through an explicitly authorized access route. No general Site credential or cookie is handed to a Bot.
3. The executor rechecks the current queue and approval fingerprint against the canonical reviewPayload. Account, destination, audience, publication kind, subscriber email, media and ordered thread posts must match. No agent can click approve or substitute an account.
4. Only a supported authenticated channel action runs. Unsupported capability or changed payload keeps the item held with a specific reason. Partial thread delivery must record each returned post and stop without blind retries.
5. A successful result records the actual platform identifier, public URL, time and exact payload fingerprint. A response saying “posted” without a verified platform receipt is insufficient.
6. Reconciliation must preserve a delivered or partially delivered receipt across retries. The existing Site currently has no execution-claim or delivery-receipt endpoint; those require implementation before calling this automatic delivery.

## Next implementation boundary

An authenticated, narrowly scoped queue reader plus execution/receipt lifecycle is still needed, followed by an account-matched publishing adapter for each channel. The existing GET /api/publication-queue is a read-only approved handoff, not an executor. POST /api/record-action reserves approval/queue decisions for the signed-in human. No current endpoint has been relabelled as automatic publishing.

Muse ownership is visible in the live Site and does not enter or alter the approved public payload. The eight populated series remain intact; Erato works across relationship/authorship questions. Conditional narrative lane N stays behind real manuscript sources.
