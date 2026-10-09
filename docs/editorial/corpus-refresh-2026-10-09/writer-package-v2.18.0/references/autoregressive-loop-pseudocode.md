# Autoregressive Loop Pseudocode — Noesis Writer Skill v2.4.0

This specification governs new drafting and revision. It is fail-closed: a section or artifact that does not pass remains quarantined for human review.

## 1. Data model

```python
class ArtifactState(Enum):
    DRAFT = "draft"
    QUARANTINED = "quarantined"
    HUMAN_APPROVED = "human-approved"
    PUBLISHED = "published"
    RETIRED = "retired"

@dataclass
class Scores:
    contamination: float       # 0 is clean
    subject_dominance: float   # 100 means the subject fully governs prose
    voice_fit: float            # genre-conditional, 100 is best
    structural_depth: float     # topic-conditional, 100 is best
    source_support: float       # evidence quality and coverage
    epistemic_failures: list[str]
    process_leaks: list[str]
    safety_failures: list[str]

@dataclass
class SectionDraft:
    index: int
    title: str
    body: str
    iteration: int
    scores: Scores
    state: ArtifactState
    corrections: list[str]

@dataclass
class LoopContext:
    sankalpa: dict
    route: str
    topic: str
    platform: str
    source_lattice: list[dict]
    albedo_ledger: list[dict]
    coverage_passed: bool
    accumulated_draft: str
    section_outline: list[str]
    trace_log: list[dict]
    max_iterations: int = 5
```

## 2. Preconditions

The loop must not begin until these pass:

```python
def preflight(context):
    require(context.sankalpa["subject"])
    require(context.sankalpa["audience"])
    require(context.sankalpa["human_approver"])
    require(context.sankalpa["permissions_recorded"])
    require(context.route in ALLOWED_ROUTES)
    require(context.coverage_passed)
    require(all(row_passes_albedo(row) for row in context.albedo_ledger))
```

The claim and coverage gate applies to new drafts as well as transmutation. Schema validity or a historical `CLEAN` label does not prove coverage.

## 3. Main loop

```python
def draft_artifact(context):
    preflight(context)
    committed = []

    for index, title in enumerate(context.section_outline):
        section = SectionDraft(
            index=index,
            title=title,
            body="",
            iteration=0,
            scores=empty_scores(),
            state=ArtifactState.DRAFT,
            corrections=[],
        )

        candidates = []
        while section.iteration < context.max_iterations:
            section.iteration += 1
            prompt = construct_prompt(context, section)
            section.body = generate_text(prompt, platform=context.platform)
            section.scores = evaluate(section, context)
            candidates.append(snapshot(section))

            log_iteration(context, section)

            if blocking_gates_pass(section.scores, context):
                committed.append(section)
                context.accumulated_draft += render(section)
                break

            section.corrections = formulate_corrections(section.scores)
        else:
            best = select_best_candidate(candidates)
            best.state = ArtifactState.QUARANTINED
            log_quarantine(context, best, "max iterations reached")
            return assemble(committed + [best]), ArtifactState.QUARANTINED

    artifact = assemble(committed)
    final = final_convergence(artifact, context)
    if not final.passed:
        return artifact, ArtifactState.QUARANTINED

    # An agent can return a passing candidate, but cannot confer human approval.
    return artifact, ArtifactState.DRAFT
```

Never “commit the best failed version.” Preserve it as a quarantined candidate with its failure evidence.

## 4. Prompt construction

```python
def construct_prompt(context, section):
    return f"""
SUBJECT: {context.sankalpa['subject']}
AUDIENCE: {context.sankalpa['audience']}
ROUTE: {context.route}
SECTION FUNCTION: {section.title}

AUTHORIZED SOURCES:
{publicly_usable_source_summary(context.source_lattice)}

PASSING CLAIMS AVAILABLE TO THIS SECTION:
{claim_summary(context.albedo_ledger, section.index)}

PREVIOUS ARGUMENT:
{context.accumulated_draft or '[opening section]'}

CORRECTIONS:
{section.corrections or '[none]'}

CONSTRAINTS:
- Make the assigned subject, not the engine or framework, the protagonist.
- Distinguish source teaching, evidence, metaphor, house model, and synthesis.
- Keep internal vault paths, ledger mechanics, prompt mechanics, and hidden reasoning private.
- Publicly mark interpretive moves without mandatory engine self-narration.
- Use Kha-Ba-La, first person, fractal scaling, or brand vocabulary only when structurally useful.
- Do not introduce a material claim absent from the passing ledger.
- Do not promise, diagnose, coerce, or disclose unpermitted material.
"""
```

