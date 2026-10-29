import { defineCollection } from 'astro:content';
// `z` comes from astro/zod and NOT from astro:content. `astro:content`'s export
// is the raw `zod/v4` core surface (`z.core.$strip` and friends); Starlight's
// docsSchema() reads `_zod.def` off whatever it deep-merges, which is a shape
// only `astro/zod`'s `z` produces. Getting this wrong fails `astro sync` with
// "Cannot read properties of undefined (reading 'def')" at build time, which
// names neither the file nor the field.
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        advisory: z
          .object({
            id: z
              .string()
              .regex(
                /^ANYWAYE-ADV-\d{4}-\d{3}$/,
                'advisory ids look like ANYWAYE-ADV-2026-001 — the year of publication and a three-digit sequence',
              ),
            published: z.coerce.date(),
            severity: z.enum(['low', 'moderate', 'high', 'critical']),
            affects: z.array(z.string().min(1)).min(1),
            source: z.string().min(1),
            status: z.enum(['open', 'fixed']),
          })
          .optional(),
      }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
