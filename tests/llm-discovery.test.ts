import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLlmsFullTxt,
  buildLlmsManifest,
  buildLlmsTxt,
  buildStartTxt,
} from '../src/lib/llmDiscovery.ts';

const site = 'https://example.com';

const entries = [
  {
    id: 'the-downstream-mind',
    data: {
      title: 'The Downstream Mind',
      date: new Date('2025-06-10'),
      excerpt: 'A flagship signal essay on discovery and attention.',
      tags: ['attention', 'discovery'],
      featured_image: '/cards/downstream.webp',
      article_mode: 'signal-essay',
      entry_kind: 'essay',
      foundational: true,
      concepts: ['attention architecture', 'curation collapse'],
      related_posts: ['consciousness-architecture-hub'],
      hero: {
        subtitle: 'How AI killed the thrill of finding things.',
      },
      llm: {
        start_priority: 'foundational',
        summary: 'Signal essay summary',
        cluster: 'attention-architecture',
        canonical_questions: ['What is the easter egg economy?'],
      },
      source_bridge: {
        platform: 'x-article',
        imported_fields: ['easter_eggs', 'figures'],
        quality_gates: {
          images_generated: true,
        },
      },
    },
    body: '## One\n\nBody copy.\n',
  },
  {
    id: 'consciousness-architecture-hub',
    data: {
      title: 'Consciousness Architecture Hub',
      date: new Date('2026-03-12'),
      excerpt: 'A routing table for the consciousness architecture cluster.',
      tags: ['consciousness', 'architecture'],
      article_mode: 'hub',
      entry_kind: 'hub',
      foundational: true,
      concepts: ['consciousness architecture'],
      related_posts: ['the-downstream-mind'],
      llm: {
        start_priority: 'foundational',
        cluster: 'consciousness-architecture',
      },
      pinned: true,
      pin_rank: 1,
    },
    body: '## Hub\n\nMap copy.\n',
  },
  {
    id: 'bangkok-initiation-samui-invitation',
    data: {
      title: 'Bangkok Initiation, Samui Invitation',
      date: new Date('2025-03-28'),
      excerpt: 'A field note from the Thailand journey.',
      tags: ['thailand'],
      card: '0',
      article_mode: 'field-note',
      entry_kind: 'essay',
      concepts: ['field note'],
      related_posts: [],
      llm: {
        start_priority: 'supporting',
        cluster: 'thailand-journey',
      },
    },
    body: '## Bangkok\n\nRide log.\n',
  },
] as const;

test('buildStartTxt surfaces foundational and pinned guidance routes', () => {
  const output = buildStartTxt([...entries], site);

  assert.match(output, /# Synchronocities Start/);
  assert.match(output, /Begin Here/);
  assert.match(output, /Consciousness Architecture Hub/);
  assert.match(output, /The Downstream Mind/);
  assert.match(output, /Research Library: https:\/\/example.com\/research\//);
});

test('buildLlmsTxt creates a guided discovery index instead of a flat dump', () => {
  const output = buildLlmsTxt([...entries], site);

  assert.match(output, /## Entry Routes/);
  assert.match(output, /Start here: https:\/\/example.com\/start.txt/);
  assert.match(output, /## Foundational Nodes/);
  assert.match(output, /## Research Layer/);
  assert.match(output, /## Travel Arc/);
});

test('buildLlmsFullTxt includes normalized metadata lines for each record', () => {
  const output = buildLlmsFullTxt([...entries], site, '2026-04-18T00:00:00.000Z');

  assert.match(output, /Mode: signal-essay/);
  assert.match(output, /Kind: essay/);
  assert.match(output, /Foundational: yes/);
  assert.match(output, /Canonical questions: What is the easter egg economy\?/);
  assert.match(output, /Source bridge platform: x-article/);
});

test('buildLlmsManifest emits deterministic counts and routes', () => {
  const manifest = buildLlmsManifest([...entries], site, '2026-04-18T00:00:00.000Z');

  assert.equal(manifest.counts.total, 3);
  assert.equal(manifest.counts.foundational, 2);
  assert.equal(manifest.counts.travelArc, 1);
  assert.equal(manifest.routes.start, 'https://example.com/start.txt');
  assert.equal(manifest.records[0].slug, 'consciousness-architecture-hub');
  assert.equal(manifest.records[1].slug, 'the-downstream-mind');
});
