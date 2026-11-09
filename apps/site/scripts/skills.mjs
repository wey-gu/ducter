// Copies the Agent Skills (skills/<name>/ at the repo root) into public/skills/ before a build,
// so an agent can fetch https://ducter.ai/skills/<name>/SKILL.md. The repo's folder is the source;
// public/skills/ is generated and gitignored.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(site, "..", "..", "skills");
const out = join(site, "public", "skills");
rmSync(out, { recursive: true, force: true });
if (!existsSync(src)) {
  console.log("skills: no skills/ folder; skipped");
  process.exit(0);
}
mkdirSync(out, { recursive: true });
const names = readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(src, d.name, "SKILL.md")));
for (const d of names) cpSync(join(src, d.name), join(out, d.name), { recursive: true });
console.log(`skills: ${names.map((d) => d.name).join(", ")} → public/skills/`);
