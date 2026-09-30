# Studio acceptance repairs required

Observed first studio source while build still in progress. Recheck final implementation before repair; never mark ready just because source exists.

- npm registry reports Remotion4.0.531 on September30; initial pin4.0.290 is stale. Resolve actual latestv4 and pin all Remotion packages consistently. Include React/ReactDOM typings and runtime dependencies.
- Use actual npx remotion ffmpeg/ffprobe (or official binary API), not guessed renderer/bundled-ffmpeg paths or mandatory Homebrew fallback. Use valid positional render syntax from official docs and --scale2 for high-quality path.
- Prohibit loudnorm normalization/limiters in audio processing. Loudnorm may be used only to measure with null output. Original voice gets at most one fixed gain and one final AAC encode. Measure actual streams and return failure if audio mux fails; never copy muted picture to a final and claim success. Emit actual voice.wav/sfx.wav/cue artifacts where applicable; no empty false audio claims.
- render-final must render the named job timeline, not SampleVertical/Horizontal for every video name. Provide shared project composition parameterized by actual timeline and isolated asset paths. Sample is explicitly synthetic. Draft/final approval gates bind exact versions/digests.
- All media scripts validate IDs and canonical containment, rejecting traversal/symlink/cross-project paths; CLI arguments passed as arrays, not shell interpolations.
- Prep detection/conversion failures must produce held or failed results. Never report HDR YES converted if conversion failed. Existing output needs source fingerprint validation before reuse. Preserve portrait aspect ratio; initial scale1920:1080 stretches portrait footage. Detect HEVC/unsupported codecs and actual VFR packet timing, not merely avg/r_frame_rate difference. Specify actual output fps. HDR tonemap require filter capability or explicit hold.
- Implement SRT/script alignment or explicitly hold at timed-input requirement; do not imply that finding SRT aligns words. Timings need real evidence and mismatch rejection.
- refs/stills contact-sheet commands must run successfully; check first/key/last frames, honest motion-lint, approved default styling still provisional.
- Finish studio docs/progress with only verified ticks. Setup test and synthetic sample are not real-footage/phone/ears acceptance.
- Test no-media prep, command failure, invalid/traversal job names, symlink isolation, stale conversion, job-specific compositions and safe cleanup. ffprobe two renders validates dimensions/duration. No silent fallback after render failure.
