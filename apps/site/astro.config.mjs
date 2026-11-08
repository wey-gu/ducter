import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import remarkDocLinks from "./src/lib/remark-doc-links.mjs";

export default defineConfig({
  site: "https://ducter.ai",
  output: "static",
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always", format: "file" },
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkDocLinks],
    shikiConfig: { theme: "github-light" },
  },
  devToolbar: { enabled: false },
});
