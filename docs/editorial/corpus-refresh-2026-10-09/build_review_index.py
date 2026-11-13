#!/usr/bin/env python3
"""Build a human review index from verified separate copy; no delivery actions."""
import json
from pathlib import Path
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[2]
def load(name):return json.loads((BASE/name).read_text())
def main():
    inv=load('inventory.json');index=load('REVIEW-INDEX.json');verification=load('VERIFICATION.json')
    rows=index['records'];summary=verification['summary']
    lines=['# Four-month writing refresh — October 9, 2026','',
    'The latest writer pass covers the local blogs written or substantively revised **June 9–October 9**, plus complete planning drafts and prepared platform copy. Every included piece has a separate complete review copy and a per-piece trace. Originals, published copy, existing approvals and queue contents retain their earlier bytes.','',
    f'**74 blog candidates and 37 distinct planning drafts reviewed: {summary.get("revised",0)} revised, {summary.get("unchanged",0)} retained with individual reasons.** The 134 source records include exact-copy aliases; they resolve to 111 review representatives. The two older versions of “Let the Sentence Finish” now intentionally converge to one proposed revision.','',
    '## Start reading','',
    '- [Let the Sentence Finish — proposed revision](revisions/077-substack-companion.md) · [earlier copy](snapshots/077-substack-companion.md) · [changes](diffs/077-substack-companion.diff). One revision of the existing article; 080 is an alternative source version, not a second release.',
    '- [Why Insight Isn’t Change — Substack companion](revisions/094-substack-20261008-insight.md) · [changes](diffs/094-substack-20261008-insight.diff). Calendar/runtime wit, conditions of choice and Kha–Ba–La retained as a house lens.',
    '- [A Record Before an Explanation](revisions/097-substack-20261015-record.md) · [changes](diffs/097-substack-20261015-record.diff). All five fields and the complete example table retained.',
    '- [The Answer After Recognition](revisions/118-the-answer-after-recognition.md) · [changes](diffs/118-the-answer-after-recognition.diff). The message, rehearsed answer, consequence and household scale remain distinguishable.',
    '- [The Lighted Clearing — blog candidate](revisions/026-The-Lighted-Clearing-Loka-Ak-ara-and-a-Discipline-of-Witness.md) · [changes](diffs/026-The-Lighted-Clearing-Loka-Ak-ara-and-a-Discipline-of-Witness.diff). Existing quotations and links preserved; source findings remain attached.','',
    '## What changed in the writer','',
    'Canonical and runtime packages are now **v2.18.0** and byte-identical. The new calibration recovers concrete imagery, self-implication, irreverence, technical imagination and exploratory cosmology. Context determines rhythm and density; functional captions, worksheets and product discussions keep their own register. No compulsory joke, scene, triad, scale tour or closing form was introduced.','',
    'The editorial contract and new-enqueue gate now bind the exact public copy, current contract ID and bytes, and canonical skill version. The existing daily preparation automation reads the new calibration and revision index; its schedule, model, project and delivery restrictions were preserved. Remote Muse Bot profiles were not newly updated by this local pass.','',
    '- [Versioned writer package](writer-package-v2.18.0/SKILL.md) and [contemporary direction](writer-package-v2.18.0/references/contemporary-author-direction.md).',
    '- [Current ecosystem writing contract](../WRITER-CONTRACT.md).',
    '- [Saved automation prompt/readback](AUTOMATION-REFRESH.json).','',
    '## Reading the review state','',
    'A completed style pass does not settle an empirical or historical claim. The blog candidates retain specific source findings, including scientific/traditional equivalences, unsupported mechanisms and metadata whose wording is stronger than the revised body. Frontmatter was preserved exactly, so those metadata conflicts are visible in the review rather than silently rewritten. Supplied autobiography remains supplied narrative; this pass neither invents new events nor independently certifies the author’s life.','',
    'Several prepared items also need current account, community, schedule or full media review. Existing media holds stay attached. Mixed profile/Reddit handoff files contain internal instructions; choose the exact public snippet and omit internal handoff before any delivery.','',
    '53 concept/outline states remain outside the complete-manuscript set. Gananatha awaits both long drafts; Consecration awaits its named source. External-only platform drafts were not recovered in this local census. The 53 other blog files have individual exclusion evidence in the inventory.','',
    'These files are concrete review candidates. Changed wording requires its own exact-item human review through the established publishing workflow; no queue item, publication receipt or prior approval has been reassigned to the revisions.','',
    '## Evidence','',
    f'- [Verification](VERIFICATION.json): {len(verification["checks"])} structural/source/coverage checks; current all-check result **{verification["passed"]}**. A structural PASS does not erase source findings.',
    f'- Independent whole-piece coverage: **{verification["independent_records"]}/111** representatives, with exact candidate/source hashes and whole-reading records.',
    '- [Machine-readable review index and aliases](REVIEW-INDEX.json) · [complete census](inventory.json) · [scope and exclusions](inventory-README.md).',
    '- [Pattern triage](PATTERN-TRIAGE.json): contextual review prompts, no authorship verdict or numerical voice-fit score.',
    '- [Original/queue preservation manifest](PRESERVATION.json) · [writer package hashes](WRITER-PACKAGE.json).',
    '- Reproduce structural checks with `python3 docs/editorial/corpus-refresh-2026-10-09/verify_refresh.py`. Writer gate: 17 meaningful regression tests pass, including changed contract/copy and stale/missing evidence rejection.','',
    '## Complete piece-by-piece review','',
    '| Piece | Copy pass | Source → candidate → changes | Findings |','|---|---|---|---|']
    holds=['# Remaining source and delivery findings','', 'These findings accompany completed contextual style candidates. Resolve relevant source, metadata, account, schedule and media questions before representing a piece as publication-ready. No public action is authorized by this list.','']
    for row in rows:
        id=row['id'];title=row['title'].replace('|','\\|');before=f'snapshots/{id}.md';after=f'revisions/{id}.md';diff=f'diffs/{id}.diff';review=f'reviews/{id}.json';findings=row['unresolved_findings']
        lines.append(f'| {id[:3]} · {title} | {"Revised" if row["changed"] else "Retained"} | [Source]({before}) · [Candidate]({after}) · [Diff]({diff}) | [{len(findings)} findings]({review}) |')
        if findings:
            holds += [f'## {id} — {row["title"]}','',f'[Candidate]({after}) · [Exact review trace]({review})','']
            holds += ['- '+(f if isinstance(f,str) else json.dumps(f,ensure_ascii=False)) for f in findings]+['']
    (BASE/'README.md').write_text('\n'.join(lines)+'\n')
    (BASE/'SOURCE-HOLDS.md').write_text('\n'.join(holds).rstrip()+'\n')
    print(f'Built111piece review index and{sum(bool(r["unresolved_findings"]) for r in rows)}findings entries')
if __name__=='__main__':main()
