# Vault Source Mining Guide

How to find high-value source material in the PARA vault for content creation.

---

## PARA Structure Map

```
01-Projects/tryambakam-noesis/   → PM stubs only (see _PORTFOLIO-MOC.md)
/Volumes/madara/2026/Projects/tryambakam-noesis/  → Working code (canonical)
/Volumes/madara/2026/Projects/thoughtseed/          → Thoughtseed portfolio (external)
02-Areas/        → Ongoing domains (Consciousness-Models, Pattern-Studies, Muse-Enneagram, TWC-Brand)
03-Resources/    → Reference library (Authors, Video-Analysis, Content, Synthesis, Books, Courses)
04-Archives/     → Completed/dormant material
```

## Root-Level MOCs (Maps of Content)

Start here for any topic — these are the master indexes:

| MOC | Content | Best For |
|-----|---------|----------|
| `Books-Master-Index.md` | 6,011 indexed books, Enneagram-classified | Finding specific authors/works, citing library depth |
| `Consciousness-Library-Index.md` | Consciousness studies corpus | Gebser, Whitehead, Grof, Steiner, Wilber |
| `Bio-Circuitry-MOC.md` | Bioelectronics, somatic systems | Body-as-technology content, Ba-focused pieces |
| `Consciousness-Noesis-MOC.md` | Noesis Engine architecture | Engine-specific content, Kha-focused pieces |
| `Enneagram-Orchestration-MOC.md` | 9-type + Muse + hormone system | Enneagram-Muse-Endocrine content |
| `Technical-Mystical-MOC.md` | Tech ↔ mystical bridges | Cross-domain synthesis content |
| `Somatic-Narrative-MOC.md` | Somatic Canticles + body narratives | Creative writing, embodiment |
| `Critical-Thinking-Library-Index.md` | Logic, rhetoric, epistemology | Grounding claims, intellectual rigor |
| `Health-Library-Index.md` | Health, biohacking, chronobiology | Jack Kruse, quantum biology, breathwork |
| `Occult-Library-Index.md` | Western esotericism, Qabalah | Dion Fortune, GRS Mead, Gnostic material |
| `Skills-Development-Library-Index.md` | Learning theory, skill acquisition | Meta-learning content |
| `Technology-Library-Index.md` | Tech, AI, computational theory | Technical content, engineering bridges |

## Key Author Directories

```
03-Resources/Authors/
├── Michael-Tsarion/    → Symbolic lens, tarot, Inner Zodiac, Dragon Mother
├── James-True/         → Cosmology as substrate, three kingdoms, Oracle of Mythology
├── Jean-Gebser/        → Ever-Present Origin, consciousness structures
├── Whitehead/          → Process philosophy, prehension
├── Rupert-Sheldrake/   → Morphic resonance, formative causation
├── Mark-Passio/        → Natural law, occult disclosure
├── Tom-Montalk/        → Gnosis, demiurgic systems
└── [others]
```

## Key Analysis Collections

```
03-Resources/Video-Analysis/
├── SlickDissident/     → Muse-endocrine, tarot-cinema, prime matrices, etymology
├── TheWholeCritter/    → Gebser, Whitehead, Sheldrake, EPO, morphic resonance
├── MarkPassio/         → Natural law, occult knowledge
└── [others]

03-Resources/Content/
├── Articles/Substack/  → Published Substack content
├── Source-Materials/    → Raw source texts
└── Transcripts/        → Processed transcripts
```

## Travel Log Archives

```
03-Resources/Synthesis/
├── Fools-Journey-*     → 8 files: Shenzhen through Bangkok/Samui
├── Mythic-Journey-*    → 9 files: Bangkok quake through World card
├── Mythic-Journey-HD-Integration-Map.md  → Master synthesis
└── Travel-Log-Index.md → Complete index
```

## Mining Strategy

### For a specific topic:
1. `grep -r "topic_keyword" *.md` across MOC files
2. Follow wikilinks into `02-Areas/` for frameworks
3. Pull direct quotes from `03-Resources/Authors/` or `Video-Analysis/`
4. Cross-reference `Books-Master-Index.md` for library depth stats

### For a specific author:
1. Check `03-Resources/Authors/{name}/` for article collection
2. Check `03-Resources/Video-Analysis/` for transcript analyses
3. Check `Books-Master-Index.md` for their indexed works
4. Check MOCs for cross-references

### For lived experience:
1. Travel logs in `03-Resources/Synthesis/Fools-Journey-*` and `Mythic-Journey-*`
2. Personal notes in `02-Areas/`
3. Daily ritual logs if available

---

## Critical Rule

**NEVER reference "the vault" in reader-facing content.**

The vault is infrastructure. The reader sees:
- Author names and specific works
- Direct quotes with attribution
- Lived experience described in first person
- Framework concepts (Kha-Ba-La, etc.) presented as original architecture

Replace any vault reference with the actual source:
- ❌ "In the vault, Tsarion's work is classified as..."
- ✅ "Tsarion's *Egyptian Origin of the Tarot* demonstrates..."
- ❌ "Seventeen files indexed across consciousness studies..."
- ✅ "Across the four-part Ever-Present Origin series, Gebser demonstrates..."
