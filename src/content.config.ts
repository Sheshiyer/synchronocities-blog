import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  ARTICLE_MODE_VALUES,
  EASTER_EGG_KIND_VALUES,
  EASTER_EGG_LAYER_VALUES,
  ENTRY_KIND_VALUES,
  EXPERIENCE_DENSITY_VALUES,
  EXPERIENCE_RAIL_VALUES,
  EXPERIENCE_THEME_VALUES,
  FIGURE_PLACEMENT_VALUES,
  FIGURE_REVEAL_VALUES,
  LLM_PRIORITY_VALUES,
  NON_CARD_ARTICLE_MODE_VALUES,
  NON_TAROT_THEME_VALUES,
} from './lib/articleExperience';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    card: z.string().optional(), // Major Arcana numeral: "XVI", "XVII", etc.
    suit: z.enum(['wands', 'cups', 'swords', 'disks']).optional(),
    phase: z.number().min(1).max(12).optional(), // Hero's Journey phase
    location: z.string().optional(),
    revolution: z.number().default(1), // Which spiral revolution
    kosha: z.enum(['annamaya', 'pranamaya', 'manomaya', 'vijnanamaya', 'anandamaya']).optional(),
    identity: z.string().optional(), // Identity state at time of writing
    excerpt: z.string().optional(),
    featured_image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
    pin_rank: z.number().int().min(1).optional(),
    draft: z.boolean().default(false),
    hidden: z.boolean().default(false), // Hidden from gallery but visible on /journeys
    article_mode: z.enum(NON_CARD_ARTICLE_MODE_VALUES).optional(),
    series: z.string().optional(),
    entry_kind: z.enum(ENTRY_KIND_VALUES).optional(),
    foundational: z.boolean().default(false),
    concepts: z.array(z.string()).default([]),
    related_posts: z.array(z.string()).default([]),
    hero: z.object({
      eyebrow: z.string().optional(),
      subtitle: z.string().optional(),
      variant: z.enum(['image', 'text', 'minimal']).optional(),
      image: z.string().optional(),
    }).optional(),
    prompts: z.object({
      card_image: z.string(),
      hero_image: z.string(),
    }).optional(), // Image-generation prompts used to produce card/hero art
    experience: z.object({
      theme: z.enum(NON_TAROT_THEME_VALUES).optional(),
      rail: z.enum(EXPERIENCE_RAIL_VALUES).optional(),
      density: z.enum(EXPERIENCE_DENSITY_VALUES).optional(),
      decoder: z.boolean().optional(),
      framework_axes: z.record(z.string(), z.string()).optional(),
    }).optional(),
    figures: z.array(z.object({
      id: z.string(),
      anchor: z.string(),
      asset: z.string(),
      alt: z.string(),
      caption: z.string().optional(),
      placement: z.enum(FIGURE_PLACEMENT_VALUES),
      reveal: z.enum(FIGURE_REVEAL_VALUES).optional(),
      optional: z.boolean().optional(),
    })).default([]),
    easter_eggs: z.array(z.object({
      id: z.string(),
      layer: z.enum(EASTER_EGG_LAYER_VALUES),
      kind: z.enum(EASTER_EGG_KIND_VALUES),
      label: z.string(),
      description: z.string(),
      anchor: z.string().optional(),
      clue: z.string().optional(),
      payload: z.union([z.string(), z.array(z.string())]).optional(),
    })).default([]),
    llm: z.object({
      start_priority: z.enum(LLM_PRIORITY_VALUES).optional(),
      summary: z.string().optional(),
      cluster: z.string().optional(),
      canonical_questions: z.array(z.string()).default([]),
    }).optional(),
    source_bridge: z.object({
      processing_doc: z.string().optional(),
      platform: z.string().optional(),
      vault_sources: z.array(z.string()).default([]),
      placement_guide: z.string().optional(),
      imported_at: z.string().optional(),
      imported_fields: z.array(z.string()).default([]),
      quality_gates: z.record(z.string(), z.boolean()).optional(),
    }).optional(),
    crosspost: z.object({
      x: z.boolean().default(false),
      substack: z.boolean().default(false),
    }).optional(),
  }),
});

export const collections = { posts };
