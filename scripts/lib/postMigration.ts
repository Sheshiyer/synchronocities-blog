import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { ARTICLE_EXPERIENCE_REGISTRY, type ArticleMode } from '../../src/lib/articleExperience.ts';

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const POSTS_ROOT = path.join(PROJECT_ROOT, 'src', 'content', 'posts');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');

export interface MarkdownDocument<TData extends Record<string, unknown> = Record<string, unknown>> {
  filePath: string;
  slug: string;
  data: TData;
  body: string;
  source: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  slug: string;
  message: string;
}

export interface ProcessingImportProposal {
  targetFilePath: string;
  targetSlug: string;
  patch: Record<string, unknown>;
  unmappedFields: string[];
}

type PlainObject = Record<string, unknown>;

export async function listPostFiles(root = POSTS_ROOT): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(md|mdx)$/.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort();
}

export async function readMarkdownDocument<TData extends PlainObject = PlainObject>(filePath: string): Promise<MarkdownDocument<TData>> {
  const source = await fs.readFile(filePath, 'utf8');
  return parseMarkdownDocument<TData>(source, filePath);
}

export function parseMarkdownDocument<TData extends PlainObject = PlainObject>(
  source: string,
  filePath = path.join(POSTS_ROOT, 'unknown.md'),
): MarkdownDocument<TData> {
  const match = source.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new Error(`Missing YAML frontmatter in ${filePath}`);
  }

  const frontmatterText = match[1] ?? '';
  const loaded = yaml.load(frontmatterText);
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new Error(`Expected object frontmatter in ${filePath}`);
  }

  return {
    filePath,
    slug: path.basename(filePath).replace(/\.(md|mdx)$/, ''),
    data: loaded as TData,
    body: source.slice(match[0].length),
    source,
  };
}

export function dumpFrontmatter(data: PlainObject): string {
  return yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
}

export function applyFrontmatterPatch(source: string, data: PlainObject): string {
  const serialized = `---\n${dumpFrontmatter(data)}\n---\n`;
  if (FRONTMATTER_PATTERN.test(source)) {
    return source.replace(FRONTMATTER_PATTERN, serialized);
  }

  return `${serialized}\n${source}`;
}

