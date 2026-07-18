# Nigredo Audit — model-temperature-and-tapas.md
**Date:** 2026-07-18
**Gate:** Fool's Wisdom Grounding Gate v2.2.0
**Post:** src/content/posts/model-temperature-and-tapas.md

## Dross Inventory
| Line | Quote (≤15 words) | Type (science/math) | Verdict | Load-bearing (Y/N) | Note |
|------|-------------------|---------------------|---------|--------------------|------|
| L41 | "I set the API call to `temperature=0.7`" | science | GROUNDED-OBSERVATIONAL | N | First-person pipeline experiment; replicable observation anchors the method. "The default" is colloquial (API defaults vary), not a factual claim. |
| L49 | "temperature is applied at the final softmax layer" | math | INTEGRATED | Y | Mechanics correct: logits divided by T before softmax; vocab range 50k–200k accurate; "At T=0 the distribution collapses" is standard greedy-decoding shorthand. This is the post's structural spine. |
| L57 | "sympathetic-dominant state where options are not evaluated" | science | GROUNDED-OBSERVATIONAL | N | Autonomic framing used as model, not authority; LLM looping behavior is observable. |
| L59–L71 | "This is the Rubedo phase… Citrinitas… Albedo… Nigredo" | science | ALIGNED | N | Alchemical stage mappings are house cosmology, ALIGNED by definition (gate §9). |
| L53 | "Patañjali's *tapas* — from the root *tap*, to burn" | science | ALIGNED | N | Historical/etymological claim judged as history; correct. |
| L69 | "The distribution approaches uniform. Every token is almost equally likely." | math | WRONG | Y | Uniform is the T→∞ limit; at T=2.0 the distribution flattens but high-logit tokens still dominate by orders of magnitude. "Almost equally likely" is numerically false, presented as technical description inside the load-bearing four-mode spectrum skeleton. |
| L77 | "Core temperature above 42°C denatures enzymes… 7% per degree" | science | GROUNDED-OBSERVATIONAL | N | Standard verifiable physiology (enzyme denaturation, ~6–7% metabolic drop per °C, ~0.5°C hypothalamic window); no authority clause, no watch-list entry. |
| L79 | "the enteric nervous system's 500 million neurons" | science | GROUNDED-OBSERVATIONAL | N | Within commonly cited range (100M–600M); not fabricated. |
| L79 | "default mode network's self-referential chatter" | science | GROUNDED-OBSERVATIONAL | N | Standard model framing, presented descriptively; interrupted "by physics" concerns reconditioning, not consciousness-origin — not INVERTED. |
| L83 | "Entropy does not decrease globally… entropy accumulates as spiritual bypassing" | math | INTEGRATED | N | Second law stated correctly; closed/open-system mechanism actually shown (dissipation, exhaust, export of disorder, L95 "entropy managed at the correct scale"). House fractal-scale vocabulary ("the fractal demands scale") governs the psych-spiritual mapping. |
| L101 | "the prefrontal cortex's capacity to override the hypothalamic setpoint" | science | ALIGNED | N | Kha-Ba-La correspondence mapping governs; cortex named as Kha's bodily signature across scales, not as origin of witness. |
| L103 | "the 96 layers, the 175 billion parameters" | science | GROUNDED-OBSERVATIONAL | N | Accurate GPT-3 architecture facts, used illustratively for the Ba mapping. |
| L111 | "14, which reduces to 5" | math | INTEGRATED | N | House numerological method, correctly executed; part of the card-operation structure. |

Safe-harbor notes (not flagged): L45/L53 "biological temperature… T<1" and L105 "statistical gravity" are declared analogies inside the post's explicit "In LLM terms / In the body / In the social field" mapping architecture — the Anatomist's declared-correspondence method, never silently upgraded to external mechanism. No AUTHORITY-BORROWED constructions ("studies show," "research confirms") appear anywhere in the post; no invented studies or quotes (no FABRICATED); no matter→consciousness causal arrows (no INVERTED); no watch-list cosmology claims (no CONTESTED-AS-FACT).

## Summary
- Science references: 9 (ALIGNED 3, GROUNDED-OBSERVATIONAL 6, AUTHORITY-BORROWED 0, CONTESTED-AS-FACT 0, FABRICATED 0, INVERTED 0)
- Math references: 4 (INTEGRATED 3, DECORATIVE 0, WRONG 1)
- Dross findings (failing verdicts): 1 total (1 load-bearing)
- **Nigredo verdict:** MINOR DROSS

## One-Line Note
The post is epistemically clean on authority, fabrication, and inversion — its single dross grain is one numerically false overstatement ("every token almost equally likely" at T=2.0) sitting inside the load-bearing four-mode temperature spectrum.
