// src/content.config.ts — Starlight's content collections.
//
// docsLoader() reads Markdown/MDX from src/content/docs/ and ignores files whose
// name starts with `_`. docsSchema() is what validates frontmatter: `title` and
// `description` are the required fields, so a page missing either fails the
// build instead of shipping an untitled page or an empty meta description.
//
// No custom fields are extended. When one is added, extend it here in the same
// commit as the first page that uses it — a schema that drifts from its content
// is how a field starts being optional in practice and only optional on paper.
//
// STICKING TO THE DOCS COLLECTION RATHER THAN ADDING A SECOND ONE
//   The advisories (OPS-P14) are a dated feed, which is the one shape a
//   hand-written Markdown directory does not obviously want: the frontmatter
//   carries fields the format depends on (an id, a publish date, a severity),
//   and a feed whose index is not derived from its entries is an index that
//   drifts.
//
//   A second content collection was considered and rejected, and the reason is
//   not effort. Starlight's sidebar — the one claim this repository makes about
//   which pages exist — only links pages of the docs collection, and
//   tests/smoke.mjs walks src/content/docs/ to assert that every page on disk
//   is reachable from it. A collection outside that directory is invisible to
//   both, so every advisory would be a page nothing navigates to and nothing
//   checks. The advisory fields are therefore extended onto the docs schema
//   below, kept optional because the other sixty-odd pages have no advisory
//   metadata, and tests/advisories.mjs closes the gap that optionality opens:
//   it derives the expected metadata from every page under advisories/ and
//   fails when one is missing, malformed, duplicated, or absent from the index.
import { defineCollection } from 'astro:content';
// `z` comes from astro/zod and NOT from astro:content. They are two different
// zod instances, and Starlight's docsSchema() deep-merges an extended schema
// into its own using internals (`_zod.def`) that only resolve for the zod it
// imported itself. Getting this wrong fails `astro sync` with
// "Cannot read properties of undefined (reading 'def')" at build time, which
// names neither the file nor the field.
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: {
        // Advisory metadata. Present on every page under
        // src/content/docs/advisories/ except the index, absent everywhere
        // else — asserted in tests/advisories.mjs, in both directions, because
        // an optional field nothing checks is a field that is only present
        // until somebody forgets it.
        advisory: z
          .object({
            // The identifier a reader quotes. Stable: an advisory that is
            // corrected keeps its id, because a report that cites it has
            // already gone out.
            id: z
              .string()
              .regex(
                /^CAFAYE-ADV-\d{4}-\d{3}$/,
                'advisory ids look like CAFAYE-ADV-2026-001 — the year of publication and a three-digit sequence',
              ),
            published: z.coerce.date(),
            severity: z.enum(['low', 'moderate', 'high', 'critical']),
            // What the condition applies to. One or more service or tool
            // names, so a reader can rule themselves out in one line.
            affects: z.array(z.string().min(1)).min(1),
            // The file, command or measurement the claim came from. This is the
            // field that keeps the feed honest: an advisory whose source is
            // prose elsewhere in this repository is a claim that cannot be
            // re-derived, and the rule here is that a condition the fleet has
            // not observed is not published.
            source: z.string().min(1),
            // `open` — still true of the current cafaye source; the fix is
            //        something an operator does.
            // `fixed` — cafaye no longer ships the condition, and the advisory
            //           stands for operators whose copy predates the fix.
            status: z.enum(['open', 'fixed']),
          })
          .optional(),
      },
    }),
  }),
  // Starlight queries the i18n collection on every build even for an
  // English-only site, and warns when it is undefined. Declaring it empty (see
  // src/content/i18n/en.json) keeps the build output clean. Add a language only
  // with a decision to maintain it in step with the English pages — a half
  // translated docs site is worse than an English-only one.
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
