import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { computedSidebar } from '../sidebar.mjs';

export default defineConfig({
  site: 'https://docs.anywaye.com',
  base: '/notes',
  srcDir: 'notes-site/src',
  outDir: 'dist/notes',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'anywaye notes',
      description:
        'anywaye private notes — decisions, operations, debt and the notes that never belonged in a public repository.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/anywaye' }],
      credits: true,
      disable404Route: true,
      pagefind: false,
      lastUpdated: false,
      sidebar: computedSidebar('notes-site/src/content/docs', 'Notes'),
    }),
  ],
});
