// Every relative link in the repo's Markdown resolves to a file or folder that exists.
//   bun scripts/check-links.ts          # exit 1 and list the broken links
// Checks [text](target) and <img src="target">, outside code fences and inline code.
// URLs, mail links and same-page anchors are skipped; "#fragment" on a file link is ignored.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const listed = Bun.spawnSync(
  ["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.md"],
  { cwd: root },
);
const files = listed.stdout.toString().split("\n").filter((f) => f && existsSync(join(root, f)));

const LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img[^>]*\ssrc="([^"]+)"/g;
const broken: string[] = [];

for (const file of files) {
  const text = await Bun.file(join(root, file)).text();
  let fenced = false;
  text.split("\n").forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    const bare = line.replace(/`[^`]*`/g, (code) => " ".repeat(code.length));
    for (const m of bare.matchAll(LINK)) {
      const target = m[1] ?? m[2];
      if (!target || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
      const path = decodeURIComponent(target.split("#")[0]!.split("?")[0]!);
      if (!path) continue;
      const abs = path.startsWith("/") ? join(root, path) : join(root, dirname(file), path);
      if (!existsSync(abs)) broken.push(`${file}:${i + 1}: ${target}`);
    }
  });
}

if (broken.length) {
  console.error(`${broken.length} broken relative link(s):\n${broken.join("\n")}`);
  process.exit(1);
}
console.log(`links ok: ${files.length} Markdown files`);
