// D474: opening the page never stays blank. A first open that waits on a home that doesn't answer
// (verified: WebKit with /api/me held stayed an empty page forever), code that never runs, and a page
// that breaks drawing itself all show the partner waiting, or why it couldn't, with Try again.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TABLES, format } from "../src/i18n.ts";
import { BOOT_SLOW_MS, BOOT_TIMEOUT_MS, BootWait, Guard, bootWords, within } from "../src/boot-wait.tsx";

const web = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");
const tOf = (lang: "zh" | "en") => (k: string, ...a: unknown[]) => format(TABLES[lang][k] ?? k, a);

test("a request that never answers gives up after its budget; an answer or a failure comes through", async () => {
  const never = new Promise<{ status: number }>(() => {});
  const t0 = Date.now();
  expect(await within(never, 30, { status: 0 })).toEqual({ status: 0 });
  expect(Date.now() - t0).toBeLessThan(1000);
  expect(await within(Promise.resolve({ status: 200 }), 1000, { status: 0 })).toEqual({ status: 200 });
  expect(await within(Promise.reject(new Error("x")), 1000, { status: 0 })).toEqual({ status: 0 });
  expect(BOOT_TIMEOUT_MS).toBeGreaterThan(BOOT_SLOW_MS);
  expect(BOOT_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
});

test("the first open waits on /api/me within the budget, with the partner on the page, and says when it can't reach", () => {
  const main = read("src/main.tsx");
  const first = main.split("async function opening")[1]!;
  // Never a bare await on the home before anything is drawn.
  expect(first).not.toMatch(/await api\.call<Me>\("api\/me"\)/);
  const waitAt = first.indexOf('wait({ kind: "waiting" })');
  const askAt = first.indexOf('within(api.call<Me>("api/me"), BOOT_TIMEOUT_MS');
  expect(waitAt).toBeGreaterThan(0);
  expect(askAt).toBeGreaterThan(waitAt);
  expect(first).toContain('wait({ kind: "unreachable", host: base.host })');
  // Anything thrown while opening, and anything thrown drawing the app, lands on the failure ground.
  expect(main).toMatch(/async function boot\(pairing\?: PairView\) \{\s*try \{\s*await opening\(pairing\);/);
  expect(main).toMatch(/<Guard t=\{t\}>\s*<App \/>\s*<\/Guard>/);
});

test("the calm ground never comes back once the page showed something (the blank second tab and reload)", async () => {
  // Verified on the iOS Simulator and WebKit: a tab opened from a kept screen (fromGlance) whose
  // conversation is empty caught up (fromGlance cleared, welcomed, headSeq > 0, no channel entries)
  // inside the 1.5 s and settled back on the empty ground, with no frame left to draw it again.
  const { A, SETTLE_MS } = await import("../src/app.ts");
  const a = A as unknown as { settled: boolean; startedAt: number; fromGlance: boolean };
  const S = A.S;
  const was = { settled: a.settled, startedAt: a.startedAt, fromGlance: a.fromGlance, welcomed: S.welcomed, headSeq: S.headSeq, channel: S.channel };
  try {
    a.settled = false;
    a.startedAt = Date.now();
    S.channel = [];
    // A first open with nothing kept: the ground, for at most SETTLE_MS.
    a.fromGlance = false;
    S.welcomed = false;
    expect(A.settling()).toBe(true);
    // A kept screen paints at once ...
    a.fromGlance = true;
    expect(A.settling()).toBe(false);
    // ... and catching up with an empty conversation never takes it back to the ground.
    a.fromGlance = false;
    S.welcomed = true;
    S.headSeq = 42;
    expect(A.settling()).toBe(false);
    // Without anything shown yet, the same state is the ground, and only until SETTLE_MS.
    a.settled = false;
    expect(A.settling()).toBe(true);
    expect(A.settling(a.startedAt + SETTLE_MS)).toBe(false);
    expect(A.settling(a.startedAt + 1)).toBe(false);
  } finally {
    Object.assign(a, { settled: was.settled, startedAt: was.startedAt, fromGlance: was.fromGlance });
    Object.assign(S, { welcomed: was.welcomed, headSeq: was.headSeq, channel: was.channel });
  }
});

test("start() draws the page again when the ground's time is up, whether or not it is settling then", () => {
  const app = read("src/app.ts");
  const start = app.split("  start(base: URL")[1]!.split("this.conn = new Connection")[0]!;
  expect(start).toMatch(/const left = SETTLE_MS - \(Date\.now\(\) - this\.startedAt\);\s*if \(left > 0\) setTimeout\(\(\) => this\.changed\(\), left \+ 50\);/);
  expect(start).not.toMatch(/if \(this\.settling\(\)\) setTimeout/);
});

test("the words: waiting, slower than usual, can't reach the host, couldn't draw; Try again only on a failure", () => {
  for (const lang of ["zh", "en"] as const) {
    const t = tOf(lang);
    const w = bootWords(t, { kind: "waiting" });
    expect(w.title).toBe(TABLES[lang]["boot.waiting"]!);
    expect(w.body).toBeUndefined();
    expect(w.retry).toBeUndefined();
    expect(bootWords(t, { kind: "waiting" }, true).body).toBe(TABLES[lang]["boot.slow"]!);
    const u = bootWords(t, { kind: "unreachable", host: "10.1.1.234:7777" });
    expect(u.body).toContain("10.1.1.234:7777");
    expect(u.retry).toBe(TABLES[lang]["boot.retry"]!);
    expect(bootWords(t, { kind: "broken" }).body).toBe(TABLES[lang]["boot.broken"]!);
  }
});

test("a page that breaks drawing itself shows the failure ground, not nothing", () => {
  expect(Guard.getDerivedStateFromError()).toEqual({ broke: true });
  const t = tOf("en");
  const g = new Guard({ t, children: "the app" });
  expect(g.render()).toBe("the app");
  g.state = { broke: true };
  const v = g.render() as { type: unknown; props: { state: { kind: string } } };
  expect(v.type).toBe(BootWait);
  expect(v.props.state.kind).toBe("broken");
});

test("index.html carries its own ground for code that never runs: both languages, Try again, revealed late", () => {
  const html = read("static/index.html");
  const app = html.split('<div id="app">')[1]!.split("</main></div>")[0]!;
  expect(app).toContain('class="boot-wait static"');
  for (const lang of ["zh", "en"] as const) {
    expect(app).toContain(TABLES[lang]["boot.waiting"]!);
    expect(app).toContain(TABLES[lang]["boot.slow"]!);
    expect(app).toContain(`<span class="lbl">${TABLES[lang]["boot.retry"]!}</span>`);
  }
  expect(app).toContain('href="app"'); // Try again works without any script
  expect(app).not.toMatch(/<script/); // CSP: script-src 'self', nothing inline
  const css = read("static/app.css");
  expect(css).toMatch(/\.boot-wait:not\(\.failed\) > \* \{\s*animation: fade [^;]+ 700ms both;/);
  expect(css).toMatch(/\.boot-wait\.static > \* \{\s*animation-delay: 3s;/);
});
