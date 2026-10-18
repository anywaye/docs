// notes-site/src/content.config.ts — the private site's single collection.
//
// notes-site/src/content/docs/ is owned by bin/sync-content: it is cleared and
// rebuilt on every build from the notes repository and each private
// repository's notes/ tree. Nothing in this repository authors its content,
// which is why there is no advisory extension here — advisories are a public
// feed (see src/content.config.ts on the public side) and private notes are a
// register, not a dated feed.
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // Plain docsSchema: title and description are required, so a synced page
    // missing either fails the build. No advisory block is extended because
    // the notes repository has no advisories collection; when private notes
    // grow a dated feed, that feed's fields are added here in the same commit
    // as the first page that uses them.
    schema: docsSchema({
      extend: z.object({
        // Optional role tags for future role-based private builds. Absent means
        // "all operators" (the current org-level privacy model). Ignored by
        // the build today; consumed only when role-based builds are wired up.
        roles: z.array(z.string().min(1)).optional(),
      }),
    }),
  }),
  // Empty like the public site's: Starlight queries the i18n collection on
  // every build and warns when it is undefined. English-only until a decision
  // to maintain a translation in step with the English pages.
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