Do not include hidden chain-of-thought. Include only claims, sources, decisions, and correction summaries needed to produce the section.

## 5. Evaluation

```python
def blocking_gates_pass(scores, context):
    return all([
        scores.contamination == 0,
        scores.subject_dominance >= 90,
        scores.source_support >= 80,
        not scores.epistemic_failures,
        not scores.process_leaks,
        not scores.safety_failures,
        genre_voice_gate(scores.voice_fit, context.route),
        topic_depth_gate(scores.structural_depth, context),
    ])
```

The priority order is:

1. consent and safety;
2. subject dominance;
3. epistemic clarity and coverage;
4. useful argument structure;
5. genre/brand voice;
6. optional house vocabulary.

A high voice score can never compensate for a process leak, unsupported claim, or safety failure.

## 6. Subject-dominance and process-leak scan

```python
PROCESS_LEAK_PATTERNS = [
    r"this is a noesis synthesis",
    r"the (noesis )?engine (understands|believes|realizes|earns)",
    r"our claim mode",
    r"source lattice",
    r"albedo ledger",
    r"transmutation trace",
    r"internal vault",
    r"as an ai",
]

def process_leaks(body, route):
    matches = regex_matches(PROCESS_LEAK_PATTERNS, body, ignore_case=True)
    if route == "system-subject":
        matches = [m for m in matches if self_validates_or_exposes_private_mechanics(m)]
    return matches
```

Naming Noesis is not automatically a failure when Noesis is the subject. Self-praise, self-validation, synthetic personhood, private topology, and self-authorization remain failures in every route.

## 7. Correction synthesis

```python
def formulate_corrections(scores):
    corrections = []
    if scores.process_leaks:
        corrections.append("Remove process narration; state the subject-level insight directly.")
    if scores.subject_dominance < 90:
        corrections.append("Delete or rewrite paragraphs that perform the system or brand.")
    if scores.epistemic_failures:
        corrections.append("Return to Albedo; split, source, scope, attribute, or delete.")
    if scores.source_support < 80:
        corrections.append("Repair evidence or coverage; do not add decorative citations.")
    if scores.safety_failures:
        corrections.append("Stop affected generation and repair consent/safety boundary.")
    if scores.voice_fit < route_voice_threshold():
        corrections.append("Recalibrate voice after subject and evidence gates pass.")
    return corrections
```

## 8. Final convergence

```python
def final_convergence(artifact, context):
    checks = {
        "subject_dominance": cold_reader_can_state_thesis_without_engine(artifact, context.route),
        "process_scrub": not process_leaks(artifact, context.route),
        "claim_coverage": compare_artifact_claims_to_ledger(artifact, context.albedo_ledger),
        "citations": verify_all_citations(artifact),
        "permissions": verify_permissions(artifact, context.source_lattice),
        "frontmatter": verify_frontmatter_if_transmuting(context),
        "repository": run_repository_validation(context),
        "trace": trace_is_complete_and_reversible(context),
    }
    return Result(passed=all(checks.values()), checks=checks)
```

After convergence, return the candidate, uncertainties, evidence, and state to the human approver. Publication promotion is outside this loop unless a separate human-approved contract explicitly grants it.

## 9. Batch cooling-off

When more than five related pieces are generated in one batch, require a delayed cross-piece read before promotion. Scan for repeated openings, identical conclusions, template phrases, circular claims, bracketed private references, and common process leakage. Any repeated contamination quarantines the batch for human review.
