// Every relative link in the repo's Markdown resolves to a file or folder that exists.
//   bun scripts/check-links.ts          # exit 1 and list the broken links
// Checks [text](target) and <img src="target">, outside code fences and inline code.
// URLs and mail links are skipped. A "#fragment" pointing into a Markdown file (or the same
// page) must match one of its headings, slugged the way GitHub does it.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const listed = Bun.spawnSync(
  ["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.md"],
  { cwd: root },
);
const files = listed.stdout.toString().split("\n").filter((f) => f && existsSync(join(root, f)));

const slugs = new Map<string, Set<string>>();
async function anchors(abs: string): Promise<Set<string>> {
  let set = slugs.get(abs);
  if (set) return set;
  set = new Set();
  const seen = new Map<string, number>();
  let fence = false;
  for (const line of (await Bun.file(abs).text()).split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const text = h[1]!.replace(/`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    set.add(n ? `${base}-${n}` : base);
  }
  slugs.set(abs, set);
  return set;
}

const LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img[^>]*\ssrc="([^"]+)"/g;
const broken: string[] = [];

for (const file of files) {
  const text = await Bun.file(join(root, file)).text();
  let fenced = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const bare = line.replace(/`[^`]*`/g, (code) => " ".repeat(code.length));
    for (const m of bare.matchAll(LINK)) {
      const target = m[1] ?? m[2];
      if (!target || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
      const [rawPath, frag] = target.split("#") as [string, string | undefined];
      const path = decodeURIComponent(rawPath.split("?")[0]!);
      const abs = !path ? join(root, file) : path.startsWith("/") ? join(root, path) : join(root, dirname(file), path);
      if (!existsSync(abs)) broken.push(`${file}:${i + 1}: ${target}`);
      else if (frag && abs.endsWith(".md") && !(await anchors(abs)).has(decodeURIComponent(frag).toLowerCase()))
        broken.push(`${file}:${i + 1}: ${target} (no such heading)`);
    }
  }
}

if (broken.length) {
  console.error(`${broken.length} broken relative link(s):\n${broken.join("\n")}`);
  process.exit(1);
}
console.log(`links ok: ${files.length} Markdown files`);
