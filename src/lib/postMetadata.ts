import {
  getArticleExperience,
  resolveArticleMode,
  resolveEntryKind,
  shouldShowInDepthSpiral,
  type ArticleMode,
  type EntryKind,
  type ExperienceDensity,
  type ExperienceRail,
  type ExperienceTheme,
  type LlmPriority,
} from './articleExperience.ts';
export interface HeroMetadata {
  eyebrow?: string;
  subtitle?: string;
  variant?: 'image' | 'text' | 'minimal';
  image?: string;
}

export interface ExperienceMetadata {
  theme?: Exclude<ExperienceTheme, 'tarot'>;
  rail?: ExperienceRail;
  density?: ExperienceDensity;
  decoder?: boolean;
  framework_axes?: Record<string, string>;
}

export interface FigureSlot {
  id: string;
  anchor: string;
  asset: string;
  alt: string;
  caption?: string;
  placement: 'hero' | 'before-section' | 'after-section' | 'inline-right' | 'full-bleed' | 'closing';
  reveal?: 'always' | 'ambient' | 'decoder';
  optional?: boolean;
}

export interface EasterEggSignal {
  id: string;
  layer: 'visible' | 'discoverable' | 'decoder';
  kind: 'vocabulary' | 'structural' | 'image' | 'navigation' | 'byline' | 'sequence';
  label: string;
  description: string;
  anchor?: string;
  clue?: string;
  payload?: string | string[];
}

export interface LlmMetadata {
  start_priority?: LlmPriority;
  summary?: string;
  cluster?: string;
  canonical_questions?: string[];
}

export interface SourceBridgeMetadata {
  processing_doc?: string;
  platform?: string;
  vault_sources?: string[];
  placement_guide?: string;
  imported_at?: string;
  imported_fields?: string[];
  quality_gates?: Record<string, boolean>;
}

export interface PostEntryData {
  title: string;
  date: Date;
  card?: string;
  suit?: 'wands' | 'cups' | 'swords' | 'disks';
  phase?: number;
  location?: string;
  revolution?: number;
  kosha?: 'annamaya' | 'pranamaya' | 'manomaya' | 'vijnanamaya' | 'anandamaya';
  identity?: string;
  excerpt?: string;
  featured_image?: string;
  tags?: string[];
  pinned?: boolean;
  pin_rank?: number;
  draft?: boolean;
  hidden?: boolean;
  article_mode?: Exclude<ArticleMode, 'card-journey'>;
  series?: string;
  entry_kind?: EntryKind;
  foundational?: boolean;
  concepts?: string[];
  related_posts?: string[];
  hero?: HeroMetadata;
  experience?: ExperienceMetadata;
  figures?: FigureSlot[];
  easter_eggs?: EasterEggSignal[];
  llm?: LlmMetadata;
  source_bridge?: SourceBridgeMetadata;
}

export interface PostEntryLike {
  id: string;
  data: PostEntryData;
  body?: string;
}

export interface HeadingOutlineItem {
  depth: 2 | 3;
  text: string;
  slug: string;
}

export interface ReadingMetadata {
  wordCount: number;
  readTimeMinutes: number;
  headings: HeadingOutlineItem[];
}

export interface NormalizedPostEntry {
  slug: string;
  title: string;
  date: Date;
  excerpt?: string;
  tags: string[];
  pinned: boolean;
  pinRank?: number;
  card?: string;
  articleMode: ArticleMode;
  entryKind: EntryKind;
  foundational: boolean;
  series?: string;
  concepts: string[];
  relatedPosts: string[];
  heroImage?: string;
  hero: Required<Pick<HeroMetadata, 'variant'>> & HeroMetadata;
  experience: {
    theme: ExperienceTheme;
    rail: ExperienceRail;
    density: ExperienceDensity;
    decoder: boolean;
    frameworkAxes: Record<string, string>;
  };
  llm: {
    startPriority: LlmPriority;
    summary?: string;
    cluster?: string;
    canonicalQuestions: string[];
  };
  sourceBridge: {
    processingDoc?: string;
    platform?: string;
    vaultSources: string[];
    placementGuide?: string;
    importedAt?: string;
    importedFields: string[];
    qualityGates: Record<string, boolean>;
  };
  figures: FigureSlot[];
  easterEggs: EasterEggSignal[];
}

