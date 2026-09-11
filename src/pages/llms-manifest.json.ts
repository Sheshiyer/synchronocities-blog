import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsManifest } from '../lib/llmDiscovery';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  // Single source of truth: `site` in astro.config.mjs. Hardcoding the host here is
  // what left these four endpoints advertising a dead .com domain after the
  // 2026-09-12 move to tryambakam.space.
  const site = import.meta.env.SITE!.replace(/\/$/, '');
  const manifest = buildLlmsManifest(posts, site);

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
