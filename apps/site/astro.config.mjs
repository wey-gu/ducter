import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import remarkDocLinks from "./src/lib/remark-doc-links.mjs";
import rehypeTableLabels from "./src/lib/rehype-table-labels.mjs";

export default defineConfig({
  site: "https://ducter.ai",
  output: "static",
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always", format: "file" },
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkDocLinks],
    rehypePlugins: [rehypeTableLabels],
    shikiConfig: { theme: "github-light" },
  },
  devToolbar: { enabled: false },
});
