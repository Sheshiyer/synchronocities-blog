# CLAUDE.md — The Rulebook

This is the authoritative rulebook for this studio.
Claude follows this file on every session, every video, every note.
STYLE.md wins on all visual decisions except your direct instructions.

---

## 1. How to work with me

- One step at a time. Before each step, say what you are about to do in one plain sentence.
  After it, say whether it worked.
- Ask me one question at a time and wait for my answer. If I say "you choose", choose sensibly.
- If something must be installed by me, give me the official link and exact steps.
- Before downloading anything larger than 100MB, tell me the name and size and wait.
- Keep SETUP-PROGRESS.md updated — one line per numbered item, ticked when done.

---

## 2. What you can and cannot do

### Can
- Edit, create and delete files inside VideoStudio/.
- Run npm scripts defined in package.json.
- Use ffprobe to inspect media; use ffmpeg to convert working copies.
- Render stills and drafts to work/ and out/.

### Cannot
- Transcribe audio automatically. Transcription is a deliberate user step.
  Always ask for a script file or SRT before touching captions.
- Commit changes to git unless I ask.
- Access the internet.
- Touch anything outside VideoStudio/.

---

## 3. Editing rules

### a. Never change a committed video without being asked
A committed video is one where I said "approved" or "that's final". Treat it as read-only.
If a rule conflicts with an approval, say so and ask.

### b. One video at a time
Each video lives in its own folder. Never mix assets from two videos.

### c. Safe zones — non-negotiable
All text and graphics must stay inside the safe zones defined in src/design/tokens.ts.
Check every still before reporting to me. Text touching a face or leaving the frame = fix before showing.

### d. Captions
My script is the source of truth for every word, name and spelling.
Transcription (if available) only supplies timing.
Captions must hide while the same words appear on screen as a graphic.
Captions must not linger into the next scene.
Numbers always as digits.

### e. Layout
Text in the clear space of the shot. Never over my face.
Draw all graphics in code (SVG/CSS/React); only logos, screenshots and photos are image files.
Read STYLE.md before any design decision; it wins over everything except my direct instructions.

### f. Motion
No linear easing unless marked `// motion-ok`.
No CSS `transition` or `animation` properties.
No `Math.random()` — seed with frame number if randomness needed.
No `will-change`.
All durations from `src/design/motion.ts`.
`npm run check` must pass before showing me anything.

### g. Audio standard
The picture renders muted.
Voice is my original recording — untouched except one gain change and one final AAC encode at 256k.
No limiters, no dynamic normalisation.
Sound effects: 0.4–0.8s whooshes, 0.3–0.6s hits, 60–120ms fade-out.
Effects sit in the gaps between words, ducked ~6dB under voice, high-passed at ~130Hz.
Nothing longer than 0.8s plays under a spoken word.
Final target: ~-14 LUFS, true peak ≤ -1dBTP.
Deliver: final mp4 + voice.wav + sfx.wav + picture-only mp4 + SFX-CUES.txt.
I cannot hear; always tell me what you verified and what I must listen for.

### h. Verification before showing me anything
1. `npm run check` passes.
2. Rendered stills of: first frame, every key motion moment mid-move and settled, last frame.
3. No text touches my face or leaves the frame.
4. Safe zones hold.
Tell me exactly what you verified and what I must watch at full speed.

### i. Taking notes
Notes arrive as: `timecode - what I see - what I want`.
Fix only those. Confirm each fix in the same timecode format.
If a note conflicts with a rule in STYLE.md, say so and ask before changing anything.

### j. Machine care
Never run transcription and a render at the same time.
If memory is low, tell me which apps to close. Do not guess.
After renders: run `npm run clean`.

---

## 4. When I approve or reject something

Add it to STYLE.md immediately:
- Approved: Approved effects table — name, what it looks like, which video.
- Rejected: Rejected table — what, why, which video.

---

## 5. Effect names

Use the effects library table in templates/BRIEF.md.
If you create a new effect from a reference moment I confirm, add it there with a short name.

---

## 6. Version

Rulebook v1.0 — 2026-09-30
