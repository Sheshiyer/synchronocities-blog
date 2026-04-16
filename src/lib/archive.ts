import {
  extractReadingMetadata,
  normalizePostEntry,
  type ArticleMode,
  type EntryKind,
  type PostEntryLike,
} from './postMetadata.ts';

export interface ArchiveRecord {
  slug: string;
  title: string;
  date: string;
  excerpt?: string;
  tags: string[];
  pinned: boolean;
  pinRank?: number;
  concepts: string[];
  articleMode: ArticleMode;
  entryKind: EntryKind;
  foundational: boolean;
  series?: string;
  readTimeMinutes?: number;
  sectionCount: number;
  wordCount: number;
  card?: string;
  heroImage?: string;
  relationships: string[];
  llmCluster?: string;
}

export interface TopicFacet {
  topic: string;
  count: number;
}

export interface SearchIndexEntry {
  slug: string;
  title: string;
  excerpt?: string;
  articleMode: ArticleMode;
  entryKind: EntryKind;
  terms: string[];
  searchText: string;
}

export type ArchivePresetId =
  | 'newest'
  | 'major-arcana'
  | 'foundational'
  | 'research'
  | 'field-notes'
  | 'hubs'
  | 'pilot-downstream-mind';

export interface ArchivePresetDefinition {
  id: ArchivePresetId;
  label: string;
  description: string;
}

export interface RelationshipEdge {
  source: string;
  target: string;
  score: number;
  reasons: string[];
}

export interface RelationshipGraph {
  edges: RelationshipEdge[];
  bySlug: Record<string, RelationshipEdge[]>;
}

export interface ArchiveDataset {
  records: ArchiveRecord[];
  topicFacets: TopicFacet[];
  searchIndex: SearchIndexEntry[];
  relationshipGraph: RelationshipGraph;
}

export interface ArchiveFilterState {
  preset?: ArchivePresetId;
  topic?: string;
  query?: string;
}

export interface RelatedArchiveRecord {
  record: ArchiveRecord;
  score: number;
  reasons: string[];
}

export const ARCHIVE_PRESET_DEFINITIONS: ArchivePresetDefinition[] = [
  {
    id: 'newest',
    label: 'Newest',
    description: 'Most recently published work across the full library.',
  },
  {
    id: 'major-arcana',
    label: 'Travel Arc',
    description: 'Tarot-native journey entries that keep the original spiral intact.',
  },
  {
    id: 'foundational',
    label: 'Foundational',
    description: 'Best starting points for readers and future discovery routes.',
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Signal essays, research essays, and reference-first system documents.',
  },
  {
    id: 'field-notes',
    label: 'Field Notes',
    description: 'Chronology-forward logs and observational entries.',
  },
  {
    id: 'hubs',
    label: 'Maps & Indexes',
    description: 'Hub and reference pages that orient readers across clusters.',
  },
  {
    id: 'pilot-downstream-mind',
    label: 'Pilot Essays',
    description: 'The Downstream Mind pilot set and its nearest seeded neighbors.',
  },
];

export function buildArchiveDataset(entries: PostEntryLike[]): ArchiveDataset {
  const baseRecords = buildBaseArchiveRecords(entries);
  const relationshipGraph = buildRelationshipGraph(baseRecords);
  const records = hydrateArchiveRelationships(baseRecords, relationshipGraph);

  return {
    records,
    topicFacets: buildTopicFacets(records),
    searchIndex: buildSearchIndex(records),
    relationshipGraph,
  };
}

