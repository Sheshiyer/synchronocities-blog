# Lessons

- When the user redirects the task, stop the old workflow and rewrite the task artifacts to match the new request before continuing.
- For article interiors, "responsive" is not enough. Always verify explicit left and right gutters, reading measure, and media containment on real desktop and mobile viewports before calling the layout done.
- On editorial pages, default to copy-first composition. Supporting imagery and atmospheric panels should sit inside bounded columns, never make the reading experience feel edge-hugging or structurally loose.
- When the user asks to preserve Astro’s media model, prefer Astro assets and `Picture`/`Image` where local-asset paths can support it, and use a safe fallback for legacy public-path images instead of forcing a broad content migration.
- When using Astro `Picture` with already compressed local `.webp` art, set an explicit `fallbackFormat="webp"` unless there is a strong reason to emit PNG; the default PNG fallback is wasteful for this project’s card textures.
- For the homepage, never stack a dense onboarding shell on top of the depth gallery without rechecking the composition in-browser. The gallery is already a dominant visual system, so any new foreground UI must be materially lighter, more bounded, and explicitly tested on desktop before shipping.
