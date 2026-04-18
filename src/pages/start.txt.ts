import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildStartTxt } from '../lib/llmDiscovery';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const site = 'https://synchronocities.tryambakam.com';

  return new Response(buildStartTxt(posts, site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
