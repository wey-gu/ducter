// Get started (D326): the sentence a visitor pastes into their AI agent points at a guide that exists
// and covers the path it names, and the docs say the same sentence. No network.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", "..");
const start = readFileSync(join(import.meta.dir, "..", "src", "pages", "start.astro"), "utf8");
const skill = readFileSync(join(root, "skills", "ducter-deploy", "SKILL.md"), "utf8");
const forAgents = readFileSync(join(root, "docs", "for-agents.md"), "utf8").replace(/\n> /g, " ");
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("Get started", () => {
  test("the agent sentence points at the deploy skill the site serves", () => {
    expect(start).toContain('const SKILL = "https://ducter.ai/skills/ducter-deploy/SKILL.md"');
    expect(skill).toStartWith("---\nname: ducter-deploy");
  });
  test("the skill covers both paths the page offers", () => {
    expect(skill).toContain("## Mac");
    expect(skill).toContain("## Linux server (home)");
  });
  test("for-agents.md gives the same two sentences", () => {
    const mac = "Set up Ducter on this Mac for me. Follow the guide at https://ducter.ai/skills/ducter-deploy/SKILL.md";
    const server = "Set up Ducter on my server for me, so my phone and Mac can reach it. Follow the guide at https://ducter.ai/skills/ducter-deploy/SKILL.md";
    expect(start).toContain("Set up Ducter on this Mac for me. Follow the guide at ${SKILL}");
    expect(flat(forAgents)).toContain(mac);
    expect(flat(forAgents)).toContain(server);
  });
  test("every path is a radio the CSS can show without JavaScript", () => {
    for (const p of ["mac", "server", "unsure"]) {
      expect(start).toContain(`id="live-${p}"`);
      expect(start).toContain(`id="path-${p}"`);
    }
    const css = readFileSync(join(import.meta.dir, "..", "src", "styles", "site.css"), "utf8");
    expect(css).toContain(".start-page:has(#live-mac:checked) .path:not(#path-mac)");
  });
  // D347: someone who already has Ducter finds how to add a computer, and the skill section the
  // sentence names exists. The section is never a .path, so choosing a path never hides it.
  test("Already have Ducter? leads to Add another computer, whatever path is chosen", () => {
    expect(start).toContain('<a href="#add-computer">Add another computer →</a>');
    expect(start).toMatch(/<section class="dl-sec add-computer" id="add-computer"/);
    expect(start).not.toMatch(/class="path[^"]*" id="add-computer"/);
    expect(start).toContain('href="/docs/add-a-computer"');
    expect(skill).toContain("## Add a worker (Add a computer for tasks)");
    expect(skill).toContain("sh -s -- worker <address>");
    expect(readFileSync(join(import.meta.dir, "..", "src", "pages", "download.astro"), "utf8")).toContain('href="/docs/add-a-computer"');
  });
});
