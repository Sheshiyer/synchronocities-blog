# Drafting and whole-output review pseudocode — v2.20.0

This is an editorial specification, not evidence of a running program or remote approval adapter. It supersedes historical numerical voice gates and section-only convergence. Consent, Albedo, fail-closed lifecycle and human publication authority remain unchanged. Read [integrated understanding](integrated-understanding.md) first.

## Context and preflight

```python
context = {
    "intent": audience_subject_route_permissions_approver_and_terminal_state,
    "sources": selected_sources_with_hashes_locators_and_actual_coverage,
    "conceptual_brief": questions_senses_relations_contribution_and_non_fit,
    "claims": atomic_albedo_rows_and_blind_coverage_comparison,
    "trace": reversible_changes_and_review_findings,
}
```

Select material by conceptual relevance. Consult dates for provenance and historical scope. The brief is internal preparation, not a required article outline. No hidden chain-of-thought is requested or published; retain concise claims, decisions, locators and review summaries.

Before generating candidate prose, require recorded intent/permissions and appropriate source/claim preparation. An unresolved material claim cannot enter as publication-ready fact. Split, attribute, narrow, declare metaphor/synthesis, source or quarantine it using Albedo. Do not remove necessary source ambiguity to make a ledger look clean.

## Drafting loop

```python
def draft(context):
    preflight(context)
    draft = compose_form_suited_to_subject_and_genre(context)
    for attempt in range(5):
        section_findings = review_sections_against_source_and_claims(draft, context)
        whole = read_entire_output_and_selected_source(draft, context)
        findings = merge(section_findings, whole.findings)
        # Whole-output checks include causal direction, term senses, modality,
        # source ownership, local coherence and the actual contribution.
        if substantive_gates_pass(findings):
            return draft, "DRAFT", evidence_for_actual_review_scope(findings)
        preserve_snapshot_and_findings(draft, findings)
        draft = repair_exact_affected_spans(draft, findings)
        reread_adjacent_context_and_later_dependencies(draft, findings)
    return best_preserved_candidate(), "QUARANTINED", unresolved_findings()
```

A provisional section pass never certifies the assembled piece. Do not commit the best failing version as publish-ready. Preserve it with its blocking evidence and manual-review need.

## Substantive gates

Use qualitative evidence, not invented contamination, subject, voice or support percentages:

- intent, consent and privacy are respected;
- the actual subject governs prose, with public process boundaries appropriate to route;
- every material claim has a passing Albedo pair and blind coverage is complete;
- source meaning and the whole output remain semantically faithful;
- mathematical assertions meet their existing role-specific tests;
- the argument and genre retain their useful function, imagery and personality;
- vocabulary senses and source/interpretation/adoption boundaries are honest;
- applicable metadata, links, permissions, repository and reversible-trace requirements pass.

Any blocking failure retains QUARANTINED under the existing skill. A review outcome must state concrete findings and actual coverage. A scan can flag a phrase; it cannot decide what the phrase means or grant a passing voice judgment.

## Public body and batch readback

Read only the reader-facing body after source comparison. Does it develop the question? Does a metaphor become literal in the next paragraph? Does attribution vanish when the conclusion expands? Has a repair created repetition, a missing referent or a contradiction? Does the ending belong to the piece? Keep private source paths and editorial machinery outside unrelated public prose.

For more than five related outputs, retain a delayed cross-piece read before promotion. Compare rhetorical moves and semantic conclusions as well as repeated strings. Intentional platform adaptations may share material, but they must have their own audience purpose and exact-copy review. Material repeated contamination holds the batch for human review; no zero-findings scan releases it.

Return the candidate, coverage, uncertainties, trace and state to the human. Source integration, canon adoption and exact-copy publication review are separate. This pseudocode supplies no autonomous publication or remote HITL implementation.
