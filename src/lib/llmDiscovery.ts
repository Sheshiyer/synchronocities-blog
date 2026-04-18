import {
  buildArchiveDataset,
  getArchivePreset,
  getPinnedArchiveRecords,
  type ArchiveRecord,
} from './archive.ts';
import {
  extractReadingMetadata,
  normalizePostEntry,
  type PostEntryLike,
} from './postMetadata.ts';

export interface LlmDiscoveryRecord {
  slug: string;
  url: string;
  title: string;
  date: string;
  excerpt?: string;
  tags: string[];
  concepts: string[];
  articleMode: string;
  entryKind: string;
  foundational: boolean;
  series?: string;
  card?: string;
  heroImage?: string;
  readTimeMinutes: number;
  wordCount: number;
  sectionHeadings: string[];
  llm: {
    startPriority: string;
    summary?: string;
    cluster?: string;
    canonicalQuestions: string[];
  };
  relatedPosts: string[];
  sourceBridge: {
    platform?: string;
    importedFields: string[];
    qualityGates: Record<string, boolean>;
  };
}

export interface LlmDiscoveryManifest {
  generatedAt: string;
  site: string;
  counts: {
    total: number;
    foundational: number;
    travelArc: number;
    research: number;
  };
  routes: {
    start: string;
    concise: string;
    full: string;
    manifest: string;
    archive: string;
    research: string;
    maps: string;
  };
  records: LlmDiscoveryRecord[];
}

export function buildLlmDiscoveryRecords(entries: PostEntryLike[], site: string): LlmDiscoveryRecord[] {
  return [...entries]
    .sort((left, right) => right.data.date.getTime() - left.data.date.getTime())
    .map((entry) => {
      const normalized = normalizePostEntry(entry);
      const reading = extractReadingMetadata(entry.body ?? '');

      return {
        slug: normalized.slug,
        url: `${site}/posts/${normalized.slug}/`,
        title: normalized.title,
        date: normalized.date.toISOString().split('T')[0],
        excerpt: normalized.excerpt,
        tags: normalized.tags,
        concepts: normalized.concepts,
        articleMode: normalized.articleMode,
        entryKind: normalized.entryKind,
        foundational: normalized.foundational,
        series: normalized.series,
        card: normalized.card,
        heroImage: normalized.heroImage,
        readTimeMinutes: reading.readTimeMinutes,
        wordCount: reading.wordCount,
        sectionHeadings: reading.headings.filter((heading) => heading.depth === 2).map((heading) => heading.text),
        llm: {
          startPriority: normalized.llm.startPriority,
          summary: normalized.llm.summary,
          cluster: normalized.llm.cluster,
          canonicalQuestions: normalized.llm.canonicalQuestions,
        },
        relatedPosts: normalized.relatedPosts,
        sourceBridge: {
          platform: normalized.sourceBridge.platform,
          importedFields: normalized.sourceBridge.importedFields,
          qualityGates: normalized.sourceBridge.qualityGates,
        },
      } satisfies LlmDiscoveryRecord;
    });
}

export function buildStartTxt(entries: PostEntryLike[], site: string): string {
  const dataset = buildArchiveDataset(entries);
  const foundational = getArchivePreset(dataset.records, 'foundational')
    .sort(sortArchiveForGuidedStart)
    .slice(0, 8);
  const pinned = getPinnedArchiveRecords(dataset.records, 4);
  const clusters = summarizeClusters(dataset.records);

  const lines = [
    '# Synchronocities Start',
    '',
    '> High-signal orientation route for humans and language models. Use this file to decide where to begin instead of scanning the entire corpus blindly.',
    '',
    `Site: ${site}`,
    `Archive: ${site}/journeys/`,
    `Research Library: ${site}/research/`,
    `Maps & Indexes: ${site}/maps/`,
    '',
    '## Begin Here',
    '',
    ...foundational.map((record) => formatGuidedRecord(site, record)),
    '',
    '## Pinned Entry Points',
    '',
    ...pinned.map((record) => formatGuidedRecord(site, record)),
    '',
    '## Research Clusters',
    '',
    ...clusters.map((cluster) => `- ${cluster.name}: ${cluster.count} article${cluster.count === 1 ? '' : 's'}`),
    '',
    '## Suggested Path',
    '',
    '1. Start with a foundational essay or hub.',
    '2. Use `/research/` to browse the non-tarot corpus by intent.',
    '3. Use `/maps/` when you need hubs, indexes, and orientation structures.',
    '4. Use `/journeys/` for the full interactive archive and preset-driven search.',
    '',
  ];

  return lines.join('\n');
}

