import { getCollection, type CollectionEntry } from "astro:content";

export type Doc = CollectionEntry<"docs">;
export const docHref = (d: Doc) => (d.id === "readme" ? "/docs" : `/docs/${d.id}`);

/** Published docs (those with an `order`), in sidebar order. */
export async function publishedDocs(): Promise<Doc[]> {
  const all = await getCollection("docs");
  return all
    .filter((d) => typeof d.data.order === "number")
    .sort((a, b) => a.data.order! - b.data.order!);
}
