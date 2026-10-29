import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { computedSidebar, lastBuildMode } from './sidebar.mjs';

function CURATED_SIDEBAR() {
  return [
        { label: 'Home', link: '/' },
        {
          label: 'Pricing, licence and security',
          items: [{ slug: 'commercial' }, { slug: 'security' }],
        },
        {
          label: 'Start here',
          items: [{ slug: 'getting-started' }],
        },
        {
          label: 'Upgrading',
          items: [{ slug: 'upgrading' }],
        },
        {
          label: 'Architecture',
          items: [
            { slug: 'architecture' },
            { slug: 'observability' },
            { slug: 'error-tracking' },
          ],
        },
        {
          label: 'Services',
          items: [{ autogenerate: { directory: 'services' } }],
        },

        {
          label: 'Projects',
          items: [{ autogenerate: { directory: 'projects' } }],
        },
        {
          label: 'Errors',
          collapsed: true,
          items: [{ autogenerate: { directory: 'errors' } }],
        },
        {
          label: 'Runbooks',
          items: [
            { slug: 'runbooks' },
            { slug: 'runbooks/deployment' },
            { slug: 'runbooks/backup-and-restore' },
            { slug: 'runbooks/secret-rotation' },
            { slug: 'runbooks/service-down' },
          ],
        },
        {
          label: 'Advisories',
          items: [{ autogenerate: { directory: 'advisories' } }],
        },
        { slug: 'troubleshooting' },
        { slug: 'guides' },
      ]
}

export default defineConfig({
  site: 'https://docs.anywaye.com',
  outDir: 'dist/docs',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'anywaye',
      description:
        'anywaye — the open-source, multi-language SaaS platform. One CLI, independent services, connected by typed contracts.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/anywaye' }],
      editLink: {
        baseUrl: 'https://github.com/anywaye/docs/edit/master/src/content/docs/',
      },
      credits: true,
      disable404Route: true,
      pagefind: false,
      lastUpdated: false,
      sidebar: lastBuildMode() === 'source'
        ? computedSidebar('src/content/docs', 'docs')
        : CURATED_SIDEBAR()
    }),
  ],
});