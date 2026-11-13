# Public product branches in the existing editorial engine

This extension reuses the existing editorial engine. Source tests, installed parity and live publication receipts remain separate evidence. The canonical writer and its contract are unchanged.

Thoughtseed → LumenBar / Temperance → independent X, owned-profile Reddit and community adaptations reuse the existing context pipeline, writer review and publication queue. The product allowlist contains two exact public source files and two existing video files, with original hashes, public provenance and preparation-only classification. It grants no private-corpus access, runtime admission or publication authority. The Temperance essay source ID is not the product ID.

## Source preparation and review conversion

`calendar_runner.py prepare-product --blog-root ROOT --source-id ID --date YYYY-MM-DD --asset-manifest MANIFEST --output FILE` prepares one explicit product context under the existing preparation store. It does not scan the blog corpus, rotate the daily brand, overwrite the daily assignment, write prose or approve anything. The selected checkout's contract must match the current writer authority. Select an allowed video through `product_authorization_id`; arbitrary file paths or changed hashes are refused.

`native_handoff.py convert-reviewed --review REVIEW --assignment ASSIGNMENT --settings SETTINGS --review-base SOURCE_BASE --blog-root ROOT --output NEW_FILE` preserves the reviewed `publicCopy` byte values. It checks its public-copy fingerprint, current writer/contract, every declared source-coverage file hash and actual context/media bindings. Settings provide exact account, destination, format and timing; they cannot replace copy or contain approval fields. Link posts omit video attachments while retaining their exact link URL in the digest.

The v4a reviewer schema is **not** the queue schema. Original array-shaped coverage and semantic descriptions are retained as `upstream_writer_review`. The default conversion stays `held-for-binding-review`, with target `source_coverage:false` and `semantic_review:false`. An explicitly performed, named binding review can be supplied with `--binding-review`: it must cover the current package, contract, context, assets, queue payload and public-copy hashes and resolve the existing findings. No script turns an array into a claim that a source was read. Only then can the existing `enqueue-draft` gate admit a draft. Neither conversion nor enqueue grants human approval.

## New-row approval and timing

Opt-in `payload_version:2` binds the old exact payload plus title, link URL, post format, writer policy, transport, delivery mode, `not_before`, `scheduled_for` and IANA timezone. Legacy approved digests remain unchanged.

- `delivery_mode: schedule`: verified native X scheduling. `not_before` is the earliest allowed scheduling submission; `scheduled_for` is the desired future publication instant. Schedule claims may happen before publication, after `not_before`.
- `delivery_mode: publish`: immediate IAB submission when due, including Reddit video. `not_before` must be at or after `scheduled_for`. Native Reddit video scheduling remains unavailable; a clock icon is not schedule acceptance.

Both timestamps require explicit matching timezone offsets. Account/destination, media, source or policy drift invalidates approval. Scheduled or published content cannot be resubmitted by changing schema version or date. No scheduler or new cadence is added.

## Native delivery and readback

`native_handoff.py --state STATE preview ID` is read-only. `claim ID` requires a current reviewed, specifically human-approved item and takes the existing atomic claim. It returns an exact IAB handoff; it performs no network request, browser action or automatic transport switch. `calendar_runner.py publish` retains its old CLI capability holds.

After one real IAB operation, `observe ID --evidence FILE` checks a fresh attributable `editorial.native-iab-observation.v1`: source `native-iab-readback`, actual operator/time, payload hash, exact account/destination/title/body/link/format/media, native ID, snapshot/screenshot paths and hashes, and appropriate scheduled-view or public URL. `synthetic:true`, incomplete or mismatched observations become `reconcile`; a local file's existence is insufficient. Timezone presentations may differ if they describe the same approved instant.

A confirmed schedule is recorded as `scheduled`, never `published`. Later publication needs fresh matching public readback; there is no second create. Receipts explicitly say **operator-observed; not independently authenticated**. These structural checks preserve the existing operator trust boundary and do not authenticate platform reality cryptographically. Uncertainty blocks another claim; reconcile before considering a retry.

Tests use disposable synthetic fixtures only. At the child-agent handoff the installed copy is unchanged because the coordinator reserved local synchronization for independent review. This is an assignment boundary, not a requirement for another user approval: the coordinator can finish the already requested reversible local integration with backups, exact-file verification and preservation of existing queue rows. No human approval, native schedule, public post or production deployment is created by this source slice.

The observed X scheduled UI does not expose a scheduled-post ID. A scheduled-only readback can explicitly preserve `native_id:null` with the exact payload/time/native-view identity and an unavailable reason. Public publication still requires a real ID bound to its public permalink. This is attributable operator evidence, not independent platform authentication.
