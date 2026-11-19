# Local publishing context pipeline — October 9, 2026

Implementation lives in `.agents/skills/tryambakam-editorial/scripts/context_pipeline.py`, imported by the existing calendar runner. It performs local inventory projection, bounded source/context assembly and deterministic one-lead daily preparation. It does not author copy, create approvals, submit posts or modify scheduled automations.

The executable contract and schemas are documented in the skill's `references/source-context-pipeline.md`. New writer review bindings require v2.20.0 and the v4 human-direction contract. A stale canonical installation holds preparation and enqueue explicitly.

Run the meaningful local checks:

```sh
python3 -m unittest discover -s .agents/skills/tryambakam-editorial/scripts -p 'test_*.py'
```

`test_context_pipeline.py` covers actual UTF-8 passage bytes/locators, private and out-of-root paths, symlink escapes, source/asset/package drift, missing Muse coverage, structured digest mismatch, semantic-review absence, stable replay, deterministic brand rotation, eligible-source selection and real draft enqueue without approval. Existing transport tests isolate their older ledger/transport unit scope; the context test suite exercises the complete strengthened enqueue gate.

A prepared assignment contains no prose body. It is not a publication-ready draft. A complete adaptation must resolve source, visual, semantic and destination findings through actual review before enqueue, then receive separate exact-item human publication approval through the existing workflow.

The live local projection contains 343 identities: 127 eligible blog sources, 113 held concept/prepared-copy identities, and 103 restricted work objects (23 Noesis, 80 Thoughtseed). It links the existing October 9 GitHub census of 331 repositories, retaining visibility and 44 work-object associations; it does not re-read repository bodies or declare projects admitted. The Cloudflare projection provides 20 bucket identities and inherited verified media context with access restrictions.

Daily rotation alternates Tryambakam Noesis and Thoughtseed. Thoughtseed requires classified Thoughtseed project evidence; otherwise the day produces an explicit source-selection hold. Nine Muse profiles provide role context. Fresh reports remain unknown/unverified unless supplied, and a scoped agent or human review disposition records missing coverage honestly. Human publication approval remains separate.

The held pilot uses the exact parent-authored Lighted Clearing adaptation, a full local source, all seven integrated writer foundations plus contract/voice/context, two bounded original evidence passages and a visually inspected existing carousel cover. Its private envelope locator and hashes are in PILOT-RECEIPT.json. The question about overlap with the published sentence exercise and the sequence cover fit remains open. The original evidence ledger pins file hashes and byte ranges; callers cannot grant themselves an external source authorization.
