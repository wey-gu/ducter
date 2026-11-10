// D172: every release after 0.0.7 says what's new in both languages, in a whats-new block of its
// CHANGELOG section (the release body is that section; release.ts reads the block). A card shows
// its own language's lines whole, so each line is short; none is cut, none is the other language.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compareVersions } from "@ducter/protocol/src/version.ts";
import { NOTE_MAX, whatsNew } from "../src/release.ts";

const changelog = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");

test("each release after 0.0.7 has short zh and en what's-new lines", () => {
  const sections = changelog.split(/^## /m).slice(1);
  expect(sections.length).toBeGreaterThan(0);
  for (const s of sections) {
    const version = s.split("\n")[0]!.trim().replace(/^\[|\]$/g, "").replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+/.test(version) || (compareVersions(version, "0.0.7") ?? 0) <= 0) continue;
    const n = whatsNew(s);
    expect({ version, zh: n.zh?.length ?? 0, en: n.en?.length ?? 0 }).toMatchObject({ version, zh: expect.any(Number), en: expect.any(Number) });
    expect(n.zh?.length, `${version}: no zh line in its whats-new block`).toBeGreaterThan(0);
    expect(n.en?.length, `${version}: no en line in its whats-new block`).toBeGreaterThan(0);
    // A line too long for a card is dropped by whatsNew: the block must have none.
    const raw = /<!--\s*whats-new\b([\s\S]*?)-->/.exec(s)![1]!;
    for (const l of raw.split("\n")) {
      const m = /^\s*(zh|en)\s*[:：]\s*(.+?)\s*$/.exec(l);
      if (m) expect([...m[2]!].length, `${version} ${m[1]}: "${m[2]}" is longer than a card shows`).toBeLessThanOrEqual(NOTE_MAX[m[1] as "zh" | "en"]);
    }
  }
});
