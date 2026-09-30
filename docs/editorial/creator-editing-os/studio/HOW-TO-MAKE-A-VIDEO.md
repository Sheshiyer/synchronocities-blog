# How to Make a Video

One plain page. No jargon.

---

## Create a new video

```
npm run new-video my-video-name --type talking
```

This creates every folder you need, opens the footage folder, and writes
`assets/projects/my-video-name/job-config.json` (duration placeholder — filled in by prep).

For a travel montage: `--type montage` instead.

---

## Prepare your footage

```
npm run prep my-video-name
```

This probes every clip (codec, HDR, VFR), converts anything unusual to a clean
working copy, and writes `work/my-video-name/prep/PREP.md` with a plain-English report.

Open `PREP.md` and read it. It tells you if anything was converted and flags problems.

**Transcription** is NOT automatic. Options:
1. **Plan A (SRT)**: Export captions from CapCut, DaVinci Resolve or YouTube Studio
   as an `.srt` file. Drop it in the footage folder. Timestamps must be set manually.
2. **Plan B (Whisper)**: Install via `npx @remotion/install-whisper-cpp` (ask Claude first —
   it will tell you the download size and model choices). Automated transcription does NOT
   guarantee word accuracy; always verify against your script.

---

## Fill the brief

Open `assets/projects/my-video-name/BRIEF.md`.
Fill in: your script, the moments you want, any references, and don't-wants.

Send this to Claude:
> "Start a new video called my-video-name. The brief is in assets/projects/my-video-name/BRIEF.md."

---

## Watch the draft

```
npm run ingest-draft my-video-name --fixture /path/to/clip.mp4 [--srt /path/to/captions.srt]
```

This ingests the fixture, runs prep, mirrors it to `public/projects/my-video-name/` for
staticFile(), renders the **named job composition** (`MyVideoNameVertical`), muxes original
audio at fixed gain, and produces first/middle/last stills. Hard fails on any error.

Output lands in `out/my-video-name/`:
- `my-video-name-draft-9x16.mp4` — rendered draft with audio
- `stills/` — first, middle, last frames

Watch from start to finish like a viewer, then again pausing wherever something bothers you.

Write notes in this format:
```
Notes on the draft:
- [0:04] the headline arrives late. It should land when I say "[word]".
- [0:17] the screenshot is too zoomed in.
- [0:31] captions cover my chin. Move them lower.
```

Send all notes at once. Claude fixes only those.

---

## Final render

```
npm run render-final my-video-name --format=9:16
npm run render-final my-video-name --format=16:9
npm run render-final my-video-name --format=both
```

Or let Claude run it: "Draft approved. Render final for my-video-name in 9:16."

Close other apps before rendering — it uses a lot of memory.

---

## Finished files

All finished files land in `out/my-video-name/`:

| File | What it is |
|------|-----------|
| `*-final.mp4` | The video to post — picture + sound mixed |
| `*-picture.mp4` | Picture-only (silent) backup |
| `voice.wav` | Your original voice, untouched |
| `sfx.wav` | Sound effects only |
| `SFX-CUES.txt` | Numbered, timecoded list of every sound effect |

Send the final to your phone (AirDrop or cable) and watch it full screen before posting.

---

## Stills on demand

```
npm run stills SyntheticTestVertical --key
npm run stills MyVideoVertical --every=15
npm run stills MyVideoVertical --frames=0,90,150
```

`--key` renders frame 0, middle, and last. Results go to `work/stills/<CompositionId>/`.

---

## Command contract (controller reference)

| Step | Command | Notes |
|------|---------|-------|
| Create | `npm run new-video <name> [--type talking\|montage]` | Creates folders + `job-config.json` |
| Prep | `npm run prep <name>` | Probes/converts footage, writes PREP.md |
| Ingest + draft | `npm run ingest-draft <name> --fixture <path> [--srt <path>]` | Real named-job render, muxed audio, stills |
| Stills only | `npm run stills <CompositionId> --key` | First/middle/last frames |
| Final | `npm run render-final <name> [--format=9:16\|16:9\|both]` | Production render with audio pipeline |
| Check | `npm run check` | TypeScript + motion-lint |
| Test | `npm test` | All unit tests |

**Composition ID convention:** `<PascalName>Vertical` / `<PascalName>Horizontal`
e.g. job `synthetic-test` → `SyntheticTestVertical`, `SyntheticTestHorizontal`

New jobs are registered automatically:
1. `npm run new-video <name>` — creates folders + `job-config.json` + updates `src/job-registry.json`
2. `npm run ingest-draft <name> --fixture <path>` — probes footage, fills duration, mirrors to `public/`, and renders
3. No manual edits to `src/registry.ts` or `src/Root.tsx` required
4. `npm run update-registry` — regenerates `src/job-registry.json` from all `job-config.json` files (run manually if needed)

---

## Useful commands

| Command | What it does |
|---------|-------------|
| `npm run studio` | Open the Remotion visual editor |
| `npm run check` | TypeScript typecheck + motion lint |
| `npm run new-video name` | Create folders + job-config for a new video |
| `npm run prep name` | Probe and convert footage |
| `npm run ingest-draft name --fixture path` | Ingest + render named job draft with audio |
| `npm run stills CompId --key` | Render first/middle/last frames |
| `npm run refs` | Extract contact sheets from references |
| `npm run render-final name --format=9:16` | Render final with audio |
| `npm run clean` | Delete temp render files |

---

## When something breaks

Paste the full error into a message to Claude:
> "Something's wrong. Here's exactly what I see: [paste error]"

Claude explains it in plain words, fixes it, and confirms the fix worked.

---

## Common problems

| You see | Why | Fix |
|---------|-----|-----|
| "remotion: command not found" | Not installed yet | Run `npm install` |
| Render stops halfway | Memory or disk space | Close other apps; free 20GB |
| Colours look grey / washed out | HDR clip not converted | Re-run `npm run prep` |
| Voice drifts out of sync | Variable frame rate | Use original file; prep converts it |
| Captions show wrong words | Transcription misheard | Your script wins — re-align to script |
| Text under app buttons | Text outside safe zone | Ask Claude to "keep all text inside safe zones" |
| ingest-draft fails at mux | Fixture has no audio | Fixture must have an audio stream |

---

_Creator Editing OS · VideoStudio · v1.0_
