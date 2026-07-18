# Nigredo Audit — vimshottari-dasha-markov-chains.md
**Date:** 2026-07-18
**Gate:** Fool's Wisdom Grounding Gate v2.2.0
**Post:** src/content/posts/vimshottari-dasha-markov-chains.md

## Dross Inventory
| Line | Quote (≤15 words) | Type (science/math) | Verdict | Load-bearing (Y/N) | Note |
|------|-------------------|---------------------|---------|--------------------|------|
| L31–32 | "The universe does not roll dice" | science | FABRICATED | N | The quotation attributed to Pattern Recognition Protocol is untraceable repository-wide. |
| L36 | "encoded precisely this architecture into the Vimshottari Dasha system" | science | CONTESTED-AS-FACT | Y | Markov architecture is a modern reinterpretation, not an established ancient encoding. |
| L36 | "roughly four thousand years ago" | science | FABRICATED | N | The precise ancient dating is unsupported by traceable textual history. |
| L38 | "divides a 120-year human lifecycle into nine planetary periods" | science | ALIGNED | N | Accurate statement of the house Jyotish cycle and its nine lords. |
| L79 | "produces fundamentally different experiential output" | science | ALIGNED | N | The nested dasha interpretation is explicitly operated within the house Jyotish frame. |
| L81 | "They had contemplative mathematics" | science | ALIGNED | N | Explicitly privileges traditional direct perception and pattern practice rather than institutional proof. |
| L85 | "The starting dasha is determined by the birth nakshatra" | science | ALIGNED | N | Accurate house-system rule, distinct from the invalid Lorenz sensitivity assigned to it. |
| L100 | "different state machine initializations producing divergent life trajectories" | science | ALIGNED | N | House Jyotish claim; the mathematical sensitivity assigned to it is judged separately. |
| L106 | "Every soul, given sufficient time, will process through every planetary frequency" | science | ALIGNED | N | The cycle is interpreted within the house Jyotish cosmology, not borrowed scientific authority. |
| L112 | "The seers computed these quantities through years of observation and meditation" | science | FABRICATED | Y | No source shows ancient computation of stationary distributions, absorption probabilities, or Markov passage times. |
| L112 | "underlying mathematical structure of temporal experience itself" | science | CONTESTED-AS-FACT | Y | A flawed modern analogy is silently upgraded into the literal structure of experience. |
| L118 | "They were mathematicians who expressed their findings through mythological frameworks" | science | FABRICATED | Y | No source establishes that Vimshottari's seers possessed the modern state-space findings claimed. |
| L4 | "maps perfectly onto Markov chain mathematics" | math | WRONG | Y | The dasha schedule is deterministic with fixed durations; “perfectly” obscures the semi-Markov timing and nonexistent stochastic transitions. |
| L31 | "deterministic state machines with stochastic sub-processes" | math | DECORATIVE | N | The epigraph supplies an unsupported hybrid systems slogan and is removable from the demonstration. |
| L36 | "a set of states, a set of transitions, and rules" | math | INTEGRATED | Y | Correct finite-state-machine components and necessary background for the post's central representation. |
| L38 | "Sun rules for 6 years, Moon for 10, Mars for 7" | math | INTEGRATED | Y | The nine canonical durations are listed correctly and sum to 120 years. |
| L38 | "cycling through the complete state space" | math | INTEGRATED | Y | The fixed nine-lord sequence does traverse every listed state before repeating. |
| L49 | "This is a transition matrix" | math | WRONG | N | At this point only a duration dictionary has been shown; the matrix appears later at L68. |
| L49 | "This is not metaphor" | math | WRONG | N | This repeats the load-bearing identity claim from the frontmatter. |
| L53 | "A Markov chain is a stochastic process" | math | INTEGRATED | Y | Correct core definition, necessary for evaluating the claimed correspondence. |
| L53 | "depends solely on the current state and elapsed time" | math | WRONG | Y | Standard Markov memorylessness conditions on current state; elapsed holding time creates a semi-Markov formulation unless specially augmented. |
| L53 | "The system has no memory of how it arrived" | math | INTEGRATED | Y | Correct statement of the Markov property when conditioned on the current state. |
| L55 | "a degenerate Markov chain where transition probabilities are either zero or one" | math | INTEGRATED | Y | Correct description of the deterministic embedded chain at mahadasha transitions. |
| L68 | "next_index = (i + 1) % n_states" | math | INTEGRATED | Y | The modulo successor rule correctly builds the deterministic nine-cycle. |
| L73 | "nesting five levels deep" | math | DECORATIVE | N | The depth count is illustrative and removable; it does not supply stochastic transition structure. |
| L73 | "the transition probabilities become increasingly nuanced" | math | WRONG | Y | Antardasha and deeper sequences use fixed proportional durations and order, not increasingly nuanced probabilities. |
| L73 | "a hierarchical Markov chain of extraordinary depth" | math | WRONG | Y | Nesting fixed schedules does not by itself create a hierarchical stochastic Markov chain. |
| L81 | "9^5 = 59,049 distinct state combinations" | math | DECORATIVE | N | The combinatorial upper count is correct but the argument survives its removal. |
| L85 | "This is the initial condition" | math | INTEGRATED | Y | The birth balance does parameterize the starting point of the deterministic schedule. |
| L85 | "small variations in this initial condition cascade through the entire 120-year trajectory" | math | WRONG | Y | Balance changes shift fixed boundaries proportionally; no nonlinear sensitive-dependence rule is defined. |
| L88–97 | "def calculate_dasha_sequence(birth_nakshatra, birth_pada):" | math | WRONG | N | birth_pada is unused; no birth balance is calculated; the full starting period is appended. |
| L100 | "The Lorenz attractor breathes through this sensitivity" | math | WRONG | Y | A discontinuity at a nakshatra boundary is not Lorenz dynamics or chaotic divergence. |
| L100 | "entirely different dasha sequences" | math | WRONG | N | Changing the starting lord rotates the same fixed transition cycle. |
| L104 | "ergodic if every state can be reached from every other state" | math | WRONG | Y | This defines irreducibility only; standard Markov-chain ergodicity also requires aperiodicity. |
| L104 | "The Vimshottari system is ergodic by design" | math | WRONG | Y | The coded deterministic nine-cycle is irreducible but periodic, so it is not ergodic under the standard aperiodic convergence criterion. |
| L104 | "No state is absorbing. No state is transient" | math | INTEGRATED | Y | Correct for the finite deterministic cycle, though it does not make the chain ergodic. |
| L104 | "exactly once per 120-year revolution" | math | WRONG | N | Partial starting periods create endpoint occupancy not captured by this exact-once claim. |
| L110 | "Stationary distributions reveal which planetary influences dominate" | math | WRONG | Y | The shown transition matrix has a uniform stationary distribution; unequal dasha durations require a different time-weighted model. |
| L110 | "Absorption probabilities (in the nested sub-period chains)" | math | WRONG | Y | The post says these reveal stabilization but defines no absorbing states; it explicitly says every state transitions onward. |
| L110 | "The mathematical parallel is not decorative" | math | WRONG | N | This repeats the load-bearing identity claim from the frontmatter. |
| L110 | "Mean first passage times reveal how long it takes to transition" | math | DECORATIVE | N | Passage time is valid chain background, but this fixed schedule already determines durations and the phrase is removable. |
| L116 | "a formal specification of temporal state evolution" | math | DECORATIVE | N | Fair description, but removable because the fixed schedule and state representation are already demonstrated. |
| L116 | "a perfectly respectable Markov chain" | math | WRONG | N | This repeats the load-bearing identity claim from the frontmatter. |
| L120 | "the transition matrix beneath the tradition" | math | DECORATIVE | N | Correct conclusion, but removable because L55 and L68 already construct the embedded chain and matrix. |

## Summary
- Science references: 12 (ALIGNED 6, GROUNDED-OBSERVATIONAL 0, AUTHORITY-BORROWED 0, CONTESTED-AS-FACT 2, FABRICATED 4, INVERTED 0)
- Math references: 32 (INTEGRATED 9, DECORATIVE 6, WRONG 17)
- Dross findings (failing verdicts): 29 total (14 load-bearing)
- **Nigredo verdict:** MAJOR DROSS

## One-Line Note
The fixed 120-year arithmetic, Markov definition, and 0/1 successor matrix support an embedded deterministic cycle, but elapsed holding time makes the full schedule semi-Markov; the post invents stochastic subperiod probabilities, misdefines ergodicity, imports Lorenz sensitivity, and supplies four FABRICATED history/source claims, preserving later RUBEDO manual routing while Nigredo remains MAJOR DROSS.
