import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const sorted = [...posts].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const site = 'https://synchronocities.tryambakam.com';

  const lines = [
    '# Synchronocities',
    '',
    '> A spiral mandala of lived archetypes — travel journals, consciousness architecture, vedic mathematics, enneagram frameworks, and esoteric systems thinking. A Tryambakam Noesis sub-brand.',
    '',
    `The site contains ${posts.length} articles across multiple domains of inquiry.`,
    '',
    '## Topics',
    '',
    '- Travel Journals (Major Arcana journey through Thailand, China, and beyond)',
    '- Consciousness Architecture & Runtime Patterns',
    '- Vedic Mathematical Systems (Lorenz-Kundli, Ashtakavarga)',
    '- Enneagram Framework Integration',
    '- Endocrine System & Bioelectric Field Theory',
    '- Tarot & Astrology as System Design',
    '- Unix/Consciousness Parallels',
    '',
    '## Articles',
    '',
    ...sorted.map((post) => {
      const url = `${site}/posts/${post.id}/`;
      const tags = post.data.tags.length > 0 ? ` [${post.data.tags.join(', ')}]` : '';
      const excerpt = post.data.excerpt ? `  ${post.data.excerpt}` : '';
      return [
        `- [${post.data.title}](${url})${tags}`,
        excerpt ? `  ${excerpt}` : '',
      ].filter(Boolean).join('\n');
    }),
    '',
    '## Links',
    '',
    `- Sitemap: ${site}/sitemap-index.xml`,
    `- Full content for LLMs: ${site}/llms-full.txt`,
    `- Archive: ${site}/journeys/`,
    `- Depth Gallery: ${site}/`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
