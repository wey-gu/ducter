// research/110: what the iOS Simulator walk found in the stylesheet, kept from coming back.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

/** Every declaration block whose selector list is exactly `selector` (whitespace-normalised). */
function blocks(selector: string): string[] {
  const want = selector.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    if (sel === want) out.push(m[2]!);
  }
  return out;
}

describe("sentences fill the measure (D78)", () => {
  // Balance cuts a long CJK sentence into short ragged lines and splits words ("信 / 号");
  // it is for short headings only.
  for (const sel of [".partner > .bubble", ".decision .q, .ask .q, .task-head .headline", ".hello p", ".mem-hero p"]) {
    test(`${sel} is pretty, never balanced`, () => {
      const b = blocks(sel);
      expect(b.length).toBeGreaterThan(0);
      for (const body of b) expect(body).not.toMatch(/text-wrap:\s*balance/);
      expect(b.some((body) => /text-wrap:\s*pretty/.test(body))).toBe(true);
    });
  }
});

describe("marks a finger can hit (44 pt)", () => {
  test("the sheets' close mark reaches 44 around its 34", () => {
    expect(blocks(".past-x::after").join("")).toMatch(/inset:\s*-5px/);
    expect(blocks(".past-x").join("")).toMatch(/position:\s*relative/);
  });
  test("the places reach 44 tall around their 28", () => {
    expect(blocks(".places .place::after").join("")).toMatch(/inset:\s*-8px 0/);
  });
});

test("a tile of agent coins keeps each coin's size", () => {
  // `.g-tile img` sizes a single tile image to 40; two 24-pt coins must not grow to 40 each.
  expect(blocks(".g-tile .coin-art img").join("")).toMatch(/width:\s*100%/);
});

// D311: research/110's open list. Each small target keeps its look; an invisible box takes the tap.
/** Every declaration block whose selector list includes `selector` as one of its items. */
function listed(selector: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const items = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.replace(/\s+/g, " ").trim());
    if (items.includes(selector)) out.push(m[2]!);
  }
  return out;
}
/** The px of an `inset` shorthand as [top, right, bottom, left]. */
function inset(body: string): [number, number, number, number] {
  const m = /inset:\s*([^;]+);/.exec(body);
  if (!m) return [0, 0, 0, 0];
  const v = m[1]!.trim().split(/\s+/).map((x) => parseFloat(x));
  const [t, r = t, b = t, l = r] = v as [number, number?, number?, number?];
  return [t, r!, b!, l!];
}

describe("D311: the phone's small targets reach 44 tall", () => {
  // The visible heights are research/110's 402-pt audit (and this change's own headless audit).
  const targets: [string, number][] = [
    [".recall-line", 24],
    [".inline-link", 19],
    [".turns .worked", 28],
    [".strip .cell", 28],
    [".lens-tabs .lens-row", 36],
    [".decision .asker", 24],
    [".fold-line", 32],
    [".past-link", 39],
    [".btn.sm", 36],
    [".pchip", 36],
    [".set-back", 36],
    [".ach", 40],
    [".info-btn", 40],
    [".bench-toggle", 40],
  ];
  const positioned = css.match(/:where\(([^)]*)\)\s*\{\s*position:\s*relative;/)?.[1] ?? "";
  for (const [sel, h] of targets) {
    test(`${sel} (${h}) has a box at least 44 tall`, () => {
      const [t, , b] = inset(listed(`${sel}::before`).find((x) => /inset:/.test(x)) ?? "");
      expect(h - t - b).toBeGreaterThanOrEqual(44);
      expect(positioned.split(",").map((s) => s.trim())).toContain(sel);
    });
  }
  test("the bar's counts (19) reach 44 on a touch screen (bottom -25), and are not clipped", () => {
    const [t, , b] = inset(blocks(".top .who button.sum::before")[0]!);
    expect(t).toBe(0);
    expect(b).toBe(-13);
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.top \.who button\.sum::before \{ bottom: -25px; \}/);
    expect(blocks(".top .who button.sum").join("")).toMatch(/overflow:\s*visible/);
  });
  test("the bar's name reaches the bar's top (the face beside it opens the same page)", () => {
    expect(inset(blocks(".top .who .name::before")[0]!)[0]).toBeLessThanOrEqual(-12);
  });
  test("the chips' track is 44: the chips are 36 inside its 4", () => {
    expect(blocks(".pchip").join("")).toMatch(/height:\s*36px/);
    expect(blocks(".pchips").join("")).toMatch(/padding:\s*4px/);
  });
});