const DEPTH_SPIRAL_DOC_TAGS = new Set(['hub', 'index', 'overview', 'reference']);
const DEPTH_SPIRAL_DOC_TITLE_PATTERN = /\b(hub|index|overview|reference)\b/i;

export function normalizePostEntry(entry: PostEntryLike): NormalizedPostEntry {
  const articleMode = resolveArticleMode(entry.data);
  const config = getArticleExperience(articleMode);
  const entryKind = resolveEntryKind(entry.data, articleMode);
  const tags = entry.data.tags ?? [];
  const heroImage = entry.data.hero?.image ?? entry.data.featured_image;
  const llmStartPriority = entry.data.llm?.start_priority ?? 'none';
  const foundational = entry.data.foundational ?? llmStartPriority === 'foundational';
  const pinned = entry.data.pinned ?? false;

  return {
    slug: entry.id,
    title: entry.data.title,
    date: entry.data.date,
    excerpt: entry.data.excerpt,
    tags,
    pinned,
    pinRank: pinned ? entry.data.pin_rank : undefined,
    card: entry.data.card,
    articleMode,
    entryKind,
    foundational,
    series: entry.data.series,
    concepts: entry.data.concepts?.length ? entry.data.concepts : tags,
    relatedPosts: entry.data.related_posts ?? [],
    heroImage,
    hero: {
      eyebrow: entry.data.hero?.eyebrow,
      subtitle: entry.data.hero?.subtitle,
      variant: entry.data.hero?.variant ?? (heroImage ? 'image' : 'minimal'),
      image: heroImage,
    },
    experience: {
      theme: entry.data.experience?.theme ?? config.defaultTheme,
      rail: entry.data.experience?.rail ?? config.defaultRail,
      density: entry.data.experience?.density ?? config.defaultDensity,
      decoder: entry.data.experience?.decoder ?? config.supportsDecoder,
      frameworkAxes: entry.data.experience?.framework_axes ?? {},
    },
    llm: {
      startPriority: llmStartPriority,
      summary: entry.data.llm?.summary ?? entry.data.excerpt,
      cluster: entry.data.llm?.cluster,
      canonicalQuestions: entry.data.llm?.canonical_questions ?? [],
    },
    sourceBridge: {
      processingDoc: entry.data.source_bridge?.processing_doc,
      platform: entry.data.source_bridge?.platform,
      vaultSources: entry.data.source_bridge?.vault_sources ?? [],
      placementGuide: entry.data.source_bridge?.placement_guide,
      importedAt: entry.data.source_bridge?.imported_at,
      importedFields: entry.data.source_bridge?.imported_fields ?? [],
      qualityGates: entry.data.source_bridge?.quality_gates ?? {},
    },
    figures: entry.data.figures ?? [],
    easterEggs: entry.data.easter_eggs ?? [],
  };
}

export function isDepthSpiralEligiblePost(
  entry: Pick<NormalizedPostEntry, 'card' | 'articleMode' | 'title' | 'tags'>
): boolean {
  if (entry.card) {
    return true;
  }

  if (!shouldShowInDepthSpiral(entry.articleMode)) {
    return false;
  }

  if (DEPTH_SPIRAL_DOC_TITLE_PATTERN.test(entry.title)) {
    return false;
  }

  return !entry.tags.some((tag) => DEPTH_SPIRAL_DOC_TAGS.has(tag.toLowerCase()));
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractHeadingOutline(markdown = ''): HeadingOutlineItem[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(##|###)\s+/.test(line))
    .map((line) => {
      const depth = line.startsWith('### ') ? 3 : 2;
      const text = line.replace(/^(##|###)\s+/, '').trim();

      return {
        depth,
        text,
        slug: slugifyHeading(text),
      } satisfies HeadingOutlineItem;
    })
    .filter((item) => item.text.length > 0);
}

export function countWords(markdown = ''): number {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[#>*_~-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean).length;
}

export function estimateReadTimeMinutes(markdown = '', wordsPerMinute = 225): number {
  const wordCount = countWords(markdown);
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

export function extractReadingMetadata(markdown = ''): ReadingMetadata {
  const wordCount = countWords(markdown);

  return {
    wordCount,
    readTimeMinutes: Math.max(1, Math.ceil(wordCount / 225)),
    headings: extractHeadingOutline(markdown),
  };
}
