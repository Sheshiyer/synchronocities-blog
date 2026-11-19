# Cambium showreel: two cuts, one timing model

Cambium's showreel source defines two ways to introduce the product: a fifteen-second roll-call and a two-minute guided tour. The short cut moves through the organs on the beat. The longer cut makes room for each organ's job, inputs, outputs and failure boundary before following a governed flow from observation to delivery.

Timing is explicit in the source. The short timeline sets 900 frames at 60 frames per second and 120 beats per minute. The long timeline sets 7,200 frames at the same frame rate, with 80 beats per minute and forty three-second bars. That gives the chapters a shared musical grid. A boundary can be located at a frame and a bar rather than adjusted by eye until it feels approximately right.

The README describes a three.js picture engine, headless browser capture into ffmpeg and a TypeScript synthesiser using the cue list. The package exposes separate preparation, audio, render, mux and verification commands. This gives a reviewer distinct stages to inspect when a soundtrack, picture or final export needs attention.

The visual rules are also specific. Dotted states mean pending; settled states use chartreuse; peach marks warning or review. The long-cut description includes a reduced-motion demonstration. Those indicators belong to the depicted product flow. Current service health and delivered motion behaviour require their own observations.

This report is based on the implementation README, package scripts and timing definitions. No render, playback, loudness, strobe or determinism test was run for this editorial review. The documented checks provide the next acceptance work: compare repeated render manifests, inspect the actual video and verify the final audio and motion against the specification.

For product review, start with the short cut's roll-call and the long cut's governed-flow chapter. Together they should make it possible to judge whether a new viewer can name each organ's purpose and follow a piece of work through the system. Record that response beside the technical export checks before presenting the reel as an accepted demonstration.
