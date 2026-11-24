// D513: 伙伴们 / Your partners as a messaging app's list, and the colour picker's row that broke on a
// phone (0.1.33: Settings › 伙伴's rows put the figure, the words and up to three buttons on one
// line; the words were squeezed to 53 points at 390 and to 0 at 320, one character a line, and the
// five colours stood one per line). Measured in Chrome at 390 and 320 (zh, en) before and after;
// these keep the shape that fixed it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { partnersWords } from "../src/i18n-partners.ts";

const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

/** Every declaration block whose selector list is exactly `selector` (whitespace-normalised). */
function blocks(selector: string): string {
  const want = selector.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    if (sel.split(",").map((s) => s.trim()).includes(want)) out.push(m[2]!);
  }
  return out.join("\n");
}

/** The source of one function in partners.tsx, up to the next top-level function. */
function fn(name: string): string {
  const s = src("partners.tsx");
  const at = s.indexOf(`function ${name}(`);
  expect(at).toBeGreaterThan(-1);
  const next = s.indexOf("\nfunction ", at + 1);
  const nextExport = s.indexOf("\nexport function ", at + 1);
  const end = Math.min(...[next, nextExport, s.length].filter((n) => n > 0));
  return s.slice(at, end);
}

describe("a partner's row in Settings never squeezes its words (the picker on a phone)", () => {
  test("the row stacks: who, its colours, its actions", () => {
    expect(blocks(".partners-set .partner-row")).toMatch(/flex-direction:\s*column/);
    expect(blocks(".partners-set .partner-acts")).toMatch(/flex-wrap:\s*wrap/);
    // The words take what the figure leaves; they never share their line with a button.
    expect(blocks(".partners-set .partner-words")).toMatch(/flex:\s*1 1 auto/);
    expect(blocks(".partners-set .partner-words")).toMatch(/min-width:\s*0/);
  });
  test("no button and no colour picker sits on the line with the name", () => {
    const row = fn("PartnerRow");
    const tops = row.split('<span class="partner-top">').slice(1);
    expect(tops.length).toBe(2); // the row, and the row asking to remove
    for (const part of tops) {
      // Up to the colours or the actions, whichever comes first: the figure and the words only.
      const ends = ["<LookPick", '<span class="partner-acts">'].map((m) => part.indexOf(m)).filter((n) => n > -1);
      const top = part.slice(0, Math.min(...ends));
      expect(top).not.toContain("<Btn");
      expect(top).toContain("partner-words");
    }
    expect(row).toContain('<span class="partner-acts">');
    // Each row's buttons (keep and remove, or switch, change and remove) are all in its actions.
    const acts = row.split('<span class="partner-acts">').slice(1).join("");
    expect((acts.match(/<Btn /g) ?? []).length).toBe((row.match(/<Btn /g) ?? []).length);
  });
  test("the colours sit under the name, one row of five chips on 320", () => {
    // 52 (the figure and its gap) + 5 x 34 + 4 x 8 = 254, inside 320 less the card's 2 x 16 and the row's 2 x 16.
    expect(blocks(".partners-set .partner-row > .look-pick")).toMatch(/margin-inline-start:\s*52px/);
    expect(blocks(".look-chip")).toMatch(/width:\s*34px/);
    expect(blocks(".look-pick")).toMatch(/gap:\s*8px/);
    expect(52 + 5 * 34 + 4 * 8).toBeLessThanOrEqual(320 - 4 * 16);
  });
});

