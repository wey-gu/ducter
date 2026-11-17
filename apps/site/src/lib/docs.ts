import { getCollection, type CollectionEntry } from "astro:content";

export type Doc = CollectionEntry<"docs">;
export const docHref = (d: Doc) => (d.id === "readme" ? "/docs" : `/docs/${d.id}`);
export const docLabel = (d: Doc) => (d.id === "readme" ? "Overview" : d.data.title ?? d.id);

/** Published docs (those with an `order`), in sidebar order. */
export async function publishedDocs(): Promise<Doc[]> {
  const all = await getCollection("docs");
  return all
    .filter((d) => typeof d.data.order === "number")
    .sort((a, b) => a.data.order! - b.data.order!);
}

export interface NavGroup { title: string; docs: Doc[] }

/**
 * The sidebar's groups, read from docs/README.md (D319): each `## Heading` there that links to
 * other pages becomes a group, in the README's own order, so the overview and the sidebar never
 * disagree. Published pages the README doesn't link land in a last group, by their `order`.
 */
export function groupDocs(docs: Doc[], readmeBody: string): NavGroup[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const groups: NavGroup[] = [];
  const placed = new Set<string>();
  let current: NavGroup | null = null;
  for (const line of readmeBody.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = { title: h[1], docs: [] };
      groups.push(current);
      continue;
    }
    if (!current) continue;
    for (const m of line.matchAll(/\]\(([a-z0-9-]+)\.md(?:#[^)]*)?\)/g)) {
      const d = byId.get(m[1]);
      if (d && !placed.has(d.id)) {
        current.docs.push(d);
        placed.add(d.id);
      }
    }
  }
  const out = groups.filter((g) => g.docs.length > 0);
  const readme = byId.get("readme");
  if (readme) {
    placed.add("readme");
    if (out.length) out[0].docs.unshift(readme);
    else out.push({ title: "Docs", docs: [readme] });
  }
  const rest = docs.filter((d) => !placed.has(d.id));
  if (rest.length) out.push({ title: "More", docs: rest });
  return out;
}
