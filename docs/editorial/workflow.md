# Tryambakam recurring editorial workflow

Installed skill: `/Users/sheshnarayaniyer/.codex/skills/tryambakam-editorial/SKILL.md`. Versioned source: `.agents/skills/tryambakam-editorial/`. Runtime state: `/Users/sheshnarayaniyer/.codex/editorial/tryambakam/`. The local queue gate performs no network writes; supported platform tooling or IAB performs a separately approved submission.

## Active schedules

- Tryambakam weekly editorial studio: Monday 09:00 local app time (Europe/Paris client context). Prepare a full weekly package; monthly review on first Monday. Automation ID `tryambakam-weekly-editorial-studio`.
- Tryambakam conversations and approved publisher: daily 09:30 local app time (Europe/Paris client context). Check individually approved items, then research and prepare relevant comments. Automation ID `tryambakam-conversations-and-approved-publisher`.

Both are local Codex cron automations attached to the saved 18765 blog project. They require the desktop scheduling environment, workspace and authenticated supported platform tools. They are not server-hosted always-on publishing services. App scheduler uses local time; preserve Europe/Paris in future schedule changes. Notifications are limited by the prompts to meaningful new work or action, not repetitive status.

## Human approval

User chose publish individually approved items on 2026-09-30. A review packet shows exact copy, source evidence, account, platform kind, destination, target conversation where relevant, audience, email setting and media. Approve specific queue IDs with those exact choices. The assistant records that direct instruction as authorization evidence and the payload hash; a scheduled agent cannot invent approval. Each variant and each comment is approved independently. Changing the copy or source/media hashes invalidates eligibility.

Example request after reviewing a concrete row: “Approve queue item [ID] exactly as shown, for [account], public audience, [email setting].” This example is not itself an approval. Publisher rechecks account identity and live platform context before submission.

## Editorial rhythm

One weekly Substack essay, two Notes, two short X posts, an X Article every other week when the account supports it, and up to two researched conversation candidates daily. Quality and relevance take priority over those ceilings. Maximum two public submissions per daily run; one comment per platform/day and one main article per platform/seven days. No DMs, mass outreach or unsolicited promotional comments.

The source-grounded 26-week calendar remains the main queue. Full nine-series routing and twelve-week organic discovery strategy live in the skill's references. Reader path: useful contribution → complete argument → relevant demonstration → voluntary project exploration. Most comments should carry no project link. Project mentions state affiliation and accurate observed capability.

## Verification receipt

Skill validator passed. Synthetic queue tests passed: exact approved payload is eligible; changed copy/source and draft are rejected; a repeated claim cannot submit; uncertain writes hold all subsequent publication until reconciliation; verified receipt closes the write. These tests prove local eligibility/state handling, not live Substack or X publication. No platform write occurred. Account identities, X Article entitlement and supported channel-specific publishing adapters remain to be verified before the first approved submission.

Run `python3 ~/.codex/skills/tryambakam-editorial/scripts/queue.py due` for eligible queue rows. Empty output means no approved due work. Queue state is private and excluded from this repository. The skill remains discoverable without altering global routing or unrelated automations.
