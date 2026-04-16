import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARTICLE_EXPERIENCE_REGISTRY,
  getArticleExperience,
  resolveArticleMode,
} from '../src/lib/articleExperience.ts';
import { normalizePostEntry } from '../src/lib/postMetadata.ts';

test('resolves card posts to card-journey mode when no explicit article mode is present', () => {
  const mode = resolveArticleMode({
    card: 'XVI',
    tags: ['tower'],
  });

  assert.equal(mode, 'card-journey');
});

test('prefers an explicit non-card article mode from frontmatter', () => {
  const mode = resolveArticleMode({
    article_mode: 'signal-essay',
    tags: ['consciousness'],
  });

  assert.equal(mode, 'signal-essay');
});

test('exposes stable registry defaults for signal essays', () => {
  const config = getArticleExperience('signal-essay');

  assert.equal(config.mode, 'signal-essay');
  assert.equal(config.entryKind, 'essay');
  assert.equal(config.defaultTheme, 'signal');
  assert.equal(config.defaultRail, 'concept');
  assert.equal(config.defaultDensity, 'immersive');
  assert.equal(config.supportsDecoder, true);
  assert.equal(ARTICLE_EXPERIENCE_REGISTRY.reference.entryKind, 'reference');
});

test('normalizes metadata for non-card essays using explicit and default contract values', () => {
  const normalized = normalizePostEntry({
    id: 'the-downstream-mind',
    data: {
      title: 'The Downstream Mind',
      date: new Date('2025-06-10'),
      excerpt: 'A research article on curation collapse.',
      tags: ['consciousness', 'curation'],
      featured_image: '/cards/sync-downstream-mind.webp',
      article_mode: 'signal-essay',
      concepts: ['dopamine', 'discovery'],
      related_posts: ['consciousness-architecture-hub'],
      hero: {
        subtitle: 'How AI killed the thrill of finding things',
      },
      llm: {
        start_priority: 'foundational',
      },
    },
  });

  assert.equal(normalized.articleMode, 'signal-essay');
  assert.equal(normalized.entryKind, 'essay');
  assert.equal(normalized.foundational, true);
  assert.deepEqual(normalized.concepts, ['dopamine', 'discovery']);
  assert.deepEqual(normalized.relatedPosts, ['consciousness-architecture-hub']);
  assert.equal(normalized.heroImage, '/cards/sync-downstream-mind.webp');
  assert.equal(normalized.hero.subtitle, 'How AI killed the thrill of finding things');
  assert.equal(normalized.experience.theme, 'signal');
  assert.equal(normalized.experience.decoder, true);
  assert.equal(normalized.llm.startPriority, 'foundational');
});
