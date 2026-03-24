// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath, URL } from 'node:url';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import glsl from 'vite-plugin-glsl';

// https://astro.build/config
export default defineConfig({
  site: 'https://synchronocities.tryambakam.com',
  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss(), glsl()],
    resolve: {
      alias: {
        '@experience': fileURLToPath(new URL('./src/experience', import.meta.url)),
      },
    },
  },
});