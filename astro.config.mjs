import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  // hybrid: static pages pre-rendered, API routes (cron handlers) run as serverless functions
  output: 'hybrid',
  adapter: vercel({
    webAnalytics: { enabled: false },
    imageService: false,
  }),
  site: 'https://realdailyreview.com',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/preview'),
    }),
  ],
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  compressHTML: true,
  vite: {
    build: {
      cssCodeSplit: true,
    },
  },
});