describe("D311: the rest of research/110's list", () => {
  test("no :has() inside a :has() (the browser drops the whole rule)", () => {
    for (const m of css.matchAll(/([^{}]+)\{/g)) expect(m[1]).not.toMatch(/:has\([^)]*:has\(/);
  });
  test("Done for you: a last row of buttons only has no band of its own", () => {
    expect(blocks(".pcard.did:has(> .did-acts):not(:has(.did-until)) .did-main").join("")).toMatch(/padding-bottom:\s*0/);
    expect(blocks(".pcard.did:has(> .did-acts):not(:has(.did-until))").join("")).toMatch(/row-gap:\s*0/);
  });
  test("routine titles wrap to two lines before they are cut", () => {
    const b = blocks(".row.routine .t").join("");
    expect(b).toMatch(/-webkit-line-clamp:\s*2/);
    expect(b).toMatch(/white-space:\s*normal/);
  });
  const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
  test("the notification offer steps aside while voice's own card is up", () => {
    const body = src("views.tsx").split("function NotifyAsk()")[1]!.split("\n}\n")[0]!;
    expect(body).toMatch(/voice\(\)\.phase/);
    for (const p of ["ask", "denied", "off"]) expect(body).toContain(`vp === "${p}"`);
  });
  test("a device's card shows one way back: the page's ‹ 设置 and title step aside", () => {
    const v = src("views.tsx");
    expect(v).toMatch(/const devPushed = page === "devices" && deviceCardShown\(dev\)/);
    expect(v).toMatch(/\{!devPushed && \(\s*<>\s*<button class="set-back"/);
    expect(src("devcard.tsx")).toMatch(/<BackRow label=\{t\("devices.title"\)\}/);
  });
});

describe("research/123: the 0.0.69 Settings panes on the iPhone", () => {
  test("the Partner page's invitation keeps its link's words (it shrank to 看. / Sh…)", () => {
    expect(blocks(".set-invite > .btn").join("")).toMatch(/flex:\s*none/);
  });
  test("试试看's copy button (32) and a Noted line's 撤销 (20) reach 44", () => {
    expect(blocks(".ex-copy::before").join("")).toMatch(/inset:\s*-6px/);
    expect(blocks(".noted-line .qlink::before").join("")).toMatch(/inset:\s*-12px -8px/);
    expect(blocks(".ex-copy, .noted-line .qlink").join("")).toMatch(/position:\s*relative/);
  });
  test("an own-number step's body is not indented twice inside its block", () => {
    // As specific as `.set-page.pushed .own-body` (52 px), which otherwise wins.
    expect(blocks(".g-block > .own-body, .set-page.pushed .g-block > .own-body").join("")).toMatch(/padding:\s*0/);
  });
  test("a sheet is a rounded frame that clips, around a body that scrolls (iOS drew past the top edge)", () => {
    const frame = blocks(".sheet-frame").join("");
    expect(frame).toMatch(/overflow:\s*hidden/);
    expect(frame).toMatch(/position:\s*fixed/);
    const body = blocks(".sheet").join("");
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).not.toMatch(/position:\s*fixed/);
    // Every sheet's markup comes from the one component.
    const dir = join(import.meta.dir, "../src");
    for (const f of readdirSync(dir).filter((x: string) => /\.tsx$/.test(x) && x !== "sheet-frame.tsx"))
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/class=["{`]+sheet[ "`]/);
  });
  test("怎么装 inside a setup step is the quiet 44-tall disclosure", () => {
    expect(blocks(".chat-step .mem-more summary").join("")).toMatch(/min-height:\s*44px/);
  });
  // research/165: at 390 再试一次 sat 16px above step 2's mark, its clay edge eating half of it.
  test("a step that ends on its button keeps clear of the next step", () => {
    expect(blocks(".chat-step .grow > .btn:last-child").join("")).toMatch(/margin-bottom:\s*var\(--s3\)/);
  });
});
