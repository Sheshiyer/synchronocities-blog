#!/usr/bin/env bash
# Run expand-posts in chunks, auto-commit + push between chunks so a
# mid-run kill leaves a clean partial state with everything completed
# preserved on origin.
#
# Usage:
#   bash scripts/expand-loop.sh           # 3 per chunk, until all expanded
#   CHUNK=2 bash scripts/expand-loop.sh   # 2 per chunk
#
# Idempotent — the script reads what's already at >= 4500 words from disk
# and skips those. So killing and restarting is safe.

set -euo pipefail

CHUNK="${CHUNK:-3}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$REPO_ROOT/workers"

while true; do
  # Count how many bg-agent posts are still under 4500 words
  remaining=$(bun -e '
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const BG = new Set([
"active-inference-prediction-engine","bicameral-consciousness-patch","bioelectric-protocol",
"body-as-blockchain","death-at-the-border","docker-for-chakras",
"fungal-intelligence-distributed-processing","hidden-history-cultural-amnesia",
"implosion-paradigm","kubernetes-for-karma","lorenz-kundli-protocol",
"mantra-as-source-code","model-temperature-and-tapas","morphic-resonance-network-protocol",
"noetic-aether-substrate","pharmacos-protocol","qualified-to-qualia-fied",
"root-access-to-reality","sacred-geometry-processing-units","sacred-runtime-bali-padiyami",
"semantic-trauma","the-devil-in-the-detail","the-ineffable-secrets-of-a-breathing-sprite",
"the-sun-names-you","three-modes-of-intelligence","vortex-based-mathematics",
"water-fourth-phase","yantra-and-tantra-in-the-age-of-llms",
"your-consciousness-needs-better-error-handling","your-reality-is-a-smart-contract",
]);
const dir = "../src/content/posts";
let n = 0;
for (const f of readdirSync(dir).filter(x => x.endsWith(".md"))) {
  const slug = f.replace(".md", "");
  if (!BG.has(slug)) continue;
  const body = readFileSync(join(dir, f), "utf8").split(/\n---\n/)[1] || "";
  if (body.split(/\s+/).filter(Boolean).length < 4000) n++;
}
console.log(n);
')
  echo "▸ ${remaining} bg-agent posts still need expansion"
  if [ "$remaining" -le 0 ]; then
    echo "▸ All done."
    break
  fi

  echo "▸ Expanding next ${CHUNK}..."
  bun scripts/expand-posts.ts --limit="$CHUNK"

  # Commit + push
  cd "$REPO_ROOT"
  if git diff --quiet src/content/posts/; then
    echo "▸ No changes to commit — likely all in-batch failed. Stopping."
    break
  fi
  git add src/content/posts/
  git commit -m "content(expand): bg-agent posts via /expand (auto-batch, $(date -u +%Y-%m-%dT%H:%M:%SZ))" \
    -m "Auto-committed by workers/scripts/expand-loop.sh. Quality enforced by /expand endpoint post-processing (AVOID-list word substitution + header strip)." \
    -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  git push origin main 2>&1 | tail -2
  cd "$REPO_ROOT/workers"
done

echo "▸ Loop complete."
