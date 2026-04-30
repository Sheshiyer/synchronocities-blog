/**
 * Adds `cluster:*` tags to every post based on its existing tag fingerprint.
 * Defines a flat 7-cluster taxonomy as the top-level discovery axis.
 * Existing tags are preserved; this only ADDS cluster tags (idempotent).
 *
 * Run: node --experimental-strip-types scripts/apply-cluster-tags.ts
 */

import * as fs from 'node:fs/promises';
import {
  listPostFiles,
  readMarkdownDocument,
  applyFrontmatterPatch,
} from './lib/postMigration.ts';

interface ClusterRule {
  cluster: string;
  triggers: RegExp[];
}

const CLUSTERS: ClusterRule[] = [
  {
    cluster: 'cluster:tarot',
    triggers: [/^tarot-\d/, /^thoth$/, /^rider-waite$/, /^tarot$/],
  },
  {
    cluster: 'cluster:travelogue',
    triggers: [
      /^bangkok$/, /^chiang-mai$/, /^koh-samui$/, /^samui$/, /^pai$/, /^phangan$/,
      /^doi-suthep$/, /^shenzhen$/, /^room-3$/, /^room-707$/, /^nana-plaza$/,
      /^seventh-floor$/, /^arrival$/, /^departure$/, /^pilgrimage$/, /^ports$/,
      /^pichet$/, /^kala$/, /^kali$/, /^inanna$/, /^chandraghanta$/, /^aryaman$/,
    ],
  },
  {
    cluster: 'cluster:lorenz-kundli',
    triggers: [
      /^lorenz-kundli$/, /^vedic$/, /^jyotish$/, /^chaos-theory$/, /^dasha$/,
      /^vimshottari$/, /^nakshatra$/, /^ashtakavarga$/, /^graha$/, /^shadbala$/,
      /^bhava$/, /^markov-chains$/, /^cellular-automata$/, /^hypercube$/,
      /^mercury$/, /^rahu$/, /^ketu$/, /^venus$/, /^planetary$/, /^lorentz$/,
      /^aspects$/, /^constellations$/, /^constellation$/, /^celestial$/,
      /^meteor-showers$/, /^einstein$/, /^tensor$/, /^parallels$/, /^mathematics$/,
    ],
  },
  {
    cluster: 'cluster:enneagram',
    triggers: [
      /^enneagram$/, /^endocrine$/, /^muse$/, /^muses$/, /^type$/, /^hormones$/,
      /^profile-2-4$/, /^mood$/, /^sacral$/, /^human-design$/, /^gene-key-/,
      /^gate-/, /^breathwork$/, /^breath-protocol$/, /^pranayama$/,
    ],
  },
  {
    cluster: 'cluster:sonic',
    triggers: [
      /^akshara$/, /^mantra$/, /^sanskrit$/, /^sonic$/, /^pingala$/,
      /^varna$/, /^sphota$/, /^speech$/, /^language$/, /^name-transmission$/,
      /^nadi$/,
    ],
  },
  {
    cluster: 'cluster:geometry',
    triggers: [
      /^geometry$/, /^symmetry$/, /^wallpaper-groups$/, /^sri-yantra$/, /^meru$/,
      /^hyperbolic$/, /^topology$/, /^fibonacci$/, /^sequences$/, /^cartography$/,
      /^sacred$/,
    ],
  },
  {
    cluster: 'cluster:consciousness',
    triggers: [
      /^consciousness$/, /^runtime$/, /^debugging$/, /^awareness$/,
      /^bioelectric$/, /^bioelectricity$/, /^chakra$/, /^mitochondria$/,
      /^qualia$/, /^valence$/, /^witness$/, /^witness-os$/, /^noesis$/,
      /^kha-ba-la$/, /^neural-networks$/, /^framework$/, /^frameworks$/,
      /^dopamine$/, /^pain$/, /^mental-states$/, /^architecture$/,
      /^reptilian$/, /^aether$/, /^magnetism$/, /^magnetic$/, /^field-theory$/,
      /^subconsciousness$/, /^bios$/, /^operating-system$/, /^bioimpedance$/,
      /^aletheos$/, /^source-code$/, /^ancient-code$/, /^legacy-code$/,
      /^biology$/, /^stack$/, /^noetic$/, /^pattern-recognition$/, /^patterns$/,
      /^integration$/, /^coherence$/, /^compassion$/, /^enlightenment$/,
      /^pain$/, /^encryption$/, /^encryption$/, /^logging$/, /^http$/, /^unix$/,
      /^python$/, /^programming$/, /^operations$/, /^state$/, /^state-trace$/,
      /^state-trace$/, /^method$/,
    ],
  },
];

async function main(): Promise<void> {
  const files = await listPostFiles();
  let updatedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const doc = await readMarkdownDocument(file);
    const tags = Array.isArray(doc.data.tags) ? (doc.data.tags as string[]) : [];

    if (tags.length === 0) {
      skippedCount++;
      continue;
    }

    const additions: string[] = [];
    for (const { cluster, triggers } of CLUSTERS) {
      if (tags.includes(cluster)) continue;
      if (tags.some((t) => triggers.some((re) => re.test(t)))) {
        additions.push(cluster);
      }
    }

    if (additions.length === 0) {
      skippedCount++;
      continue;
    }

    const newTags = [...tags, ...additions];
    const patched = applyFrontmatterPatch(doc.source, { ...doc.data, tags: newTags });
    await fs.writeFile(file, patched);
    console.log(`${doc.slug}: + ${additions.join(', ')}`);
    updatedCount++;
  }

  console.log(`\nUpdated ${updatedCount} posts. Skipped ${skippedCount} (no tag match or already clustered).`);
}

void main();
