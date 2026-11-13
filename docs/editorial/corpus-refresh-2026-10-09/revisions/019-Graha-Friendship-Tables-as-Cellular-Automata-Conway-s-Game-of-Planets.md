---
title: 'Graha Friendship Tables as Cellular Automata: Conway''s Game of Planets'
date: 2025-12-10T00:00:00.000Z
excerpt: The Vedic planetary friendship matrix operates like cellular automata rules — a 9x9 grid of relationships where Friend, Neutral, and Enemy states evolve through neighborhood logic identical to Conway's Game of Life.
featured_image: /cards/sync-graha-automata.webp
tags:
  - lorenz-kundli
  - graha
  - cellular-automata
  - vedic
  - cluster:lorenz-kundli
draft: false
revolution: 1
related_posts:
  - lorenz-kundli-system-index
article_mode: research-essay
entry_kind: essay
concepts:
  - lorenz kundli
  - graha
  - cellular automata
  - vedic
llm:
  cluster: lorenz-kundli
---

# Graha Friendship Tables as Cellular Automata: Conway's Game of Planets

`Runtime Version: 1.0.0`

> "Every relationship is a rule. Every rule produces a pattern. Every pattern reveals architecture."
> — Systems Architect's Proverb

## The Mod 9 Matrix

In Vedic astrology, the nine grahas maintain a fixed matrix of relationships — friendships, enmities, and neutralities that determine how planetary energies interact within a birth chart. I want to read that relationship table as material for a rule set. To make it an automaton, I still have to specify states, neighbourhoods and an update rule.

The Graha friendship matrix is a 9x9 adjacency table where each cell contains one of three values: Friend (5), Neutral (4), or Enemy (0). The values encode the categories in this proposed model. They are not measurements of interference between planetary fields.

This matrix is my adapted composite — the classical Parāśari naisargika table doesn't carry Rahu/Ketu rows; I've extended it for the automaton.

```python
class GrahaMatrix:
    def __init__(self):
        self.planets = ['Sun', 'Moon', 'Mars', 'Mercury',
                        'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']
        self.matrix = np.array([
            [5, 4, 5, 4, 5, 0, 0, 4, 4],  # Sun
            [4, 5, 4, 4, 4, 5, 0, 4, 4],  # Moon
            [5, 4, 5, 4, 5, 0, 0, 4, 4],  # Mars
            [5, 4, 4, 5, 4, 5, 4, 4, 4],  # Mercury
            [5, 4, 5, 4, 5, 0, 0, 4, 4],  # Jupiter
            [0, 5, 0, 5, 0, 5, 5, 4, 4],  # Venus
            [0, 0, 0, 4, 0, 5, 5, 4, 4],  # Saturn
            [4, 4, 4, 4, 4, 4, 4, 5, 5],  # Rahu
            [4, 4, 4, 4, 4, 4, 4, 5, 5],  # Ketu
        ])
```

Look at this matrix through a programmer's eyes. Sun and Mars are mutual friends (5,5). Sun and Saturn are mutual enemies (0,0). In the displayed Mercury row, Sun, Mercury and Venus have weight 5; the other entries, including Moon, have weight 4. Rahu and Ketu maintain universal neutrality with a private mutual friendship. These are not random assignments — they are topological constraints on a relational graph.

## From Matrix to Automaton

John Conway's Game of Life operates on a simple principle: each cell on a grid examines its neighbors, applies a fixed rule set, and determines its next state. A dead cell with exactly three live neighbors becomes alive (birth). A live cell with two or three live neighbors survives. All other cells die.

The Graha friendship matrix encodes analogous rules. Each planet's row defines its neighborhood response function — which planetary neighbors produce constructive states (friendship/survival), which produce neutral states (stasis), and which produce destructive states (enmity/death).

```python
class PlanetaryAutomata:
    def __init__(self, graha_matrix):
        self.matrix = graha_matrix
        self.rules = self._derive_rules()

    def _derive_rules(self):
        rules = {}
        for i, planet in enumerate(self.matrix.planets):
            neighborhood = self.matrix.matrix[i]
            rules[planet] = {
                'survive': np.where(neighborhood >= 4)[0],
                'birth': np.where(neighborhood == 5)[0]
            }
        return rules
```

When you place planets in houses and apply these rules iteratively, patterns emerge. Friendly planets in adjacent houses amplify each other's influence — constructive interference. Enemy planets in aspect create destructive interference patterns. The chart is not a static snapshot; it is a cellular automaton frozen at a particular generation.

## Emergent Complexity from Simple Rules

The profound insight of cellular automata research — demonstrated by Stephen Wolfram's exhaustive classification — is that simple local rules produce complex global behavior. Rule 110, one of the simplest one-dimensional cellular automata, is Turing complete. The universe's computational capacity emerges from the simplest possible interactions.

The proposed Graha model starts with nine planets, three relationship types and a fixed table. Whether its update rules produce interesting behaviour has to be demonstrated. Yet the combinatorial space of possible charts — planets distributed across twelve houses with these friendship rules active — produces a pattern space of staggering complexity. Different initial charts could be compared under the same specified rules; their evolution is a result to compute, not assume.

```python
def evolve_planetary_state(current_state, rules, steps=1):
    state = current_state.copy()
    for _ in range(steps):
        new_state = np.zeros_like(state)
        for i in range(len(state)):
            neighbors = get_neighbor_values(state, i)
            new_state[i] = apply_rules(state[i], neighbors, rules)
    return new_state
```

Conway’s gliders, oscillators and still lifes give me a vocabulary to try against chart interpretation. I place yogas beside still lifes, dashas beside oscillators, transits beside gliders. Whether those pairings survive a specified update rule is the next question for the model.

## The Asymmetry Problem

One detail that separates the Graha matrix from naive cellular automata: the friendship relationships are not always symmetric. Mercury considers Venus a friend, and Venus considers Mercury a friend — symmetric. But the Sun considers Saturn an enemy, while Saturn considers the Sun merely neutral in some classical texts. This asymmetry introduces directional dynamics that standard cellular automata lack.

In computational terms, this makes the Graha automaton more akin to a directed graph cellular automaton — each edge carries a direction and a weight. The resulting dynamics are richer than Conway's undirected neighborhood model. Information flows differently depending on which planet is the observer and which is the observed. This is relational computation: the result depends not just on state but on perspective.

## Pattern Stability and Field Coherence

A Graha automaton would let us ask about stability. Which initial configurations persist under the chosen update rule? I would begin by testing the combinations called Raj Yogas and Dhana Yogas, rather than declaring them attractors before running the model.

An oscillating configuration would be another result to look for: a state that returns after a defined number of updates. That recurrence could then be compared with the periods used in a chart reading. Calling a life an oscillator would go further than the model permits.

Enemy relationships suggest another test case: do they make the proposed automaton settle, cycle or keep changing? The result would describe the rule set we built. Reading upheaval into a life would require a separate argument.

## Reading the Source Code

The Graha friendship matrix gives this proposed automaton its lookup table. What draws me is the possibility of a sparse rule set producing elaborate patterns. The work begins where the analogy becomes inconvenient: choosing a neighborhood, defining an update and finding out what the grid actually does.

A chart gives me one proposed starting state. Transits and dashas would then need distinct operations before I could watch the grid move. Until those choices are made, the automaton remains on the drawing board.

---

*This document is part of the Lorenz-Kundli Pattern Recognition series exploring mathematical-mystical parallels across the pattern space of consciousness.*
