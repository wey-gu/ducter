// The site renders the repo's user docs (docs/*.md) at build time. Only pages with an
// `order` in their front matter are published; anything else in docs/ is ignored.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

export const DOCS_DIR = process.env.DUCTER_DOCS_DIR ?? "../../docs";

const docs = defineCollection({
  loader: glob({ pattern: "*.md", base: DOCS_DIR }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    order: z.number().optional(),
  }),
});

export const collections = { docs };
