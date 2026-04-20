import {
  getArticleExperience,
  getArticleThemeTokens,
  type ArticleExperienceConfig,
  type ArticleThemeTokens,
} from './articleExperience.ts';
import {
  extractReadingMetadata,
  normalizePostEntry,
  type EasterEggSignal,
  type FigureSlot,
  type NormalizedPostEntry,
  type PostEntryLike,
  type ReadingMetadata,
} from './postMetadata.ts';

export interface NonCardFigure extends FigureSlot {
  anchorHref?: string;
  anchorLabel?: string;
  placementLabel: string;
}

export interface NonCardFrameworkAxis {
  key: string;
  label: string;
  value: string;
}

export interface NonCardEggGroup {
  layer: EasterEggSignal['layer'];
  label: string;
  collapsed: boolean;
  items: EasterEggSignal[];
}

export interface NonCardArticleModel {
  normalized: NormalizedPostEntry;
  mode: ArticleExperienceConfig;
  theme: ArticleThemeTokens;
  reading: ReadingMetadata;
  frameworkAxes: NonCardFrameworkAxis[];
  heroFigure?: NonCardFigure;
  closingFigure?: NonCardFigure;
  sectionFigures: NonCardFigure[];
  easterEggGroups: NonCardEggGroup[];
  qualityGateSummary: {
    passed: number;
    total: number;
  };
}

const FIGURE_PLACEMENT_LABELS: Record<FigureSlot['placement'], string> = {
  hero: 'Hero figure',
  'before-section': 'Prelude figure',
  'after-section': 'Section figure',
  'inline-right': 'Side figure',
  'full-bleed': 'Full-bleed figure',
  closing: 'Closing figure',
};

const EASTER_EGG_LAYER_ORDER: EasterEggSignal['layer'][] = ['visible', 'discoverable', 'decoder'];
const EASTER_EGG_LAYER_LABELS: Record<EasterEggSignal['layer'], string> = {
  visible: 'Surface signals',
  discoverable: 'Between the lines',
  decoder: 'Decoder ring',
};

export function buildNonCardArticleModel(
  entry: PostEntryLike,
  normalized = normalizePostEntry(entry),
): NonCardArticleModel {
  const reading = extractReadingMetadata(entry.body ?? '');
  const headingsBySlug = new Map(reading.headings.map((heading) => [heading.slug, heading.text]));
  const mode = getArticleExperience(normalized.articleMode);
  const theme = getArticleThemeTokens(normalized.experience.theme);
  const figures = normalized.figures.map((figure) => hydrateFigure(figure, headingsBySlug));
  const heroFigure = figures.find((figure) => figure.placement === 'hero');
  const closingFigure = figures.find((figure) => figure.placement === 'closing');
  const sectionFigures = figures.filter((figure) => !['hero', 'closing'].includes(figure.placement));
  const frameworkAxes = Object.entries(normalized.experience.frameworkAxes).map(([key, value]) => ({
    key,
    label: formatAxisLabel(key),
    value,
  }));
  const easterEggGroups = EASTER_EGG_LAYER_ORDER
    .map((layer) => {
      const items = normalized.easterEggs.filter((egg) => egg.layer === layer);
      if (items.length === 0) {
        return null;
      }

      return {
        layer,
        label: EASTER_EGG_LAYER_LABELS[layer],
        collapsed: layer === 'decoder',
        items,
      } satisfies NonCardEggGroup;
    })
    .filter(Boolean) as NonCardEggGroup[];
  const qualityGateValues = Object.values(normalized.sourceBridge.qualityGates);

  return {
    normalized,
    mode,
    theme,
    reading,
    frameworkAxes,
    heroFigure,
    closingFigure,
    sectionFigures,
    easterEggGroups,
    qualityGateSummary: {
      passed: qualityGateValues.filter(Boolean).length,
      total: qualityGateValues.length,
    },
  };
}

function hydrateFigure(
  figure: FigureSlot,
  headingsBySlug: Map<string, string>,
): NonCardFigure {
  const anchorLabel = figure.anchor === 'hero'
    ? 'Hero'
    : headingsBySlug.get(figure.anchor) ?? formatAnchorLabel(figure.anchor);

  return {
    ...figure,
    anchorHref: figure.anchor === 'hero' ? undefined : `#${figure.anchor}`,
    anchorLabel,
    placementLabel: FIGURE_PLACEMENT_LABELS[figure.placement],
  };
}

function formatAxisLabel(key: string): string {
  if (key.length <= 3) {
    return key.toUpperCase();
  }

  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatAnchorLabel(anchor: string): string {
  return anchor
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
