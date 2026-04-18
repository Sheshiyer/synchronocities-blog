import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsTxt } from '../lib/llmDiscovery';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const site = 'https://synchronocities.tryambakam.com';

  return new Response(buildLlmsTxt(posts, site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
