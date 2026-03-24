import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const sorted = [...posts].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const site = 'https://synchronocities.tryambakam.com';

  const sections = [
    '# Synchronocities — Full Content for LLMs',
    '',
    `> ${posts.length} articles. Generated ${new Date().toISOString().split('T')[0]}.`,
    '',
  ];

  for (const post of sorted) {
    const url = `${site}/posts/${post.id}/`;
    const date = post.data.date.toISOString().split('T')[0];
    const tags = post.data.tags.length > 0 ? `Tags: ${post.data.tags.join(', ')}` : '';

    sections.push('---');
    sections.push('');
    sections.push(`## ${post.data.title}`);
    sections.push('');
    sections.push(`URL: ${url}`);
    sections.push(`Date: ${date}`);
    if (post.data.excerpt) sections.push(`Summary: ${post.data.excerpt}`);
    if (tags) sections.push(tags);
    if (post.data.card) sections.push(`Card: ${post.data.card}`);
    if (post.data.suit) sections.push(`Suit: ${post.data.suit}`);
    if (post.data.kosha) sections.push(`Kosha: ${post.data.kosha}`);
    sections.push('');

    // Include the raw markdown body
    if (post.body) {
      sections.push(post.body);
      sections.push('');
    }
  }

  return new Response(sections.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