export function buildBaseArchiveRecords(entries: PostEntryLike[]): ArchiveRecord[] {
  return entries.map((entry) => {
    const normalized = normalizePostEntry(entry);
    const reading = extractReadingMetadata(entry.body ?? '');

    return {
      slug: normalized.slug,
      title: normalized.title,
      date: normalized.date.toISOString(),
      excerpt: normalized.excerpt,
      tags: normalized.tags,
      pinned: normalized.pinned,
      pinRank: normalized.pinRank,
      concepts: normalized.concepts,
      articleMode: normalized.articleMode,
      entryKind: normalized.entryKind,
      foundational: normalized.foundational,
      series: normalized.series,
      readTimeMinutes: reading.readTimeMinutes,
      sectionCount: reading.headings.filter((heading) => heading.depth === 2).length,
      wordCount: reading.wordCount,
      card: normalized.card,
      heroImage: normalized.heroImage,
      relationships: normalized.relatedPosts,
      llmCluster: normalized.llm.cluster,
    } satisfies ArchiveRecord;
  });
}

export function buildTopicFacets(records: ArchiveRecord[]): TopicFacet[] {
  const counts = new Map<string, number>();

  for (const record of records) {
    const topics = new Set([...record.concepts, ...record.tags].filter(Boolean));
    for (const topic of topics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic));
}

export function buildSearchIndex(records: ArchiveRecord[]): SearchIndexEntry[] {
  return records.map((record) => {
    const terms = uniqueTerms([
      record.title,
      record.excerpt,
      ...record.tags,
      ...record.concepts,
      record.series,
      record.llmCluster,
    ]);

    return {
      slug: record.slug,
      title: record.title,
      excerpt: record.excerpt,
      articleMode: record.articleMode,
      entryKind: record.entryKind,
      terms,
      searchText: terms.join(' '),
    } satisfies SearchIndexEntry;
  });
}

export function searchArchiveIndex(index: SearchIndexEntry[], query: string): SearchIndexEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }

  return index.filter((entry) => tokens.every((token) => entry.searchText.includes(token)));
}

export function parseArchivePreset(value: string | null | undefined): ArchivePresetId | undefined {
  if (!value) {
    return undefined;
  }

  return ARCHIVE_PRESET_DEFINITIONS.some((definition) => definition.id === value)
    ? (value as ArchivePresetId)
    : undefined;
}

export function filterArchiveRecords(dataset: ArchiveDataset, state: ArchiveFilterState): ArchiveRecord[] {
  let records = state.preset ? getArchivePreset(dataset.records, state.preset) : [...dataset.records];

  if (state.topic) {
    records = records.filter((record) => matchesTopic(record, state.topic ?? ''));
  }

  if (state.query?.trim()) {
    const matchingSlugs = new Set(searchArchiveIndex(dataset.searchIndex, state.query).map((entry) => entry.slug));
    records = records.filter((record) => matchingSlugs.has(record.slug));
  }

  return records.sort((left, right) => right.date.localeCompare(left.date));
}

export function getArchivePreset(records: ArchiveRecord[], presetId: ArchivePresetId): ArchiveRecord[] {
  const sortedByDate = [...records].sort((left, right) => right.date.localeCompare(left.date));
  const presetFilters: Record<ArchivePresetId, (record: ArchiveRecord) => boolean> = {
    newest: () => true,
    'major-arcana': (record) => Boolean(record.card),
    foundational: (record) => record.foundational,
    research: (record) => ['signal-essay', 'research-essay', 'reference'].includes(record.articleMode),
    'field-notes': (record) => record.articleMode === 'field-note',
    hubs: (record) => record.entryKind === 'hub' || record.entryKind === 'reference',
    'pilot-downstream-mind': (record) =>
      new Set([
        'the-downstream-mind',
        'consciousness-architecture-hub',
        'pattern-cross-reference-system',
        'pain-information-architecture',
        'the-source-code-has-authors',
      ]).has(record.slug),
  };

  const filtered = sortedByDate.filter(presetFilters[presetId]);
  return presetId === 'newest' ? filtered.slice(0, 12) : filtered;
}

export function getPinnedArchiveRecords(records: ArchiveRecord[], limit = 4): ArchiveRecord[] {
  return [...records]
    .filter((record) => record.pinned)
    .sort((left, right) => {
      const rankDelta = (left.pinRank ?? Number.MAX_SAFE_INTEGER) - (right.pinRank ?? Number.MAX_SAFE_INTEGER);
      if (rankDelta !== 0) {
        return rankDelta;
      }

      return right.date.localeCompare(left.date);
    })
    .slice(0, limit);
}

