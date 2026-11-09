// Gives each table cell its column's name (data-label), so on a phone a table can read as a list
// of rows: the first cell titles the row, the others show their column's name above them.
const text = (n) => (n.type === "text" ? n.value : (n.children ?? []).map(text).join(""));
const kids = (n, tag) => (n.children ?? []).filter((c) => c.type === "element" && c.tagName === tag);

export default function rehypeTableLabels() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === "element" && node.tagName === "table") {
        const head = kids(node, "thead")[0];
        const labels = head ? kids(kids(head, "tr")[0] ?? {}, "th").map((th) => text(th).trim()) : [];
        for (const body of kids(node, "tbody"))
          for (const tr of kids(body, "tr"))
            kids(tr, "td").forEach((td, i) => {
              if (labels[i]) td.properties = { ...td.properties, dataLabel: labels[i] };
            });
        return;
      }
      (node.children ?? []).forEach(walk);
    };
    walk(tree);
  };
}
