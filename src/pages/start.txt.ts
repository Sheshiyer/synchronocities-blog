import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildStartTxt } from '../lib/llmDiscovery';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  // Single source of truth: `site` in astro.config.mjs. Hardcoding the host here is
  // what left these four endpoints advertising a dead .com domain after the
  // 2026-09-12 move to tryambakam.space.
  const site = import.meta.env.SITE!.replace(/\/$/, '');

  return new Response(buildStartTxt(posts, site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