export function findArchiveRecord(records: ArchiveRecord[], slug: string): ArchiveRecord | undefined {
  return records.find((record) => record.slug === slug);
}

export function getRelatedArchiveRecords(dataset: ArchiveDataset, slug: string, limit = 4): RelatedArchiveRecord[] {
  const recordMap = new Map(dataset.records.map((record) => [record.slug, record]));

  return (dataset.relationshipGraph.bySlug[slug] ?? [])
    .map((edge) => ({
      record: recordMap.get(edge.target),
      score: edge.score,
      reasons: edge.reasons,
    }))
    .filter((item): item is RelatedArchiveRecord => Boolean(item.record))
    .slice(0, limit);
}

export function getSeriesCompanions(records: ArchiveRecord[], slug: string, limit = 3): ArchiveRecord[] {
  const current = findArchiveRecord(records, slug);

  if (!current?.series) {
    return [];
  }

  return records
    .filter((record) => record.slug !== slug && record.series === current.series)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
}

export function buildRelationshipGraph(records: ArchiveRecord[]): RelationshipGraph {
  const edges: RelationshipEdge[] = [];
  const bySlug = Object.fromEntries(records.map((record) => [record.slug, [] as RelationshipEdge[]]));

  for (let index = 0; index < records.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < records.length; compareIndex += 1) {
      const left = records[index];
      const right = records[compareIndex];
      const reasons: string[] = [];
      let score = 0;

      if (left.relationships.includes(right.slug) || right.relationships.includes(left.slug)) {
        score += 8;
        reasons.push('explicit-related-post');
      }

      if (left.series && right.series && left.series === right.series) {
        score += 5;
        reasons.push(`series:${left.series}`);
      }

      if (left.llmCluster && right.llmCluster && left.llmCluster === right.llmCluster) {
        score += 4;
        reasons.push(`cluster:${left.llmCluster}`);
      }

      const sharedConcepts = intersect(left.concepts, right.concepts);
      if (sharedConcepts.length > 0) {
        score += Math.min(6, sharedConcepts.length * 2);
        reasons.push(...sharedConcepts.map((concept) => `concept:${concept}`));
      }

      const sharedTags = intersect(left.tags, right.tags);
      if (sharedTags.length > 0) {
        score += Math.min(3, sharedTags.length);
        reasons.push(...sharedTags.slice(0, 3).map((tag) => `tag:${tag}`));
      }

      if (left.articleMode === right.articleMode) {
        score += 1;
        reasons.push(`mode:${left.articleMode}`);
      }

      if (score === 0) {
        continue;
      }

      const edge: RelationshipEdge = {
        source: left.slug,
        target: right.slug,
        score,
        reasons,
      };

      edges.push(edge);
      bySlug[left.slug].push(edge);
      bySlug[right.slug].push({
        source: right.slug,
        target: left.slug,
        score,
        reasons,
      });
    }
  }

  for (const record of records) {
    bySlug[record.slug].sort((left, right) => right.score - left.score || left.target.localeCompare(right.target));
  }

  return { edges, bySlug };
}

function hydrateArchiveRelationships(records: ArchiveRecord[], graph: RelationshipGraph): ArchiveRecord[] {
  return records.map((record) => {
    const graphNeighbors = (graph.bySlug[record.slug] ?? []).slice(0, 6).map((edge) => edge.target);
    return {
      ...record,
      relationships: [...new Set([...record.relationships, ...graphNeighbors])],
    };
  });
}

function uniqueTerms(values: Array<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => tokenize(value ?? '')))];
}

function matchesTopic(record: ArchiveRecord, topic: string): boolean {
  const normalizedTopic = topic.trim().toLowerCase();

  if (!normalizedTopic) {
    return true;
  }

  return [...record.concepts, ...record.tags].some((value) => value.toLowerCase() === normalizedTopic);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => rightSet.has(value)))];
}