export async function writeMarkdownDocument(filePath: string, data: PlainObject, body: string): Promise<void> {
  const nextSource = `---\n${dumpFrontmatter(data)}\n---\n${body}`;
  await fs.writeFile(filePath, nextSource, 'utf8');
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractSectionAnchors(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('## '))
    .map((line) => slugifyHeading(line.replace(/^##\s+/, '')))
    .filter(Boolean);
}

export function validateDocument(document: MarkdownDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const data = document.data;
  const articleMode = asString(data.article_mode);
  const isCardPost = Boolean(asString(data.card));
  const anchors = new Set(extractSectionAnchors(document.body));
  const articleMetadataPresent = hasArticleMetadata(data);

  if (isCardPost && articleMode) {
    issues.push(error(document.slug, 'Card posts must not declare `article_mode`; `card-journey` remains inferred from `card`.'));
  }

  if (!isCardPost && !articleMode && articleMetadataPresent) {
    issues.push(error(document.slug, 'Non-card posts with article-experience metadata must declare `article_mode`.'));
  }

  if (!isCardPost && !articleMode) {
    issues.push(warning(document.slug, 'Legacy non-card post still uses the fallback contract and has not been seeded yet.'));
  }

  if (!articleMode) {
    return issues;
  }

  const config = ARTICLE_EXPERIENCE_REGISTRY[articleMode as ArticleMode];
  if (!config) {
    issues.push(error(document.slug, `Unknown article mode: ${articleMode}`));
    return issues;
  }

  const entryKind = asString(data.entry_kind);
  if (articleMode === 'hub' && entryKind !== 'hub') {
    issues.push(error(document.slug, 'Hub posts must declare `entry_kind: hub`.'));
  } else if (articleMode === 'reference' && entryKind !== 'reference') {
    issues.push(error(document.slug, 'Reference posts must declare `entry_kind: reference`.'));
  } else if (articleMode !== 'hub' && articleMode !== 'reference' && entryKind && entryKind !== 'essay') {
    issues.push(error(document.slug, 'Essay-style article modes may only use `entry_kind: essay`.'));
  }

  if (!hasNonEmptyStringArray(data.concepts)) {
    issues.push(error(document.slug, 'Seeded article modes must define at least one discovery concept.'));
  }

  if (!hasNonEmptyString(asObject(data.llm)?.cluster)) {
    issues.push(error(document.slug, 'Seeded article modes must define `llm.cluster` for discovery grouping.'));
  }

  if (Boolean(data.foundational) && !hasNonEmptyString(asObject(data.llm)?.start_priority)) {
    issues.push(error(document.slug, 'Foundational posts must set `llm.start_priority` explicitly.'));
  }

  const experience = asObject(data.experience);
  if (experience?.decoder === true && !config.supportsDecoder) {
    issues.push(error(document.slug, `${articleMode} does not support decoder mode in the frozen registry.`));
  }

  if (Array.isArray(data.figures)) {
    for (const [index, figureValue] of data.figures.entries()) {
      const figure = asObject(figureValue);
      if (!figure) {
        issues.push(error(document.slug, `Figure ${index + 1} must be an object.`));
        continue;
      }

      const placement = asString(figure.placement);
      const anchor = asString(figure.anchor);
      const asset = asString(figure.asset);
      const optional = figure.optional === true;

      if (placement && placement !== 'hero' && placement !== 'closing' && anchor && !anchors.has(anchor)) {
        issues.push(error(document.slug, `Figure \`${asString(figure.id) || `#${index + 1}`}\` points to missing section anchor \`${anchor}\`.`));
      }

      if (asset && asset.startsWith('/')) {
        const assetPath = path.join(PUBLIC_ROOT, asset.replace(/^\/+/, ''));
        if (!(awaitExists(assetPath))) {
          if (optional) {
            issues.push(warning(document.slug, `Optional figure asset is missing: ${asset}`));
          } else {
            issues.push(error(document.slug, `Figure asset is missing: ${asset}`));
          }
        }
      }
    }
  }

  if (Array.isArray(data.easter_eggs)) {
    for (const [index, eggValue] of data.easter_eggs.entries()) {
      const egg = asObject(eggValue);
      if (!egg) {
        issues.push(error(document.slug, `Easter egg ${index + 1} must be an object.`));
        continue;
      }

      const anchor = asString(egg.anchor);
      if (anchor && !anchors.has(anchor)) {
        issues.push(error(document.slug, `Easter egg \`${asString(egg.id) || `#${index + 1}`}\` points to missing section anchor \`${anchor}\`.`));
      }
    }
  }

  const sourceBridge = asObject(data.source_bridge);
  if (sourceBridge) {
    if (!hasNonEmptyString(sourceBridge.processing_doc)) {
      issues.push(error(document.slug, '`source_bridge.processing_doc` is required when provenance metadata is present.'));
    }

    if (!hasNonEmptyString(sourceBridge.imported_at)) {
      issues.push(error(document.slug, '`source_bridge.imported_at` is required when provenance metadata is present.'));
    }

    if (!hasNonEmptyStringArray(sourceBridge.imported_fields)) {
      issues.push(error(document.slug, '`source_bridge.imported_fields` must record which external fields were imported.'));
    }
  }

  return issues;
}

export function validateRelatedPostsRefs(documents: MarkdownDocument[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validSlugs = new Set(documents.map((d) => d.slug));

  for (const doc of documents) {
    const related = doc.data['related_posts'];
    if (!Array.isArray(related)) continue;

    for (const ref of related) {
      if (typeof ref !== 'string') continue;
      if (!validSlugs.has(ref)) {
        issues.push({
          level: 'warning',
          slug: doc.slug,
          message: `related_posts references unknown slug: '${ref}'`,
        });
      }
    }
  }

  return issues;
}

export function validateSeriesCoherence(documents: MarkdownDocument[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seriesCounts = new Map<string, string[]>();

  for (const doc of documents) {
    const series = doc.data['series'];
    if (typeof series !== 'string' || series.trim().length === 0) continue;
    const slugs = seriesCounts.get(series) ?? [];
    slugs.push(doc.slug);
    seriesCounts.set(series, slugs);
  }

  for (const [series, slugs] of seriesCounts.entries()) {
    if (slugs.length < 2) {
      for (const slug of slugs) {
        issues.push({
          level: 'warning',
          slug,
          message: `series '${series}' has only one post — consider removing the field or adding sibling posts`,
        });
      }
    }
  }

  return issues;
}

export function summarizeIssues(issues: ValidationIssue[]): string {
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');

  const lines = [
    `Validated ${new Set(issues.map((issue) => issue.slug)).size || 0} post(s) with findings.`,
    `Errors: ${errors.length}`,
    `Warnings: ${warnings.length}`,
  ];

  if (errors.length > 0) {
    lines.push('', 'Errors:');
    for (const issue of errors) {
      lines.push(`- [${issue.slug}] ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('', 'Warnings:');
    const groupedWarnings = new Map<string, string[]>();

    for (const issue of warnings) {
      const slugs = groupedWarnings.get(issue.message) ?? [];
      slugs.push(issue.slug);
      groupedWarnings.set(issue.message, slugs);
    }

    for (const [message, slugs] of groupedWarnings.entries()) {
      const preview = slugs.slice(0, 5).join(', ');
      const extra = slugs.length > 5 ? `, +${slugs.length - 5} more` : '';
      lines.push(`- ${message} (${slugs.length} post(s): ${preview}${extra})`);
    }
  }

  return lines.join('\n');
}

export function buildProcessingImportProposal(
  sourceDocument: MarkdownDocument,
  targetDocument: MarkdownDocument,
  importedAt: string,
): ProcessingImportProposal {
  const sourceData = sourceDocument.data;
  const targetData = targetDocument.data;
  const targetSlug = targetDocument.slug;
  const repoAssetBase = `/images/posts/${targetSlug}`;

  const patch: Record<string, unknown> = {
    article_mode: 'signal-essay',
    entry_kind: 'essay',
    hero: compactObject({
      ...(asObject(targetData.hero) ?? {}),
      subtitle: asString(sourceData.subtitle) ?? asString(asObject(targetData.hero)?.subtitle),
      variant: 'image',
    }),
    tags: mergeUniqueStrings(asStringArray(targetData.tags), asStringArray(sourceData.tags)),
    experience: compactObject({
      ...(asObject(targetData.experience) ?? {}),
      framework_axes: compactObject(asObject(sourceData.kha_ba_la_mapping) ?? {}),
    }),
    figures: buildFigureProposal(asObject(sourceData.images), repoAssetBase),
    easter_eggs: buildEasterEggProposal(asObject(sourceData.easter_eggs)),
    source_bridge: compactObject({
      ...(asObject(targetData.source_bridge) ?? {}),
      processing_doc: sourceDocument.filePath,
      platform: asString(sourceData.platform),
      vault_sources: mergeUniqueStrings(asStringArray(asObject(targetData.source_bridge)?.vault_sources), asStringArray(sourceData.vault_sources)),
      placement_guide: resolvePlacementGuidePath(sourceDocument.filePath, asObject(sourceData.images)),
      imported_at: importedAt,
      imported_fields: [
        'hero.subtitle',
        'tags',
        'experience.framework_axes',
        'figures',
        'easter_eggs',
        'source_bridge.platform',
        'source_bridge.vault_sources',
        'source_bridge.placement_guide',
        'source_bridge.quality_gates',
      ],
      quality_gates: compactObject(asObject(sourceData.quality_gates_passed) ?? {}),
    }),
  };

  const unmappedFields = Object.keys(sourceData).filter((key) => {
    return !new Set([
      'title',
      'subtitle',
      'platform',
      'status',
      'tags',
      'vault_sources',
      'kha_ba_la_mapping',
      'images',
      'quality_gates_passed',
      'easter_eggs',
      'date',
    ]).has(key);
  });

  return {
    targetFilePath: targetDocument.filePath,
    targetSlug,
    patch: compactObject(patch),
    unmappedFields,
  };
}

export function mergeFrontmatter(target: PlainObject, patch: PlainObject): PlainObject {
  const next: PlainObject = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      next[key] = value;
      continue;
    }

    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergeFrontmatter(next[key] as PlainObject, value as PlainObject);
      continue;
    }

    next[key] = value;
  }

  return next;
}

function buildFigureProposal(images: PlainObject | undefined, repoAssetBase: string): PlainObject[] {
  if (!images) {
    return [];
  }

  const figures: PlainObject[] = [];
  const figureDefinitions = [
    {
      id: 'header',
      sourceKey: 'header',
      anchor: 'hero',
      placement: 'hero',
      caption: 'The downstream attention waterfall.',
    },
    {
      id: 'coin-toss',
      sourceKey: 'section_02',
      anchor: 'iii-uncertainty-is-the-mechanism',
      placement: 'after-section',
      caption: 'The 50/50 uncertainty window that keeps dopamine alive.',
    },
    {
      id: 'vine-of-determinism',
      sourceKey: 'section_03',
      anchor: 'iv-flat-terrain',
      placement: 'after-section',
      caption: 'The narrowing corridor of preference-shaped attention.',
    },
    {
      id: 'fools-gate',
      sourceKey: 'section_04',
      anchor: 'v-on-the-threshold',
      placement: 'after-section',
      caption: 'The threshold moment where a person finds rather than receives.',
    },
    {
      id: 'easter-egg-economy',
      sourceKey: 'section_05',
      anchor: 'vi-upstream-signals',
      placement: 'after-section',
      caption: 'Signals engineered to be found upstream.',
    },
    {
      id: 'closing-quine',
      sourceKey: 'closing',
      anchor: 'x-the-quine',
      placement: 'closing',
      caption: 'A recursive closing image for the essay’s quine logic.',
    },
  ] as const;

  for (const definition of figureDefinitions) {
    const filename = asString(images[definition.sourceKey]);
    if (!filename) {
      continue;
    }

    figures.push(compactObject({
      id: `processing-${definition.id}`,
      anchor: definition.anchor,
      asset: `${repoAssetBase}/${path.basename(filename)}`,
      alt: definition.caption,
      caption: definition.caption,
      placement: definition.placement,
      reveal: definition.placement === 'hero' ? 'always' : 'ambient',
    }));
  }

  return figures;
}

function buildEasterEggProposal(easterEggs: PlainObject | undefined): PlainObject[] {
  if (!easterEggs) {
    return [];
  }

  const mapping = [
    {
      sourceKey: 'layer_1_vocabulary_signals',
      id: 'processing-vocabulary-signals',
      layer: 'visible',
      kind: 'vocabulary',
      label: 'Vocabulary signals',
      payload: mergeUniqueStrings(asStringArray(asObject(easterEggs.layer_1_vocabulary_signals)?.terms)),
    },
    {
      sourceKey: 'layer_2_section_acrostic',
      id: 'processing-section-acrostic',
      layer: 'discoverable',
      kind: 'structural',
      label: 'Section acrostic',
      payload: [
        asString(asObject(easterEggs.layer_2_section_acrostic)?.sequence),
        ...asStringArray(asObject(easterEggs.layer_2_section_acrostic)?.titles),
      ].filter(Boolean),
      clue: 'Read the section initials in order.',
    },
    {
      sourceKey: 'layer_3_tarot_major_arcana',
      id: 'processing-major-arcana-map',
      layer: 'decoder',
      kind: 'structural',
      label: 'Major Arcana scaffolding',
      payload: asStringArray(asObject(easterEggs.layer_3_tarot_major_arcana)?.mapping),
    },
    {
      sourceKey: 'layer_4_image_serial_codes',
      id: 'processing-image-serial-codes',
      layer: 'decoder',
      kind: 'image',
      label: 'Image serial codes',
      payload: asString(asObject(easterEggs.layer_4_image_serial_codes)?.description),
    },
    {
      sourceKey: 'layer_5_abstract_case_study',
      id: 'processing-abstract-case-study',
      layer: 'discoverable',
      kind: 'navigation',
      label: 'Abstract case study',
      payload: asStringArray(asObject(easterEggs.layer_5_abstract_case_study)?.searchable_details),
    },
    {
      sourceKey: 'layer_6_byline_signal',
      id: 'processing-byline-signal',
      layer: 'visible',
      kind: 'byline',
      label: 'Byline signal',
      payload: asString(asObject(easterEggs.layer_6_byline_signal)?.description),
    },
    {
      sourceKey: 'layer_7_first_sentence_quine',
      id: 'processing-first-sentence-quine',
      layer: 'decoder',
      kind: 'sequence',
      label: 'First-sentence quine',
      payload: asStringArray(asObject(easterEggs.layer_7_first_sentence_quine)?.sequence),
      clue: 'Read the opening sentence of each section as its own compressed essay.',
    },
  ] as const;

  return mapping
    .map((definition) => {
      const source = asObject(easterEggs[definition.sourceKey]);
      if (!source) {
        return null;
      }

      return compactObject({
        id: definition.id,
        layer: definition.layer,
        kind: definition.kind,
        label: definition.label,
        description: asString(source.description),
        clue: 'clue' in definition ? definition.clue : undefined,
        payload: definition.payload,
      });
    })
    .filter(Boolean) as PlainObject[];
}

function resolvePlacementGuidePath(sourceFilePath: string, images: PlainObject | undefined): string | undefined {
  const placementGuide = asString(images?.placement_guide);
  if (!placementGuide) {
    return undefined;
  }

  return path.resolve(path.dirname(sourceFilePath), placementGuide);
}

function hasArticleMetadata(data: PlainObject): boolean {
  return [
    'entry_kind',
    'foundational',
    'concepts',
    'related_posts',
    'hero',
    'experience',
    'figures',
    'easter_eggs',
    'llm',
    'source_bridge',
  ].some((key) => hasValue(data[key]));
}

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isPlainObject(value)) {
    return Object.values(value).some((child) => hasValue(child));
  }

  return value !== undefined && value !== null && value !== '';
}

function hasNonEmptyString(value: unknown): boolean {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return true;
  }

  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => hasNonEmptyString(entry));
}

function mergeUniqueStrings(...values: Array<unknown[]>): string[] {
  return [...new Set(values.flatMap((entries) => asStringArray(entries)))];
}

function asString(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asString(entry))
    .filter(Boolean) as string[];
}

function asObject(value: unknown): PlainObject | undefined {
  return isPlainObject(value) ? (value as PlainObject) : undefined;
}

function compactObject<T extends PlainObject>(value: T): T {
  const next: PlainObject = {};

  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child) && child.length === 0) {
      continue;
    }

    if (isPlainObject(child)) {
      const compacted = compactObject(child as PlainObject);
      if (Object.keys(compacted).length === 0) {
        continue;
      }
      next[key] = compacted;
      continue;
    }

    if (child === undefined || child === null || child === '') {
      continue;
    }

    next[key] = child;
  }

  return next as T;
}

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function awaitExists(filePath: string): boolean {
  return existsSync(filePath);
}

function error(slug: string, message: string): ValidationIssue {
  return { level: 'error', slug, message };
}

function warning(slug: string, message: string): ValidationIssue {
  return { level: 'warning', slug, message };
}
