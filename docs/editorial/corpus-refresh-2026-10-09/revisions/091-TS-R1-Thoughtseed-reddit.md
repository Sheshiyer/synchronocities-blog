**Title:** A frame-driven Three.js study of a company operations landscape

I’m working on Cambium at Thoughtseed, and made a short animation to explore how separate company functions could share one visual language.

The scene is built with Three.js. Its renderer takes a frame number rather than relying on wall-clock playback: the same frame produces the same scene. Browser capture produces the frames, and ffmpeg encodes them with a synthesized soundtrack driven by the same cue list.

The visual moves from a seed into distinct islands for Genesis, Taste, Build, Ops and Cortex, then into a Mission Control view. The status numbers are part of the animation, rather than live operating data.

I’m interested in the readability of the transition from a landscape into an interface. At that point, does the motion still help you understand the different roles, or does it ask you to follow too much at once?