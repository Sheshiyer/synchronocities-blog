# Image Pipeline Reference — brandmint + FAL AI

Technical reference for generating editorial images within the noesis-writer-skill.

---

## Prerequisites

1. `FAL_KEY` environment variable must be set
2. brandmint installed at `/Volumes/madara/2026/Projects/thoughtseed/brandmint-oracle-aleph`
3. Style reference images available in `/Volumes/madara/2026/Projects/thoughtseed/brandmint-oracle-aleph/references/images/`

## Provider Setup

```python
import sys
sys.path.insert(0, "/Volumes/madara/2026/Projects/thoughtseed/brandmint-oracle-aleph")
from brandmint.core.providers.fal_provider import FalProvider

provider = FalProvider()
```

## Model Selection

| Task | Model | Endpoint |
|------|-------|----------|
| Editorial typographic posters | Nano Banana Pro | `fal-ai/nano-banana-pro` |
| Clean text rendering, products | Flux 2 Pro | `fal-ai/flux-2-pro` |
| Vector icons, engine cards | Recraft V3 | `fal-ai/recraft/v3/text-to-image` |

**Default for content images:** Nano Banana Pro (supports style references via `image_urls`)

## Style Reference Library (Amir Musich)

Primary anchors — pick 2 per generation batch for consistency:

| File | Style |
|------|-------|
| `ref-tw-009-AmirMushich-graphic-design-smart-prompt.jpg` | Bold typographic poster, high contrast |
| `ref-tw-201-AmirMushich-nano-banana-smart-prompt-font.jpg` | Text masking, images through letterforms |
| `ref-tw-220-AmirMushich-be-typography-designer-drive.jpg` | Typography-as-design, driver aesthetic |
| `ref-tw-221-AmirMushich-easy-text-masking-workflow-ai.jpg` | Text masking workflow, clean execution |
| `ref-tw-119-AmirMushich-nano-banana-smart-prompt.jpg` | Smart prompt composition |
| `ref-tw-200-AmirMushich-nano-banana-smart-prompt.jpg` | Nano Banana Pro optimized |
| `ref-tw-214-AmirMushich-nano-banana-smart-prompt.jpg` | Variant composition |
| `ref-tw-216-AmirMushich-prompt-access-nano-banana-here.jpg` | Access/portal aesthetic |
| `ref-tw-217-AmirMushich-prompt-access-nano-banana-here.jpg` | Portal variant |
| `ref-tw-227-AmirMushich-weeks-prompting-amp-chatting.jpg` | Refined iteration style |

**Recommended default pair:**
```python
style_refs = [
    "/Volumes/madara/2026/Projects/thoughtseed/brandmint-oracle-aleph/references/images/ref-tw-009-AmirMushich-graphic-design-smart-prompt.jpg",
    "/Volumes/madara/2026/Projects/thoughtseed/brandmint-oracle-aleph/references/images/ref-tw-201-AmirMushich-nano-banana-smart-prompt-font.jpg",
]
```

## Generation Parameters

### Nano Banana Pro

```python
result = provider.generate(
    prompt=prompt_text,
    model="fal-ai/nano-banana-pro",
    output_path="path/to/output.png",
    image_urls=style_refs,        # List of local paths — auto-uploaded by provider
    aspect_ratio="16:9",          # "16:9", "3:4", "1:1", "4:3", "9:16"
    resolution="2K",              # "1K", "2K"
    output_format="png",          # "png", "jpeg"
)
```

**DO NOT use with Nano Banana Pro:** `width`, `height`, `guidance_scale`, `num_steps` — these are Flux/Recraft params.

### Flux 2 Pro

```python
result = provider.generate(
    prompt=prompt_text,
    model="fal-ai/flux-2-pro",
    output_path="path/to/output.png",
    image_size="landscape_16_9",  # "landscape_16_9", "square_hd", "portrait_4_3"
    num_images=1,
)
```

### Recraft V3

```python
result = provider.generate(
    prompt=prompt_text,
    model="fal-ai/recraft/v3/text-to-image",
    output_path="path/to/output.png",
    style="vector_illustration",  # or "digital_illustration", "line_circuit"
    colors=["#C5A017", "#2D0050", "#070B1D"],  # Brand palette
)
```

## Brand Color Palette for Prompts

Always reference these in prompt text for color accuracy:

```
Background:       Void Black    #070B1D  (or "deep navy-black, near void")
Primary accent:   Sacred Gold   #C5A017  (or "warm bronze-gold, not luxury gold")
Observer state:   Witness Violet #2D0050 (or "deep purple-violet, not neon")
Flow state:       Flow Indigo   #0B50FB  (or "electric cobalt blue")
Completion:       Coherence Emerald #10B5A7 (or "teal-emerald, not mint")
Text:             Parchment     #F0EDE3  (or "warm off-white, aged paper")
Metadata:         Muted Silver  #8A9BA8  (or "cool grey-blue")
```

## Prompt Template

```
Bold editorial typographic poster, Amir Musich aesthetic.
Oversized text "[HEADLINE — 1-2 WORDS]" in bold geometric sans-serif,
text-masked revealing [FILL IMAGERY — what shows through the letters].
[COLOR DIRECTIVE — which brand colors dominate].
[COMPOSITION — POV angle, framing, depth].
[TEXTURE/DETAIL — sacred geometry, neural pathways, organic circuits, etc].
Small serial number "TN-[CODE] / tryambakam.space" in muted silver at bottom edge.
8K detail, photorealistic rendering, volumetric lighting, cinematic depth of field.
```

## Article Image Planning Template

| # | Position | Aspect | Headline | Fill Imagery | Accent Color |
|---|----------|--------|----------|-------------|-------------|
| 01 | Header | 16:9 | [TITLE] | [Scene matching article theme] | Sacred Gold |
| 02 | After §I | 3:4 | [CONCEPT] | [Visual for section topic] | Witness Violet |
| 03 | After §III | 3:4 | [CONCEPT] | [Visual for section topic] | Flow Indigo |
| 04 | After §VI | 3:4 | [CONCEPT] | [Visual for section topic] | Coherence Emerald |
| 05 | After §XI | 3:4 | [CONCEPT] | [Visual for section topic] | Sacred Gold |
| 06 | Closing | 16:9 | [BRAND/QUINE] | [Recursive/completion imagery] | All five colors |

## Output Directory Convention

```
/Volumes/madara/2026/Projects/tryambakam-noesis/content-engine_processing/{article-slug}-images/
├── 01-header-{slug}.png
├── 02-{section-name}-{slug}.png
├── 03-{section-name}-{slug}.png
├── ...
└── placement-guide.md
```

## Troubleshooting

- **FAL_KEY not found**: Export via `export FAL_KEY=your_key_here`
- **Style refs not uploading**: Ensure paths are relative to CWD or absolute
- **Queue timeout**: FAL uses queue-based generation. Default poll interval is fine. Increase timeout for large batches.
- **Color mismatch**: AI models interpret hex loosely. Use both hex AND natural language color description in prompt.
- **Text not rendering in image**: Nano Banana Pro handles text better than Flux. For critical text, use Flux 2 Pro as fallback.
