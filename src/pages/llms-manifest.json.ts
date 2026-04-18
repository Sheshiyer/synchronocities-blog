import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsManifest } from '../lib/llmDiscovery';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const site = 'https://synchronocities.tryambakam.com';
  const manifest = buildLlmsManifest(posts, site);

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
