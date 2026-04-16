import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildProcessingImportProposal,
  parseMarkdownDocument,
  slugifyHeading,
  validateDocument,
} from '../scripts/lib/postMigration.ts';

test('flags seeded non-card essays that omit required discovery fields', () => {
  const document = parseMarkdownDocument(
    `---
title: "Signal Essay"
date: 2026-04-02
article_mode: signal-essay
entry_kind: essay
excerpt: "A seeded test document."
---

## One Section

Body copy.
`,
    path.join(process.cwd(), 'src/content/posts/signal-essay.md'),
  );

  const issues = validateDocument(document);
  const messages = issues.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('discovery concept')));
  assert(messages.some((message) => message.includes('llm.cluster')));
});

test('validates figure anchors against live section headings', () => {
  const document = parseMarkdownDocument(
    `---
title: "Anchors"
date: 2026-04-02
article_mode: research-essay
entry_kind: essay
concepts:
  - anchor validation
llm:
  cluster: testing
figures:
  - id: misplaced
    anchor: missing-anchor
    asset: /images/posts/testing/missing.png
    alt: Missing figure
    placement: after-section
---

## Existing Section

Body copy.
`,
    path.join(process.cwd(), 'src/content/posts/anchors.md'),
  );

  const issues = validateDocument(document);

  assert(issues.some((issue) => issue.message.includes('missing section anchor')));
  assert.equal(slugifyHeading('I. You\'re Being Fed'), 'i-youre-being-fed');
});

test('builds a dry-run processing import proposal from an external source doc', () => {
  const sourceDocument = parseMarkdownDocument(
    `---
title: "The Downstream Mind"
subtitle: "Signal subtitle"
platform: x-article
tags:
  - discovery
vault_sources:
  - source-a
kha_ba_la_mapping:
  kha: "Observer"
images:
  section_02: downstream/02-dopamine-coin-toss.png
  placement_guide: downstream/placement-guide.md
quality_gates_passed:
  images_generated: true
easter_eggs:
  layer_1_vocabulary_signals:
    description: "Vocabulary"
    terms:
      - upstream
---

Body.
`,
    '/tmp/downstream-processing.md',
  );

  const targetDocument = parseMarkdownDocument(
    `---
title: "The Downstream Mind"
date: 2025-06-10
excerpt: "Existing excerpt."
tags:
  - curation
---

## I. You're Being Fed

Body.
`,
    path.join(process.cwd(), 'src/content/posts/the-downstream-mind.md'),
  );

  const proposal = buildProcessingImportProposal(sourceDocument, targetDocument, '2026-04-02T00:00:00.000Z');
  const sourceBridge = proposal.patch.source_bridge as { platform?: string; imported_fields?: string[] } | undefined;
  const figures = proposal.patch.figures as Array<{ asset: string }> | undefined;

  assert.equal(proposal.targetSlug, 'the-downstream-mind');
  assert.equal(sourceBridge?.platform, 'x-article');
  assert(sourceBridge?.imported_fields?.includes('easter_eggs'));
  assert.equal(figures?.[0]?.asset, '/images/posts/the-downstream-mind/02-dopamine-coin-toss.png');
  assert.deepEqual(proposal.unmappedFields, []);
});
