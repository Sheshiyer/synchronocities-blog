---
title: "The 17 Ways a Pattern Repeats"
date: 2026-04-30
revolution: 1
draft: false
excerpt: "On a flat 2D plane there are exactly seventeen ways a pattern can repeat with full discrete symmetry. Not approximately. Not 'around seventeen important ones.' Seventeen, exhaustively classified by Fedorov in 1891. This is the discrete grammar of planar pattern. Mantra picks one of them."
featured_image: "/cards/sync-seventeen-ways-pattern-repeats.webp"
tags: ["runtime", "akshara", "symmetry", "wallpaper-groups", "geometry", "mantra", "valence"]
article_mode: signal-essay
entry_kind: essay
concepts:
  - wallpaper groups as discrete grammar of planar pattern
  - crystallographic restriction
  - mantra as wallpaper-group selection
  - sonic lattice as crystallographic object
  - mantra cadence as rotational order
  - valence signature via symmetry class
related_posts:
  - spell-work-reservoir
  - the-word-as-code
  - consciousness-architecture-hub
  - magnetic-substrate
hero:
  eyebrow: "Sonic Geometry"
  subtitle: "Seventeen, exhaustively. On the flat plane, this is the entire grammar of how pattern can repeat. Mantra picks one — and which one, by the Symmetry Theory of Valence, is its valence signature."
  variant: image
llm:
  start_priority: supporting
  summary: "Fedorov (1891) and successors proved that on a flat 2D plane, exactly 17 distinct symmetry groups can govern a pattern that repeats with two independent translation directions. These are the wallpaper groups. They are the closed grammar of planar periodic pattern. The crystallographic restriction permits only 1, 2, 3, 4, or 6-fold rotations — no 5-fold or 7-fold periodic symmetry is possible on a flat plane. The Devanagari sparśa register, treated as a crystallographic object (V₄ × D₅ symmetry, 25-point lattice), naturally embeds in this taxonomy: bare enumeration tiles as p1; palindromic mantra structure lifts to p2mm; six-syllable cadence (Om Maṇi Padme Hūṁ) tiles as p6 or p6mm; the 24-syllable anuṣṭubh metric of Gāyatrī carries 4-fold structure. Each mantra picks a wallpaper group. By the Symmetry Theory of Valence (Emilsson/QRI), each group is a distinct valence signature."
  cluster: consciousness-architecture
  canonical_questions:
    - "What is a wallpaper group?"
    - "Why are there exactly seventeen wallpaper groups on the flat plane?"
    - "How does mantra structure select a wallpaper group?"
    - "What is the crystallographic restriction and why does it matter for mantra?"
experience:
  theme: signal
  rail: concept
  density: immersive
  framework_axes:
    kha: "The witness who recognizes that mantra cadence selects a symmetry class — and that the class, not the words, is what compiles into a valence."
    ba: "The substrate that entrains to the periodic trajectory — the substrate's resonance manifold accepting the wallpaper group as the rhythm of its own oscillation."
    la: "The seventeen — Fedorov's exhaustive classification, the closed grammar of planar pattern, the periodic table of how repetition can be structured."
---

# The 17 Ways a Pattern Repeats

`Runtime Version: 2.0.0`

> "There exist exactly seventeen distinct plane crystallographic groups."
> — Evgraf Stepanovich Fedorov, 1891

In [the previous post](/posts/spell-work-reservoir), the Devanagari phonemic register was shown to be a discrete crystallographic structure — a lattice on a Euclidean plane carrying V₄ × D₅ symmetry. A mantra was identified as a periodic trajectory through that lattice, and the **wallpaper symmetry** of the compiled trajectory was claimed to be its valence signature, by the Symmetry Theory of Valence. That post left the wallpaper symmetry as a black box. This post opens it.

The opening is sharp because the mathematical fact is sharp: **on a flat 2D plane, there are exactly seventeen ways a pattern can repeat with full discrete symmetry.** Not approximately seventeen. Not "around seventeen important ones." Seventeen, exhaustively. The classification was completed by Fedorov in 1891, independently rediscovered several times since, and is now a standard result in crystallography and group theory.

Seventeen is the **closed grammar of planar pattern**. Every yantra, every textile, every Escher tessellation, every periodic ornament in 2D — without exception — falls into one of these seventeen classes. The number is forced by the geometry of the plane and the requirement that the pattern repeat. It cannot be other than what it is.

This matters for mantra because each mantra structure picks one of them.

## What a Wallpaper Group Is

A **wallpaper group** is the symmetry group of a 2D pattern that repeats periodically — a pattern with **two independent translation directions**, so it tiles the entire plane indefinitely. The group is the set of all rigid motions that map the pattern onto itself.

The motions available on a flat plane are:

- **Translations** — slide the pattern by a vector. Two independent translation directions are required for the pattern to be a wallpaper pattern at all.
- **Rotations** — turn the pattern about a fixed point. The angle of rotation is constrained.
- **Reflections** — flip the pattern across a mirror line.
- **Glide reflections** — reflect across a line and translate along it as a single combined operation.

