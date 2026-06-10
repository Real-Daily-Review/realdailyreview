import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(8).max(120),
    description: z.string().min(40).max(280),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Colorado Daily Review Desk'),
    section: z.enum([
      'digest',
      'politics',
      'elections',
      'economy',
      'national',
      'opinion',
      'explainer',
    ]),
    tags: z.array(z.string()).default([]),
    perspectives: z
      .array(
        z.object({
          label: z.string(),
          summary: z.string(),
          source: z.string().url().optional().nullable(),
        })
      )
      .optional(),
    sources: z
      .array(
        z.object({
          title: z.string(),
          // nullish() accepts both undefined and null — AI generators sometimes emit null
          url: z.string().url().nullish().or(z.literal('')),
          publisher: z.string().nullish(),
        })
      )
      .default([]),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
    aiGenerated: z.boolean().default(true),
    reviewedBy: z.string().optional(),
  }),
});

export const collections = { articles };
