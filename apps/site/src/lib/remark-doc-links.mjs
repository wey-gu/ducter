// Rewrites links inside docs/*.md so they work on the site:
//   install.md#x  -> /docs/install#x        README.md -> /docs
//   ../README.md  -> the file on GitHub
// It also drops the page's own leading "# Title" (the layout renders the title).
const REPO_BLOB = "https://github.com/wey-gu/ducter/blob/main/";

export default function remarkDocLinks() {
  return (tree) => {
    if (tree.children?.[0]?.type === "heading" && tree.children[0].depth === 1) tree.children.shift();
    const walk = (node) => {
      if (node.type === "link" && typeof node.url === "string") {
        const url = node.url;
        if (/^[a-z]+:|^#|^\//i.test(url)) return;
        const [path, hash = ""] = url.split("#");
        const h = hash ? "#" + hash : "";
        if (!path.includes("/") && path.endsWith(".md")) {
          const slug = path.replace(/\.md$/, "").toLowerCase();
          node.url = (slug === "readme" ? "/docs" : "/docs/" + slug) + h;
        } else if (path.startsWith("../")) {
          node.url = REPO_BLOB + path.slice(3) + h;
        }
      }
      if (node.children) node.children.forEach(walk);
    };
    walk(tree);
  };
}