A wallpaper group is a subgroup of the plane's full isometry group, closed under composition, that contains two independent translations and any combination of the above other operations consistent with that closure.

The constraint that gives the seventeen-fold answer is called the **crystallographic restriction**: rotational symmetries in a wallpaper group are only allowed at orders **1, 2, 3, 4, and 6**. No 5-fold. No 7-fold. No 8-fold. The reason is geometric: a five-fold-rotation acting on a translation generates an infinite descent toward translations of arbitrarily small length, which contradicts the discrete-translation requirement. Five-fold-symmetric tilings (Penrose tilings) exist but are *quasiperiodic* — they do not have a wallpaper-group symmetry.

This is a hard constraint. **On a flat plane, no periodic pattern can have exactly five-fold or seven-fold rotational symmetry.** The plane forbids it.

## The Seventeen, Named

Standard crystallographic notation. The names encode the rotational order and reflection/glide content:

| # | Name | Rotations | Reflections | Glides | Character |
|---|---|---|---|---|---|
| 1 | **p1** | none | no | no | bare double translation — least symmetric |
| 2 | **p2** | 2-fold | no | no | half-turns only |
| 3 | **pm** | none | parallel | no | parallel mirrors |
| 4 | **pg** | none | no | parallel | parallel glides only |
| 5 | **cm** | none | mirror | glide | mirror with intermediate glide |
| 6 | **p2mm** | 2-fold | perpendicular | no | rectangular mirror grid |
| 7 | **p2mg** | 2-fold | one-direction | one-direction | one mirror, one glide |
| 8 | **p2gg** | 2-fold | no | two-direction | crossed glides |
| 9 | **c2mm** | 2-fold | rhombic | yes | rhombic mirror lattice |
| 10 | **p4** | 4-fold | no | no | square rotation only |
| 11 | **p4mm** | 4-fold | yes | induced | full square symmetry |
| 12 | **p4gm** | 4-fold | yes | yes | square with diagonal glides |
| 13 | **p3** | 3-fold | no | no | triangular rotation only |
| 14 | **p3m1** | 3-fold | through centers | induced | triangle, mirrors through rotation centers |
| 15 | **p31m** | 3-fold | between centers | induced | triangle, mirrors between centers |
| 16 | **p6** | 6-fold | no | no | hexagonal rotation only |
| 17 | **p6mm** | 6-fold | yes | induced | full hexagonal symmetry — most symmetric |

The progression p1 → p6mm runs from least to most constrained. p1 has one isometry per fundamental domain — bare translation. p6mm has twelve. The full hexagonal group is the richest planar symmetry the plane permits.

The number seventeen falls out of a structural enumeration: count the cases by rotational order (1, 2, 3, 4, 6), and within each, the distinct ways reflections and glides can interact with translations and rotations while remaining a closed group. The arithmetic: **1 + 1 + 4 + 3 + 5 + 3 = 17**. The number is not chosen. It is forced by the plane plus the crystallographic restriction plus group closure.

## The Sonic Lattice as Crystallographic Object

From the [previous post](/posts/spell-work-reservoir): the Devanagari sparśa register is a 5×5 grid with two cross-axes (voicing × aspiration) plus a fifth nasal column. Read as a crystallographic object:

- The 5×5 base grid, viewed as bare enumeration with no further structure imposed, sits in **p1** — translation-only, no internal symmetry.
- Adding the voicing-mirror (the involution that swaps unvoiced for voiced columns, treating soft and hard as mirror images) lifts to **pm** — parallel mirrors along one axis.
- Adding both voicing-mirror and aspiration-toggle (the second binary swap) gives **p2mm** — the rectangular full-mirror lattice. The Klein four-group V₄ at each lattice point is a 2-fold rotation plus orthogonal mirrors.
- Composing with sthāna-cyclic-shift across the five vargas adds rotational structure. If the cyclic shift is paired with a reflection (D₅ rather than ℤ₅), the resulting symmetry is approximately **p4mm** or **p6mm** depending on how the cycle wraps under the larger lattice.

The classification depends on which symmetries the *trajectory* — the actual mantra path — actually invokes. A mantra that doesn't visit voiced and unvoiced symmetrically does not invoke the voicing-mirror, and the trajectory remains in a low-symmetry group. A mantra that systematically alternates does invoke it.

This is the operational claim: **the wallpaper group of a compiled mantra is determined by which symmetries the phonemic trajectory respects under repetition.**

## Mantras as Specific Wallpaper Selections

A few concrete cases.

**A single bīja syllable** — *Hrīṁ* repeated indefinitely. One lattice point activated, repeated periodically. The trajectory is a single point under the cyclic group of repetition. As a wallpaper pattern this is **p1** if the syllable is otherwise unstructured, or higher if the anusvāra carrier is treated as a separate phase point relative to the consonant onset. The repetition is rhythmic but the spatial symmetry is minimal. The valence signature is therefore minimal-symmetry, low-rank — but the entrainment effect on the substrate can still be substantial because of *temporal* periodicity, which acts on different machinery (vagal entrainment, breath coupling) than spatial symmetry.