describe("D513: the list of partners", () => {
  test("the pills in the bar are gone, and with them their stylesheet", () => {
    expect(src("views.tsx")).not.toContain("PartnerSwitch");
    expect(src("partners.tsx")).not.toContain("PartnerSwitch");
    expect(css).not.toContain(".partner-pick");
    expect(css).not.toContain(".partner-switch");
  });
  test("wide, a column at the conversation's left; a phone, the level above the conversation", () => {
    const main = src("main.tsx");
    expect(main).toContain('<PartnerList at="side" thin={A.railMode === "thin"} />');
    expect(main).toMatch(/A\.partnersOpen && A\.manyPartners\(\) \? <PartnerList at="home"/);
    // The phone's edge swipe from a conversation goes up to the list.
    expect(main).toContain('if (A.route.name === "conv") return A.railMode === "hidden" && !phoneNow() ? A.setRail("") : A.showPartners();');
    expect(src("views.tsx")).toContain('{((!wide && phoneBar) || fold || (A.railMode === "hidden" && A.manyPartners())) && <PartnersBack />}');
    expect(src("app.ts")).toContain('hash === "#partners"');
  });
  test("D545: the list beside the conversation narrows, hides and comes back, by the bar's toggle; remembered here", async () => {
    const { A } = await import("../src/app.ts");
    const was = A.railMode;
    A.railMode = "";
    expect(A.nextRail()).toBe("thin");
    A.setRail("thin");
    expect(A.railMode).toBe("thin");
    expect(A.nextRail()).toBe("hidden");
    A.setRail("hidden");
    expect(A.nextRail()).toBe("");
    A.setRail(was);
    const main = src("main.tsx");
    expect(main).toContain('{!split && A.railMode !== "hidden" && <PartnerList at="side" thin={A.railMode === "thin"} />}');
    expect(main).toContain('A.manyPartners() && !phone && A.railMode !== "hidden" ? (');
    // Hidden: the others' faces are the way back (and carry what waits in them), on any width.
    expect(src("views.tsx")).toContain('{((!wide && phoneBar) || fold || (A.railMode === "hidden" && A.manyPartners())) && <PartnersBack />}');
    expect(src("views.tsx")).toContain("{!phoneBar && !fold && <RailToggle />}");
    expect(fn("RailToggle")).toContain("<IconBtn label={label} onClick={() => A.setRail(next)}>");
    expect(css).toContain(".pane.partners.thin { flex-basis: 56px; }");
    expect(css).toContain(".pane.partners.rail-in > * { animation: rail-in var(--t-across) var(--ease-push) both; }");
    expect(css).toContain(".pane.partners.rail-in > * { animation: none; }");
  });
  test("D541: a way to the others at every width: the slim list from 700, the others' faces in a phone's and a fold's bar", () => {
    const main = src("main.tsx");
    // 700–999 (an iPad upright, a foldable open): the slim list beside the one column.
    expect(main).toContain('<PartnerList at="side" slim thin={A.railMode === "thin"} />');
    expect(main).toContain('A.manyPartners() && !phone && A.railMode !== "hidden" ? (');
    expect(css).toContain(".pane.partners.slim { flex-basis: 88px; }");
    expect(css).toContain("#app:has(> .panes.mid)");
    // A fold: the list opens over the conversation's pane, from the bar.
    expect(main).toContain('split && A.partnersOpen && A.manyPartners() ? <PartnerList at="home" />');
    // The bar's way up is never a bare ‹: the others' own figures, with what waits in them.
    const back = fn("PartnersBack");
    expect(back).toContain('<Chev back cls="pb-chev" />');
    expect(back).toContain('class="pb-face stone" data-look={p.look}');
    expect(back).toContain("<CountPebble n={elsewhere} />");
    expect(back).not.toContain("<svg");
  });
  test("with one partner nothing shows: no list, no ‹", () => {
    expect(fn("PartnerList")).toMatch(/if \(!A\.manyPartners\(\)\) return null;/);
    expect(fn("PartnersBack")).toMatch(/if \(!A\.manyPartners\(\)\) return null;/);
  });
  test("each row carries its own number, and the numbers add up to the person's one count", () => {
    expect(fn("PartnerRowItem")).toContain("A.partnerNeeds(p)");
    expect(fn("PartnersBack")).toContain("A.partnerNeeds(p)");
  });
  test("D517: a narrower window keeps each figure with its name under it; a phone's rows are a thumb tall", () => {
    const slim = css.slice(css.indexOf("@media (min-width: 1000px) and (max-width: 1359px) {\n  .pane.partners { flex-basis: 88px; }"));
    expect(slim.length).toBeGreaterThan(0);
    const block = slim.slice(0, slim.indexOf("\n}"));
    expect(block).toContain(".pane.partners .pl-row { flex-direction: column;");
    expect(block).toContain(".pane.partners .pl-last { display: none; }");
    expect(block).not.toContain(".pl-words { display: none");
    expect(blocks(".partners-home .pl-rows")).toMatch(/--row:\s*76px/);
    expect(blocks(".top .partners-back")).toMatch(/min-height:\s*44px/);
  });
  test("D517: no tooltip on a row (it covered the Mac's window controls); the name is the label", () => {
    expect(fn("PartnerRowItem")).not.toContain("title=");
    expect(fn("PartnersBack")).not.toContain("title=");
  });
  test("D517, D541: the list stays still on a switch: the chosen pebble glides, the conversation shows in place", () => {
    expect(blocks(".pl-knob")).toMatch(/transform:\s*translateY\(calc\(var\(--at, 0\)/);
    expect(blocks(".pl-knob")).toMatch(/transition:\s*transform 420ms var\(--spring-soft\)/);
    // D541: the pane is never keyed by whose it is (the bar and the composer stay); no entrance.
    expect(src("main.tsx")).toContain('<section class="pane conv" aria-label={t("nav.conversation")}>');
    expect(css).not.toContain("conv-in");
    // Each row's number holds while the switch waits for its welcome.
    expect(src("app.ts")).toContain("if (partner && this.railHeld && !this.S.welcomed) return this.railHeld[partner] ?? 0;");
  });
  test("D517: at 320 the phone's bar with ‹ drops the face so the places never cover the name", () => {
    const m = css.slice(css.indexOf("@media (max-width: 360px) {\n  .top:has(.partners-back) .who-face { display: none; }"));
    expect(m.length).toBeGreaterThan(0);
    expect(m).toContain(".top:has(.partners-back) .who-words { min-width: 0; }");
  });
  test("D517: every motion of the list is still under Reduce Motion", () => {
    const m = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .pl-knob, .pl-hop { transition: none; }"));
    expect(m).toContain(".pl-hop.on, .pl-breathe, .pl-breathe .shut { animation: none; }");
  });
  test("tokens only, and every word in both languages without a dot join", () => {
    const tail = css.slice(css.indexOf("D513: 伙伴们 / Your partners, as a messaging app"));
    expect(tail).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(tail).not.toMatch(/border-left:\s*[2-9]px/);
    for (const k of ["partners.here", "partners.you", "partners.empty", "partners.back", "partners.back.asks"])
      for (const l of ["zh", "en"] as const) {
        expect(partnersWords[l][k]).toBeTruthy();
        expect(partnersWords[l][k]).not.toContain(" · ");
      }
  });
});
