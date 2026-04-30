/**
 * Backfills `article_mode`, `entry_kind`, `concepts`, and `llm.cluster` on
 * legacy non-card posts that currently fail the article-experience contract.
 *
 * Heuristic rules:
 * - Card posts (with `card:` numeral) are skipped — they auto-class as card-journey.
 * - Posts already declaring `article_mode` are skipped (idempotent).
 * - article_mode chosen from body word count + tag fingerprint:
 *   - has 'hub' or 'overview' tag       -> hub
 *   - has 'reference' or 'index' tag    -> reference
 *   - body >= 1500 words                -> signal-essay
 *   - body < 700 words + travelogue tag -> field-note
 *   - default                           -> research-essay
 * - entry_kind matched to article_mode (essay/hub/reference).
 * - concepts: derived from non-cluster tags, deduped, capped at 6.
 * - llm.cluster: first cluster:* tag mapped to canonical name.
 *
 * Run: node --experimental-strip-types scripts/backfill-entry-kind.ts
 */

import * as fs from 'node:fs/promises';
import {
  listPostFiles,
  readMarkdownDocument,
  applyFrontmatterPatch,
} from './lib/postMigration.ts';

const CLUSTER_TO_LLM: Record<string, string> = {
  'cluster:consciousness': 'consciousness-architecture',
  'cluster:lorenz-kundli': 'lorenz-kundli',
  'cluster:enneagram': 'enneagram',
  'cluster:tarot': 'tarot',
  'cluster:travelogue': 'travelogue',
  'cluster:sonic': 'sonic-infrastructure',
  'cluster:geometry': 'geometry',
};

function bodyWordCount(source: string): number {
  // Body = content after the second `---` line that closes frontmatter
  const lines = source.split('\n');
  let dashes = 0;
  let bodyLines: string[] = [];
  for (const line of lines) {
    if (line.trim() === '---') {
      dashes++;
      continue;
    }
    if (dashes >= 2) bodyLines.push(line);
  }
  return bodyLines.join(' ').split(/\s+/).filter(Boolean).length;
}

interface ChosenSeed {
  articleMode: string;
  entryKind: string;
  concepts: string[];
  llmCluster: string;
}

function chooseSeed(data: Record<string, unknown>, body: number): ChosenSeed | null {
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];

  // Pick article_mode
  const tagSet = new Set(tags);
  const isHub = tagSet.has('hub') || tagSet.has('overview');
  const isReference = tagSet.has('reference') || tagSet.has('index');
  const isTravelogue = tagSet.has('cluster:travelogue');

  let articleMode: string;
  let entryKind: string;
  if (isHub) {
    articleMode = 'hub';
    entryKind = 'hub';
  } else if (isReference) {
    articleMode = 'reference';
    entryKind = 'reference';
  } else if (body >= 1500) {
    articleMode = 'signal-essay';
    entryKind = 'essay';
  } else if (body < 700 && isTravelogue) {
    articleMode = 'field-note';
    entryKind = 'essay';
  } else {
    articleMode = 'research-essay';
    entryKind = 'essay';
  }

  // Pick llm.cluster from first cluster:* tag found
  const clusterTag = tags.find((t) => t.startsWith('cluster:'));
  if (!clusterTag) {
    return null; // Skip posts with no cluster tag (probably need manual review)
  }
  const llmCluster = CLUSTER_TO_LLM[clusterTag] ?? 'misc';

  // Derive concepts from non-cluster, non-orphan, non-trivial tags
  const trivialTags = new Set([
    'hub', 'overview', 'reference', 'index', 'system', 'frameworks',
    'framework', 'patterns', 'pattern', 'audit', 'transcript',
  ]);
  const concepts = tags
    .filter((t) => !t.startsWith('cluster:'))
    .filter((t) => !trivialTags.has(t))
    .filter((t) => !t.startsWith('tarot-')) // tarot card tags aren't concepts
    .slice(0, 6)
    .map((t) => t.replace(/-/g, ' ')); // hyphen → space for readability

  if (concepts.length === 0) {
    // Fallback: use the cluster tag label itself as a concept
    concepts.push(clusterTag.replace('cluster:', ''));
  }

  return { articleMode, entryKind, concepts, llmCluster };
}

async function main(): Promise<void> {
  const files = await listPostFiles();
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const file of files) {
    const doc = await readMarkdownDocument(file);
    const data = doc.data;

    // Skip card posts (auto-classed as card-journey)
    if (data.card && typeof data.card === 'string' && data.card.length > 0) {
      skipped++;
      continue;
    }

    // Skip posts already declaring article_mode
    if (typeof data.article_mode === 'string' && data.article_mode.length > 0) {
      unchanged++;
      continue;
    }

    const body = bodyWordCount(doc.source);
    const seed = chooseSeed(data, body);
    if (!seed) {
      skipped++;
      continue;
    }

    const newData: Record<string, unknown> = {
      ...data,
      article_mode: seed.articleMode,
      entry_kind: seed.entryKind,
      concepts: seed.concepts,
      llm: {
        ...((data.llm as Record<string, unknown>) ?? {}),
        cluster: seed.llmCluster,
      },
    };

    const patched = applyFrontmatterPatch(doc.source, newData);
    await fs.writeFile(file, patched);
    console.log(`${doc.slug}: + ${seed.articleMode} (${seed.entryKind}) [${body}w] → ${seed.llmCluster}`);
    updated++;
  }

  console.log(`\nUpdated ${updated}. Skipped ${skipped} (card posts or no cluster). Unchanged ${unchanged} (already seeded).`);
}

void main();
