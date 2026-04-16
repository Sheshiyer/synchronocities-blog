export const ARTICLE_MODE_VALUES = [
  'card-journey',
  'signal-essay',
  'research-essay',
  'field-note',
  'hub',
  'reference',
] as const;
export const NON_CARD_ARTICLE_MODE_VALUES = [
  'signal-essay',
  'research-essay',
  'field-note',
  'hub',
  'reference',
] as const;

export const ENTRY_KIND_VALUES = ['essay', 'hub', 'reference'] as const;
export const EXPERIENCE_THEME_VALUES = ['tarot', 'signal', 'lab', 'pilgrim', 'atlas', 'codex'] as const;
export const NON_TAROT_THEME_VALUES = ['signal', 'lab', 'pilgrim', 'atlas', 'codex'] as const;
export const EXPERIENCE_RAIL_VALUES = ['none', 'concept', 'timeline', 'index'] as const;
export const EXPERIENCE_DENSITY_VALUES = ['minimal', 'standard', 'immersive'] as const;
export const EASTER_EGG_LAYER_VALUES = ['visible', 'discoverable', 'decoder'] as const;
export const EASTER_EGG_KIND_VALUES = ['vocabulary', 'structural', 'image', 'navigation', 'byline', 'sequence'] as const;
export const FIGURE_PLACEMENT_VALUES = ['hero', 'before-section', 'after-section', 'inline-right', 'full-bleed', 'closing'] as const;
export const FIGURE_REVEAL_VALUES = ['always', 'ambient', 'decoder'] as const;
export const LLM_PRIORITY_VALUES = ['none', 'supporting', 'foundational'] as const;

export type ArticleMode = (typeof ARTICLE_MODE_VALUES)[number];
export type EntryKind = (typeof ENTRY_KIND_VALUES)[number];
export type ExperienceTheme = (typeof EXPERIENCE_THEME_VALUES)[number];
export type ExperienceRail = (typeof EXPERIENCE_RAIL_VALUES)[number];
export type ExperienceDensity = (typeof EXPERIENCE_DENSITY_VALUES)[number];
export type EasterEggLayer = (typeof EASTER_EGG_LAYER_VALUES)[number];
export type EasterEggKind = (typeof EASTER_EGG_KIND_VALUES)[number];
export type FigurePlacement = (typeof FIGURE_PLACEMENT_VALUES)[number];
export type FigureReveal = (typeof FIGURE_REVEAL_VALUES)[number];
export type LlmPriority = (typeof LLM_PRIORITY_VALUES)[number];

export interface ArticleExperienceConfig {
  mode: ArticleMode;
  label: string;
  entryKind: EntryKind;
  description: string;
  defaultTheme: ExperienceTheme;
  defaultRail: ExperienceRail;
  defaultDensity: ExperienceDensity;
  supportsDecoder: boolean;
}

export interface ArticleModeResolverInput {
  card?: string;
  article_mode?: Exclude<ArticleMode, 'card-journey'>;
  entry_kind?: EntryKind;
}

export const ARTICLE_EXPERIENCE_REGISTRY: Record<ArticleMode, ArticleExperienceConfig> = {
  'card-journey': {
    mode: 'card-journey',
    label: 'Card Journey',
    entryKind: 'essay',
    description: 'Tarot-native immersive travel and consciousness entries.',
    defaultTheme: 'tarot',
    defaultRail: 'timeline',
    defaultDensity: 'immersive',
    supportsDecoder: false,
  },
  'signal-essay': {
    mode: 'signal-essay',
    label: 'Signal Essay',
    entryKind: 'essay',
    description: 'Flagship non-card essay with layered reveals and guided discovery.',
    defaultTheme: 'signal',
    defaultRail: 'concept',
    defaultDensity: 'immersive',
    supportsDecoder: true,
  },
  'research-essay': {
    mode: 'research-essay',
    label: 'Research Essay',
    entryKind: 'essay',
    description: 'Dense explanatory synthesis with lighter ornament and strong structure.',
    defaultTheme: 'lab',
    defaultRail: 'concept',
    defaultDensity: 'standard',
    supportsDecoder: false,
  },
  'field-note': {
    mode: 'field-note',
    label: 'Field Note',
    entryKind: 'essay',
    description: 'Chronology-forward observational writing with restrained sidecar behavior.',
    defaultTheme: 'pilgrim',
    defaultRail: 'timeline',
    defaultDensity: 'standard',
    supportsDecoder: false,
  },
  hub: {
    mode: 'hub',
    label: 'Hub',
    entryKind: 'hub',
    description: 'Map-of-content entry point designed to route readers into a cluster.',
    defaultTheme: 'atlas',
    defaultRail: 'index',
    defaultDensity: 'standard',
    supportsDecoder: false,
  },
  reference: {
    mode: 'reference',
    label: 'Reference',
    entryKind: 'reference',
    description: 'Utility-first reference artifact optimized for retrieval and indexing.',
    defaultTheme: 'codex',
    defaultRail: 'none',
    defaultDensity: 'minimal',
    supportsDecoder: false,
  },
};

export function resolveArticleMode(input: ArticleModeResolverInput): ArticleMode {
  if (input.card) {
    return 'card-journey';
  }

  if (input.article_mode) {
    return input.article_mode;
  }

  if (input.entry_kind === 'hub') {
    return 'hub';
  }

  if (input.entry_kind === 'reference') {
    return 'reference';
  }

  return 'research-essay';
}

export function resolveEntryKind(input: ArticleModeResolverInput, mode = resolveArticleMode(input)): EntryKind {
  return input.entry_kind ?? ARTICLE_EXPERIENCE_REGISTRY[mode].entryKind;
}

export function getArticleExperience(mode: ArticleMode): ArticleExperienceConfig {
  return ARTICLE_EXPERIENCE_REGISTRY[mode];
}
