// D547: the composer, polished, and Settings' Overview for a thumb. The author on the phone: the
// task's words squeezed to 9 px by the chip and the meter, the partner's placeholder cut at 320, the
// meter jumping as the words grew, square buttons in a round card, Overview's seven tall cards.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { longestThatFits, WORDS_LINES } from "../src/composer.tsx";
import { strings } from "../src/i18n.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const tail = css.slice(css.indexOf("D547: the composer, polished"));
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

describe("D547: the placeholder is never cut", () => {
  test("the longest that fits, else the shortest", () => {
    const w = (s: string) => s.length * 10;
    expect(longestThatFits(["Say something to Ducter…", "Message Ducter…", "Message…"], w, 300)).toBe("Say something to Ducter…");
    expect(longestThatFits(["Say something to Ducter…", "Message Ducter…", "Message…"], w, 160)).toBe("Message Ducter…");
    expect(longestThatFits(["Say something to Ducter…", "Message Ducter…", "Message…"], w, 20)).toBe("Message…");
    expect(longestThatFits(["one"], w, 0)).toBe("one");
  });

  test("every long placeholder has a shorter form, in zh and en", () => {
    for (const lang of ["zh", "en"] as const) {
      const L = strings(lang);
      const pairs = [
        [L.t("composer.placeholder", "Ducter"), L.t("composer.placeholder.short", "Ducter"), L.t("composer.placeholder.bare")],
        [L.t("composer.steer.place"), L.t("composer.steer.place.short")],
        [L.t("composer.nosteer.place", "Codex"), L.t("composer.nosteer.place.short")],
      ];
      for (const p of pairs) for (let i = 1; i < p.length; i++) expect(p[i]!.length).toBeLessThan(p[i - 1]!.length);
    }
  });

  test("the conversation and the task hand the composer the list", () => {
    const v = src("views.tsx");
    expect(v).toContain('t("composer.placeholder.short", name)');
    expect(v).toContain('t("composer.steer.place.short")');
  });
});

describe("D547: one row of buttons", () => {
  test("attach, the mic, Stop and Send are one size, round, on one bottom line", () => {
    expect(tail).toMatch(/\.composer \.add-pic,\s*\.composer \.mic,\s*\.composer \.stop,\s*\.composer \.send \{[^}]*width: var\(--cb\);[^}]*height: var\(--cb\);[^}]*border-radius: 50%;[^}]*align-self: flex-end;/);
    // The meter and the chip stand on the same line (they were centred, and jumped as the words grew).
    expect(tail).toMatch(/\.composer \.ctune,\s*\.composer \.ctx-anchor \{[^}]*align-self: flex-end;[^}]*height: var\(--cb\);/);
    // The mic is quiet; only Send (and Stop while a task works) is raised.
    expect(src("voice.tsx")).toContain("btn text icon mic");
  });

  test("an empty Send is sunken, never a faded accent", () => {
    expect(tail).toMatch(/\.composer \.send\.is-empty:disabled \{[^}]*opacity: 1;[^}]*--fill: var\(--sunken\);/);
    expect(src("composer.tsx")).toContain('state === "empty" ? " is-empty"');
  });

  test("the words grow to five lines, then scroll inside", () => {
    expect(WORDS_LINES).toBe(5);
    expect(tail).toMatch(/\.composer textarea \{[^}]*max-height: none;[^}]*caret-color: var\(--accent\);/);
  });

  test("an opened task's card is tiered: the words their own line", () => {
    expect(src("views.tsx")).toContain("tiered={!!taskId}");
    expect(tail).toMatch(/\.composer\.tiered \.words \{[^}]*flex: 1 0 100%;[^}]*order: -1;/);
  });

  test("the pictures sit inside the card, above the words; their remove is a 44 target", () => {
    expect(src("views.tsx")).toContain("top={<Tray where={where} />}");
    expect(tail).toMatch(/\.chosen \.x::after \{\s*inset: -12px;/);
  });

  test("iOS's keyboard over the page: no safe-area gap, the page ends at the keyboard", () => {
    expect(tail).toMatch(/html\.kb \{\s*--safe-bottom: 0px;/);
    expect(tail).toMatch(/html\.kb #app \{\s*height: var\(--vvh, 100%\);/);
    expect(src("keyboard.ts")).toContain('root.classList.toggle("kb", kb > 0)');
  });
});

describe("D547: Overview on a phone", () => {
  test("one column of the list's own rows, the fixes full buttons", () => {
    const s = src("settings-home.tsx");
    expect(s).toContain("function PhoneBrief");
    expect(s).toContain("function PhonePlaces");
    expect(s).toMatch(/class="set-row sb-row"/);
    expect(s).toMatch(/class=\{`set-row map-line/);
    expect(s).toContain('{...(phone ? {} : { size: "sm" as const })}');
  });
});
