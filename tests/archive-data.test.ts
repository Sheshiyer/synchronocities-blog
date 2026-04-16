import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildArchiveDataset,
  filterArchiveRecords,
  getRelatedArchiveRecords,
  buildTopicFacets,
  getSeriesCompanions,
  getArchivePreset,
  parseArchivePreset,
  searchArchiveIndex,
  type ArchiveRecord,
} from '../src/lib/archive.ts';
import { readMarkdownDocument } from '../scripts/lib/postMigration.ts';

function recordFromPartial(partial: Partial<ArchiveRecord> & Pick<ArchiveRecord, 'slug' | 'title' | 'date' | 'articleMode' | 'entryKind' | 'foundational' | 'tags' | 'concepts' | 'relationships' | 'sectionCount' | 'wordCount'>): ArchiveRecord {
  return {
    excerpt: undefined,
    series: undefined,
    readTimeMinutes: 1,
    card: undefined,
    heroImage: undefined,
    llmCluster: undefined,
    ...partial,
  };
}

test('builds archive records and relationship edges from seeded pilot posts', async () => {
  const postPaths = [
    'the-downstream-mind.md',
    'consciousness-architecture-hub.md',
    'pattern-cross-reference-system.md',
    'lorenz-kundli-system-index.md',
    'bangkok-initiation-samui-invitation.md',
  ].map((filename) => path.join(process.cwd(), 'src/content/posts', filename));

  const documents = await Promise.all(postPaths.map((filePath) => readMarkdownDocument(filePath)));
  const entries = documents.map((document) => ({
    id: document.slug,
    data: document.data,
    body: document.body,
  }));

  const dataset = buildArchiveDataset(entries);
  const downstream = dataset.records.find((record) => record.slug === 'the-downstream-mind');

  assert(downstream);
  assert.equal(downstream.articleMode, 'signal-essay');
  assert.equal(downstream.sectionCount, 10);
  assert(downstream.readTimeMinutes && downstream.readTimeMinutes > 10);
  assert(downstream.relationships.includes('consciousness-architecture-hub'));
  assert(dataset.relationshipGraph.bySlug['the-downstream-mind'].some((edge) => edge.target === 'pattern-cross-reference-system'));
});

test('generates topic facets from normalized concepts and legacy tags', () => {
  const facets = buildTopicFacets([
    recordFromPartial({
      slug: 'a',
      title: 'A',
      date: '2026-04-02T00:00:00.000Z',
      articleMode: 'research-essay',
      entryKind: 'essay',
      foundational: false,
      tags: ['legacy-tag'],
      concepts: ['systems', 'patterns'],
      relationships: [],
      sectionCount: 1,
      wordCount: 100,
    }),
    recordFromPartial({
      slug: 'b',
      title: 'B',
      date: '2026-04-01T00:00:00.000Z',
      articleMode: 'field-note',
      entryKind: 'essay',
      foundational: false,
      tags: ['legacy-tag', 'travel'],
      concepts: [],
      relationships: [],
      sectionCount: 1,
      wordCount: 100,
    }),
  ]);

  assert.deepEqual(facets.slice(0, 4), [
    { topic: 'legacy-tag', count: 2 },
    { topic: 'patterns', count: 1 },
    { topic: 'systems', count: 1 },
    { topic: 'travel', count: 1 },
  ]);
});

test('search index and presets expose deterministic archive retrieval paths', async () => {
  const postPaths = [
    'the-downstream-mind.md',
    'consciousness-architecture-hub.md',
    'lorenz-kundli-system-index.md',
    'bangkok-initiation-samui-invitation.md',
  ].map((filename) => path.join(process.cwd(), 'src/content/posts', filename));

  const documents = await Promise.all(postPaths.map((filePath) => readMarkdownDocument(filePath)));
  const entries = documents.map((document) => ({
    id: document.slug,
    data: document.data,
    body: document.body,
  }));

  const dataset = buildArchiveDataset(entries);
  const searchResults = searchArchiveIndex(dataset.searchIndex, 'dopamine curation');
  const pilotPreset = getArchivePreset(dataset.records, 'pilot-downstream-mind');

  assert.deepEqual(searchResults.map((result) => result.slug), ['the-downstream-mind']);
  assert(pilotPreset.some((record) => record.slug === 'the-downstream-mind'));
  assert(pilotPreset.some((record) => record.slug === 'consciousness-architecture-hub'));
  assert(!pilotPreset.some((record) => record.slug === 'bangkok-initiation-samui-invitation'));
});

test('composes preset, topic, and query filtering without client-only state', async () => {
  const postPaths = [
    'the-downstream-mind.md',
    'consciousness-architecture-hub.md',
    'pattern-cross-reference-system.md',
    'lorenz-kundli-system-index.md',
    'bangkok-initiation-samui-invitation.md',
  ].map((filename) => path.join(process.cwd(), 'src/content/posts', filename));

  const documents = await Promise.all(postPaths.map((filePath) => readMarkdownDocument(filePath)));
  const entries = documents.map((document) => ({
    id: document.slug,
    data: document.data,
    body: document.body,
  }));

  const dataset = buildArchiveDataset(entries);
  const filtered = filterArchiveRecords(dataset, {
    preset: parseArchivePreset('research'),
    topic: 'dopamine',
    query: 'dopamine curation',
  });

  assert.deepEqual(filtered.map((record) => record.slug), ['the-downstream-mind']);
});

test('exposes related records and series companions for article-page modules', async () => {
  const postPaths = [
    'the-downstream-mind.md',
    'consciousness-architecture-hub.md',
    'pattern-cross-reference-system.md',
    'lorenz-kundli-system-index.md',
    'bangkok-initiation-samui-invitation.md',
  ].map((filename) => path.join(process.cwd(), 'src/content/posts', filename));

  const documents = await Promise.all(postPaths.map((filePath) => readMarkdownDocument(filePath)));
  const entries = documents.map((document) => ({
    id: document.slug,
    data: document.data,
    body: document.body,
  }));

  const dataset = buildArchiveDataset(entries);
  const downstreamRelated = getRelatedArchiveRecords(dataset, 'the-downstream-mind', 3);
  const seriesCompanions = getSeriesCompanions(dataset.records, 'consciousness-architecture-hub', 3);

  assert(downstreamRelated.some((item) => item.record.slug === 'consciousness-architecture-hub'));
  assert.equal(seriesCompanions.length, 0);
});