export function buildLlmsTxt(entries: PostEntryLike[], site: string): string {
  const dataset = buildArchiveDataset(entries);
  const foundational = getArchivePreset(dataset.records, 'foundational').sort(sortArchiveForGuidedStart).slice(0, 10);
  const research = getArchivePreset(dataset.records, 'research').filter((record) => !record.card).slice(0, 14);
  const travelArc = getArchivePreset(dataset.records, 'major-arcana').slice(0, 12);

  const lines = [
    '# Synchronocities',
    '',
    '> A spiral research library spanning tarot-native travel journals, consciousness architecture, pattern systems, and technical-mystical essays.',
    '',
    `The site contains ${dataset.records.length} published records.`,
    '',
    '## Entry Routes',
    '',
    `- Start here: ${site}/start.txt`,
    `- Research library: ${site}/research/`,
    `- Maps & indexes: ${site}/maps/`,
    `- Interactive archive: ${site}/journeys/`,
    `- Machine manifest: ${site}/llms-manifest.json`,
    '',
    '## Foundational Nodes',
    '',
    ...foundational.map((record) => formatGuidedRecord(site, record)),
    '',
    '## Research Layer',
    '',
    ...research.map((record) => formatGuidedRecord(site, record)),
    '',
    '## Travel Arc',
    '',
    ...travelArc.map((record) => formatGuidedRecord(site, record)),
    '',
  ];

  return lines.join('\n');
}

export function buildLlmsFullTxt(entries: PostEntryLike[], site: string, generatedAt = new Date().toISOString()): string {
  const records = buildLlmDiscoveryRecords(entries, site);
  const sections = [
    '# Synchronocities — Full Content for LLMs',
    '',
    `> ${records.length} articles. Generated ${generatedAt.split('T')[0]}.`,
    '',
  ];

  for (const record of records) {
    sections.push('---');
    sections.push('');
    sections.push(`## ${record.title}`);
    sections.push('');
    sections.push(`URL: ${record.url}`);
    sections.push(`Date: ${record.date}`);
    sections.push(`Mode: ${record.articleMode}`);
    sections.push(`Kind: ${record.entryKind}`);
    sections.push(`Foundational: ${record.foundational ? 'yes' : 'no'}`);
    if (record.card) sections.push(`Card: ${record.card}`);
    if (record.series) sections.push(`Series: ${record.series}`);
    if (record.excerpt) sections.push(`Summary: ${record.excerpt}`);
    if (record.tags.length > 0) sections.push(`Tags: ${record.tags.join(', ')}`);
    if (record.concepts.length > 0) sections.push(`Concepts: ${record.concepts.join(', ')}`);
    sections.push(`Read time: ${record.readTimeMinutes} min`);
    sections.push(`Word count: ${record.wordCount}`);
    if (record.llm.cluster) sections.push(`Cluster: ${record.llm.cluster}`);
    if (record.llm.canonicalQuestions.length > 0) {
      sections.push(`Canonical questions: ${record.llm.canonicalQuestions.join(' | ')}`);
    }
    if (record.relatedPosts.length > 0) {
      sections.push(`Related posts: ${record.relatedPosts.join(', ')}`);
    }
    if (record.sourceBridge.platform) {
      sections.push(`Source bridge platform: ${record.sourceBridge.platform}`);
    }
    if (record.sourceBridge.importedFields.length > 0) {
      sections.push(`Imported fields: ${record.sourceBridge.importedFields.join(', ')}`);
    }
    if (record.sectionHeadings.length > 0) {
      sections.push(`Sections: ${record.sectionHeadings.join(' | ')}`);
    }
    sections.push('');

    const entry = entries.find((candidate) => candidate.id === record.slug);
    if (entry?.body) {
      sections.push(entry.body);
      sections.push('');
    }
  }

  return sections.join('\n');
}

export function buildLlmsManifest(entries: PostEntryLike[], site: string, generatedAt = new Date().toISOString()): LlmDiscoveryManifest {
  const dataset = buildArchiveDataset(entries);
  const records = buildLlmDiscoveryRecords(entries, site);

  return {
    generatedAt,
    site,
    counts: {
      total: records.length,
      foundational: records.filter((record) => record.foundational).length,
      travelArc: dataset.records.filter((record) => Boolean(record.card)).length,
      research: dataset.records.filter((record) => ['signal-essay', 'research-essay', 'reference'].includes(record.articleMode)).length,
    },
    routes: {
      start: `${site}/start.txt`,
      concise: `${site}/llms.txt`,
      full: `${site}/llms-full.txt`,
      manifest: `${site}/llms-manifest.json`,
      archive: `${site}/journeys/`,
      research: `${site}/research/`,
      maps: `${site}/maps/`,
    },
    records,
  };
}

function formatGuidedRecord(site: string, record: ArchiveRecord): string {
  const url = `${site}/posts/${record.slug}/`;
  const kind = record.card ? `Travel Arc ${record.card}` : record.articleMode;
  const concepts = record.concepts.slice(0, 4).join(', ');
  const summary = record.excerpt ? `  ${record.excerpt}` : '';
  const conceptLine = concepts ? `  Concepts: ${concepts}` : '';

  return [
    `- [${record.title}](${url}) (${kind})`,
    summary,
    conceptLine,
  ].filter(Boolean).join('\n');
}

function sortArchiveForGuidedStart(left: ArchiveRecord, right: ArchiveRecord): number {
  const leftRank = left.pinRank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.pinRank ?? Number.MAX_SAFE_INTEGER;
  const rankDelta = leftRank - rightRank;

  if (rankDelta !== 0) {
    return rankDelta;
  }

  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }

  return right.date.localeCompare(left.date);
}

function summarizeClusters(records: ArchiveRecord[]) {
  const counts = new Map<string, number>();

  for (const record of records) {
    if (!record.llmCluster) {
      continue;
    }

    counts.set(record.llmCluster, (counts.get(record.llmCluster) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 8);
}
