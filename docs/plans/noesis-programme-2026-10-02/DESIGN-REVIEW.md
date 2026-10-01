# Design review and thinking evidence

## FirstPrinciples — Challenge

The basic needs are a task identity, permitted scope, accountable actor, artifact and falsifiable result. A separate service per kosha, a new dashboard and an always-on council are historical forms, not physical necessities. Existing approval boundaries are deliberate owner policy: revisable by the owner, binding on this run. Comment ordering cannot make concurrent observations atomic; that is an actual distributed-state limitation. Reconstruct around the existing operation-level ledger and add offline evidence contracts.

Assumptions tested: birth-blueprint needs implementation (refuted by fresh HEAD29ef123 and local acceptance); named Grok profiles prove persistent bot identity (not supported by selected config/transport evidence); a schema proves acceptance (refuted by cross-artifact scope/cost/claim requirements). Consequence: implement #48 first; do not repeat accepted workflow work or introduce a replacement runtime.

## SystemsThinking — CausalLoop

Question: why can an integrated agent system generate activity faster than useful public work?

Hypothesized reinforcing loop: more active surfaces → more integration edges → more failure/coordination work → more apparent need for new agents → more active surfaces. Each arrow describes extra coordination mechanisms; no numerical causal estimate is claimed. Counter-loop: clear scope → verifiable artifacts → fewer ambiguous retries → more time for useful work → confidence to keep scope bounded. Human feedback arrives with a delay; activity counters can therefore reward work before its consequence is known.

Intervene in purpose and admission, not animation: one owner, one bounded task, an independent result check, and one scheduler per responsibility. Keep whole-field meaning while reducing operational couplings. Monitor verified artifact count and waiting/duplicate work, not just pings.

## RootCauseAnalysis — FiveWhys, branching

Observed problem: historical completion claims coexist with unfinished steps, missing connections and simulated delivery.

Why can completion be overstated? Logs and handlers call a step successful. Why is that insufficient? A suppressed write or simulation can also return success. Why does the claim survive? Generated summaries propagate the label. Why is it not corrected? Artifact/delivery evidence is not a mandatory part of every acceptance boundary. Correct at receipt ingestion with separate simulation/execution/delivery evidence.

Additional branches: role templates do not establish tool permissions; configurable policy flags do not establish actor authority; multiple scheduler surfaces allow ownership ambiguity. These are contributing factors with source support, not an exhaustive incident diagnosis. Forward reading yields the remediation: enforce actor/scope/receipt consistency and keep real delivery as a separate probe. Do not blame the human for an architecture that made optimistic labels easy to propagate.

## IterativeDepth — eight lenses, bounded selected application

- Literal: E5, Temperance, execute long horizon, agent ecosystem first.
- Stakeholder: owner sovereignty, planner limited read, executor scope, verifier independence, future maintainer traceability.
- Failure: empty provider sets, unknown caps, path escape, forged approval, competing comments and unsupported satisfied criteria.
- Temporal: source HEAD moved since public issue creation; stale task evidence must be reissued, not silently relabelled current.
- Experiential: owner sees an actual artifact and a clear next action without supervising routine unchanged polling.
- Constraint inversion: a zero-network offline checker still adds useful value; a full fleet is unnecessary for the first cycle.
- Analogical: transactional claims and exact editorial submission records already separate coordination, permission and delivery.
- Meta: the system serves independent authorship; a technically elaborate scheduler without a useful artifact does not meet that purpose.

Literal/temporal analysis ran in the primary. Failure/stakeholder acceptance analysis ran independently; transport analysis tested the configured-bot assumption. The eight-lens application reused these probes rather than spawning eight redundant workers. It added concrete source/test/runtime boundaries to the ISA.

## Other selected capabilities

**ISA:** Interview asked first delivery and exact bot destination. Owner chose Agent ecosystem first; transport question remains open. Existing twelve sections are extended rather than replaced. Acceptance IDs are stable and future real-world gates remain unchecked.

**FeedbackMemoryConsult:** Narrow project feedback-file lookup returned no matching files. The separate memory registry lookup supplied existing queue/approval/preservation conventions; queue hash was freshly verified. No memory was written.

**Advisor:** Pre-implementation Inference call attempted; returned `Error: Timeout after 30000ms`. No advisor verdict or independent PASS is inferred. Independent read-only acceptance review supplies concrete probes but is not relabelled as an Advisor result.

**ReReadCheck:** Final scope audit must check E5, invoked Temperance, agent-first execution and the long-horizon continuation. Source implementation alone cannot complete future connected runtime, lived return or publication gates.

## Effort and scope

E5 is explicit despite sticky E4 and subsequent reply classifiers. The natural new acceptance set is 32 source/programme criteria plus eight future runtime/editorial gates. Existing root criteria are preserved. The soft 256-criterion floor is not met by padding or duplicating tests. Bulk implementation is routed through an isolated noesis-execute worker; native work is planning, evidence and integration. Independent transport and acceptance reviews are read-only. Cross-vendor verification follows the produced diff; unresolved attribution is recorded honestly.
