import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARTICLE_EXPERIENCE_REGISTRY,
  ARTICLE_THEME_TOKENS,
  getArticleExperience,
  getArticleThemeTokens,
  resolveArticleMode,
  shouldShowInDepthSpiral,
} from '../src/lib/articleExperience.ts';
import { buildNonCardArticleModel } from '../src/lib/nonCardArticle.ts';
import { isDepthSpiralEligiblePost, normalizePostEntry } from '../src/lib/postMetadata.ts';

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
  assert.equal(config.showInDepthSpiral, true);
  assert.equal(ARTICLE_EXPERIENCE_REGISTRY.reference.entryKind, 'reference');
});

test('keeps hubs and references out of the depth spiral while preserving essays', () => {
  assert.equal(shouldShowInDepthSpiral('card-journey'), true);
  assert.equal(shouldShowInDepthSpiral('signal-essay'), true);
  assert.equal(shouldShowInDepthSpiral('research-essay'), true);
  assert.equal(shouldShowInDepthSpiral('field-note'), true);
  assert.equal(shouldShowInDepthSpiral('hub'), false);
  assert.equal(shouldShowInDepthSpiral('reference'), false);
});

test('keeps legacy hub or overview documents out of the depth spiral', () => {
  assert.equal(
    isDepthSpiralEligiblePost({
      card: undefined,
      articleMode: 'research-essay',
      title: 'Lorenz-Kundli Pattern Recognition Hub',
      tags: ['lorenz-kundli', 'patterns', 'hub', 'overview'],
    }),
    false
  );

  assert.equal(
    isDepthSpiralEligiblePost({
      card: undefined,
      articleMode: 'research-essay',
      title: 'Muse-Enneagram Framework Overview',
      tags: ['enneagram', 'muse', 'framework', 'overview'],
    }),
    false
  );

  assert.equal(
    isDepthSpiralEligiblePost({
      card: undefined,
      articleMode: 'signal-essay',
      title: 'The Downstream Mind',
      tags: ['attention architecture', 'curation collapse'],
    }),
    true
  );
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

test('exposes stable non-card theme tokens for article rendering', () => {
  const signalTheme = getArticleThemeTokens('signal');

  assert.equal(signalTheme.theme, 'signal');
  assert.equal(signalTheme.accentColor, '#10B5A7');
  assert.equal(ARTICLE_THEME_TOKENS.codex.theme, 'codex');
  assert.match(signalTheme.gradientTo, /^#/);
});

test('builds non-card article shell data for figures, framework axes, and easter egg layers', () => {
  const entry = {
    id: 'the-downstream-mind',
    data: {
      title: 'The Downstream Mind',
      date: new Date('2025-06-10'),
      excerpt: 'A flagship signal essay.',
      tags: ['consciousness', 'curation'],
      article_mode: 'signal-essay',
      concepts: ['attention architecture', 'curation collapse'],
      hero: {
        eyebrow: 'Attention Architecture',
        subtitle: 'How AI killed the thrill of finding things.',
      },
      experience: {
        theme: 'signal',
        rail: 'concept',
        decoder: true,
        framework_axes: {
          kha: 'Observer state',
          ba: 'Embodied encounter',
        },
      },
      figures: [
        {
          id: 'hero-figure',
          anchor: 'hero',
          asset: '/images/posts/the-downstream-mind/01-header.png',
          alt: 'Hero figure',
          placement: 'hero',
        },
        {
          id: 'section-figure',
          anchor: 'ii-flat-terrain',
          asset: '/images/posts/the-downstream-mind/02-section.png',
          alt: 'Section figure',
          placement: 'after-section',
          caption: 'Section-level choreography',
        },
        {
          id: 'closing-figure',
          anchor: 'iii-the-quine',
          asset: '/images/posts/the-downstream-mind/03-closing.png',
          alt: 'Closing figure',
          placement: 'closing',
        },
      ],
      easter_eggs: [
        {
          id: 'visible-1',
          layer: 'visible',
          kind: 'vocabulary',
          label: 'Visible signal',
          description: 'A visible layer item.',
        },
        {
          id: 'decoder-1',
          layer: 'decoder',
          kind: 'structural',
          label: 'Decoder signal',
          description: 'A decoder-only item.',
        },
      ],
      source_bridge: {
        quality_gates: {
          images_generated: true,
          platform_format_valid: false,
        },
      },
    },
    body: `
## I. You Are Downstream

Body copy.

## II. Flat Terrain

More body copy.

## III. The Quine

Closing copy.
`,
  };

  const model = buildNonCardArticleModel(entry);

  assert.equal(model.mode.mode, 'signal-essay');
  assert.equal(model.theme.theme, 'signal');
  assert.equal(model.frameworkAxes[0]?.label, 'KHA');
  assert.equal(model.heroFigure?.placement, 'hero');
  assert.equal(model.sectionFigures[0]?.anchorLabel, 'II. Flat Terrain');
  assert.equal(model.closingFigure?.placement, 'closing');
  assert.deepEqual(model.easterEggGroups.map((group) => group.layer), ['visible', 'decoder']);
  assert.equal(model.easterEggGroups[1]?.collapsed, true);
  assert.deepEqual(model.qualityGateSummary, { passed: 1, total: 2 });
});
