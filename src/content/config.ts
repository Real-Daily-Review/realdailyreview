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
          source: z.string().url().optional(),
        })
      )
      .optional(),
    sources: z
      .array(
        z.object({
          title: z.string(),
          // URL optional — digest articles cite multi-outlet aggregations that don't have a single canonical URL.
          url: z.string().url().optional().or(z.literal('')),
          publisher: z.string().optional(),
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