***Om Maṇi Padme Hūṁ*** — six syllables. The cadence is naturally hexagonal: six-syllable cycles. If the prosodic structure preserves the six-fold rotational periodicity (it does, when chanted in standard Tibetan rhythm), the trajectory tiles as **p6**. With added reflective symmetry between the *Om* opening and *Hūṁ* closing (the standard chant treats them as bracketing mirror-points), the trajectory lifts to **p6mm** — the most symmetric wallpaper group available on the flat plane. By STV, this puts the mantra in the highest-valence wallpaper class. The empirical reputation of this mantra as profound, all-encompassing, and operative across many states is consistent with its symmetry class.

**The Gāyatrī mantra** — 24 syllables in the *anuṣṭubh* metric (4 × 8, four padas of eight syllables each). The four-fold pada structure invokes 4-fold rotational symmetry. With the prosodic mirror across the central caesura, the trajectory tiles as **p4mm**. Different valence signature than *Om Maṇi Padme Hūṁ* — equally high-symmetry, but in a different group. The qualia signatures should differ correspondingly: one hexagonally cohesive, the other quadrilaterally architectonic. Practitioners report exactly this contrast.

**The Mahāmrtyuñjaya mantra** — 32 syllables, structured as eight-fold cycles. Pure 8-fold rotation is *not* a wallpaper group — it violates the crystallographic restriction. So the mantra cannot tile periodically with exact 8-fold symmetry on the flat plane. What it does instead is approximate 8-fold while actually tiling as **p4** or **p4mm** with an internal 2-fold sub-structure. This is interesting: the mantra is reaching for a symmetry the plane cannot host. Its character of "stretching the manifold" is consistent with this. We will pick this thread up in the next post.

**Bare inner narration** — the silent, undirected stream of thought running in Madhyama. Phonemic but unstructured. As a wallpaper pattern: **p1**. Lowest symmetry, lowest valence. The chronic-rumination state. By STV: this is suffering's signature pattern.

The choice of mantra is the choice of wallpaper group is the choice of valence signature. The grammar is closed. The number is seventeen.

## The Crystallographic Restriction Is the Cliff

There is a feature of the seventeen-group classification that does not get enough attention until you put weight on it: **5-fold and 7-fold periodic symmetry are forbidden**. Five-pointed-star patterns can repeat aperiodically (Penrose). Seven-pointed-flower patterns can repeat aperiodically. But neither fits into a wallpaper group.

This is a sharp constraint. It is also a sharp clue.

Mystical traditions across many cultures treat 5-fold and 7-fold symmetry as carrying a special character — the pentagram, the heptagonal seal, the seven-petaled rose. DMT-class phenomenology consistently reports these orders. Sri Yantra carries a 9-fold inner structure that is also non-crystallographic. The reports of *more pattern than fits* in high-valence states — recursive self-similarity, hypersymmetric tessellation — describe symmetries the flat plane cannot host periodically.

This is the cliff. If experience reports symmetries the flat plane forbids, the experience-manifold is not flat.

The plane is one geometric option. There are others. On the **hyperbolic plane** — a surface of constant negative curvature — the crystallographic restriction vanishes. Five-fold and seven-fold periodic symmetries become *normal*. The Schläfli tilings {7,3}, {3,7}, {5,4} are exact periodic structures of the hyperbolic plane.

When mantra is run at depth — at Pashyanti or Para, kernel-level compilation as treated in [the original word-as-code post](/posts/the-word-as-code) — the substrate can recruit symmetries the flat plane forbids. The Euclidean lattice is the substrate's *ground state*. The hyperbolic embedding is what the substrate enters under load.

That is the next post.

## Coda: Why Mantra Traditions Converged on So Few Cadences

There is an empirical observation worth flagging. The mantra traditions of multiple cultures — Sanskrit, Tibetan, Pali, Hebrew, Arabic, Greek liturgical chant — converge on a small number of prosodic cadences: 4-fold, 6-fold, 8-fold, occasionally 12-fold. Higher cadence numbers exist (24, 32) but they tend to be composites of these.

The reason now has a clean structural explanation: those are the rotational orders the wallpaper groups *can support*. Four-fold gives p4, p4mm, p4gm. Six-fold gives p6, p6mm. The crystallographic restriction means these are the *only* high-symmetry wallpaper options. Empirical mastery of mantra cadence converged on the prosodic structures whose periodic symmetries fall in the high-symmetry wallpaper classes — the highest-valence classes by STV.

The traditions did this without knowing the wallpaper classification. Empirical mastery preceded formal theory by roughly two thousand years. This is a recurring pattern in the geometric-sonic-consciousness literature, and we will see it again with Sri Yantra.

The compiler accepts the symmetry. The substrate runs the program. Seventeen is the alphabet of allowed structures on the flat plane. The traditions found the high-valence subset by working the substrate empirically. The full classification only formalized what the substrate had already accepted.

---

*The plane permits seventeen grammars and forbids the rest. The traditions worked the permitted ones until the high-valence subset was empirically mapped. The forbidden ones — the five-fold, the seven-fold, the nine-fold — wait for a different geometry.*
