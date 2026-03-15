import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    draft: z.boolean().default(false),
    hidden: z.boolean().default(false), // Easter egg posts — not shown in main gallery
    crosspost: z.object({
      x: z.boolean().default(false),
      substack: z.boolean().default(false),
    }).optional(),
  }),
});

export const collections = { posts };
