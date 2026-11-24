// D463: the live-check kit, every check's logic against fakes. Nothing here touches a real home,
// a real Mem, a real provider or the person's ~/.ducter.
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { activityShapes, CHECKS, checkNamed, checkoutOf, contactShapes, expectedManager, firstAnswer, holdsOf, holdVerdict, limitShapes, loopsOf, offersWeek } from "../src/live-check/checks.ts";
import { realCheckEnv } from "../src/live-check/env.ts";
import { askHome, automatic, type CheckEnv, type CheckResult, latest, listText, type LoggedEvent, outcomeOf, readResults, reportText, resultText, runCheck, todoLine, writeResult } from "../src/live-check/kit.ts";
import { checkMain, parseOpts } from "../src/live-check/main.ts";
import { controlsIn, payControls } from "../src/live-check/pay-page.ts";

const T0 = Date.parse("2026-11-22T09:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-check-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Fake = CheckEnv & { said: string[]; asked: string[]; clock: { now: number } };

/** A computer with nothing on it and nobody at the terminal, unless told otherwise. */
function fakeEnv(o: Partial<CheckEnv> & { answers?: string[]; events?: LoggedEvent[] | ((kinds: string[], since: number) => LoggedEvent[] | undefined); frames?: (f: any) => ServerFrame | undefined } = {}): Fake {
  const clock = { now: T0 };
  const answers = o.answers ? [...o.answers] : undefined;
  const said: string[] = [];
  const asked: string[] = [];
  const { answers: _a, events, frames, ...rest } = o;
  return {
    now: () => clock.now,
    wait: async (ms) => void (clock.now += ms),
    platform: "darwin",
    arch: "arm64",
    version: "0.1.9",
    dataDir: "/Users/anna/.ducter",
    home: "/Users/anna",
    vars: {},
    which: () => undefined,
    run: async () => undefined,
    readText: () => undefined,
    exists: () => false,
    events: typeof events === "function" ? events : events ? (kinds, since) => events.filter((e) => kinds.includes(e.kind) && Date.parse(e.ts) >= since) : () => undefined,
    homeAsk: async (f, match) => {
      const r = frames?.(f);
      return r && match(r) ? r : undefined;
    },
    fetch: async () => {
      throw new Error("no network in tests");
    },
    ask: async (p) => (asked.push(p), answers ? answers.shift() : undefined),
    secret: async () => undefined,
    say: (l) => void said.push(l),
    ...rest,
    said,
    asked,
    clock,
  };
}

let seq = 0;
const ev = (kind: string, at: number, body: any, stream = "channel"): LoggedEvent => ({ seq: ++seq, ts: new Date(at).toISOString(), stream, kind, body });

// ---------- the kit ----------

describe("kit", () => {
  test("outcome: a fail wins, then not-yet, then a skipped required step", () => {
    const s = (outcome: any, optional?: boolean) => ({ id: "x", title: "x", by: "auto" as const, outcome, observed: {}, ...(optional ? { optional } : {}) });
    expect(outcomeOf([s("pass"), s("fail"), s("not-yet")])).toBe("fail");
    expect(outcomeOf([s("pass"), s("not-yet"), s("skip")])).toBe("not-yet");
    expect(outcomeOf([s("pass"), s("skip")])).toBe("incomplete");
    expect(outcomeOf([s("pass"), s("skip", true)])).toBe("pass");
  });

  test("a stop skips the rest; a thrown step is a fail that stops", async () => {
    const check = {
      ...CHECKS[0]!,
      steps: [
        { id: "a", title: "a", by: "auto" as const, run: async () => ({ outcome: "pass" as const }) },
        { id: "b", title: "b", by: "auto" as const, run: async () => Promise.reject(new Error("boom")) },
        { id: "c", title: "c", by: "auto" as const, run: async () => ({ outcome: "pass" as const }) },
      ],
    };
    const r = await runCheck(check, fakeEnv());
    expect(r.steps.map((s) => s.outcome)).toEqual(["pass", "fail", "skip"]);
    expect(r.steps[1]!.note).toContain("boom");
    expect(r.steps[2]!.note).toContain("b came first");
    expect(r.outcome).toBe("fail");
  });

  test("a result file never carries a secret or the home folder", () => {
    const r: CheckResult = {
      check: "x",
      decisions: ["D463"],
      title: "x",
      todo: "x",
      date: "2026-11-22",
      startedAt: "",
      finishedAt: "",
      host: { platform: "darwin", arch: "arm64", ducter: "0.1.9" },
      outcome: "fail",
      steps: [{ id: "a", title: "a", by: "person", outcome: "fail", observed: { answer: "no" }, note: "saw sk-or-v1-0123456789abcdef0123456789abcdef in /Users/anna/x and anna@example.com" }],
    };
    const text = resultText(r, "/Users/anna");
    expect(text).not.toContain("sk-or-v1-0123456789abcdef");
    expect(text).not.toContain("/Users/anna");
    expect(text).not.toContain("anna@example.com");
    expect(JSON.parse(text).steps[0].observed.answer).toBe("no");
  });

  test("files are dated, a second run that day gets -2, and the newest wins", () => {
    const dir = tmp();
    const r = (outcome: any): CheckResult => ({ check: "loops", decisions: [], title: "", todo: "D427", date: "2026-11-22", startedAt: "", finishedAt: "", host: { platform: "linux", arch: "x64", ducter: "0.1.9" }, outcome, steps: [] });
    expect(writeResult(dir, r("fail"), "/home/x")).toEndWith("2026-11-22-loops.json");
    expect(writeResult(dir, r("pass"), "/home/x")).toEndWith("2026-11-22-loops-2.json");
    writeFileSync(join(dir, "2026-11-20-loops.json"), JSON.stringify({ ...r("not-yet"), date: "2026-11-20" }));
    writeFileSync(join(dir, "notes.txt"), "not a result");
    expect(readResults(dir).map((f) => f.file)).toEqual(["2026-11-22-loops-2.json", "2026-11-22-loops.json", "2026-11-20-loops.json"]);
    const l = latest(dir).get("loops")!;
    expect(l.result.outcome).toBe("pass");
    expect(todoLine(l)).toBe("Seen live: `2026-11-22-loops-2.json` (pass, linux, Ducter 0.1.9)");
  });

  test("list says what each needs and how long; report gives the todo line", () => {
    const text = listText(CHECKS, new Map());
    for (const c of CHECKS) {
      expect(text).toContain(c.name);
      expect(text).toContain(c.needs[0]!);
    }
    expect(text).toContain("automatic");
    expect(text).toContain("needs you");
    const dir = tmp();
    writeResult(dir, { check: "poppler", decisions: ["D439"], title: "", todo: CHECKS.find((c) => c.name === "poppler")!.todo, date: "2026-11-22", startedAt: "", finishedAt: "", host: { platform: "linux", arch: "x64", ducter: "0.1.9" }, outcome: "pass", steps: [] }, "/home/x");
    const rep = reportText(CHECKS, latest(dir), dir);
    expect(rep).toContain("1 passed");
    expect(rep).toContain(`${CHECKS.length - 1} never run`);
    expect(rep).toContain("Seen live: `2026-11-22-poppler.json`");
  });

  test("askHome refuses any frame that changes something", async () => {
    const c = { env: fakeEnv(), opts: {}, startedAt: T0, memo: {} };
    await expect(askHome(c, { t: "say", text: "hi" } as any, "devices")).rejects.toThrow("not a read-only frame");
  });

  test("options: repeated, inline, bare flags", () => {
    expect(parseOpts(["run", "pay-words", "--page", "a.html", "--page=b.html", "--json", "--dry"])).toEqual({ opts: { page: ["a.html", "b.html"], dry: ["true"] }, json: true, rest: ["run", "pay-words"] });
  });
});

describe("the catalogue", () => {
  const todo = readFileSync(join(import.meta.dir, "../../../design/todo.md"), "utf8");
  test("every check is named once, cites its Dn, says what it needs and closes a real todo heading", () => {
    expect(new Set(CHECKS.map((c) => c.name)).size).toBe(CHECKS.length);
    for (const c of CHECKS) {
      expect(c.name).toMatch(/^[a-z0-9-]+$/);
      expect(c.decisions.length).toBeGreaterThan(0);
      for (const d of c.decisions) expect(d).toMatch(/^D\d+$/);
      expect(c.needs.length).toBeGreaterThan(0);
      expect(c.minutes).toBeGreaterThan(0);
      expect(todo).toContain(`## ${c.todo}`);
    }
  });

  test("the checks that need nobody read the Log, Mem, the home and the tools", () => {
    expect(CHECKS.filter(automatic).map((c) => c.name).sort()).toEqual(["add-folder", "limit-hit", "loops", "mem-shapes", "offers-week", "pkg-line", "poppler"]);
  });

  test("only free-key-429 spends anything outside, and it says so", () => {
    expect(CHECKS.filter((c) => c.outward).map((c) => c.name)).toEqual(["free-key-429"]);
  });

  test("on a computer with nothing and nobody, no check passes", async () => {
    for (const c of CHECKS) {
      const r = await runCheck(c, fakeEnv());
      expect(r.outcome === "pass" ? c.name : "").toBe("");
    }
  });
});

// ---------- each check's logic ----------

describe("offers-week (D453, D458)", () => {
  const week = (perDay: number, days: number, takeEvery: number) => {
    const out: LoggedEvent[] = [];
    let n = 0;
    for (let d = days - 1; d >= 0; d--)
      for (let i = 0; i < perDay; i++) {
        const id = `o${n++}`;
        const at = T0 - d * DAY - 2 * 3_600_000 + i * MIN;
        out.push(ev("decision", at, { decisionId: id, offer: true, question: "?" }));
        if (n % takeEvery === 0) out.push(ev("decision_resolved", at + MIN, { decisionId: id, option: "go", by: "user" }));
      }
    out.push(ev("find_state", T0 - DAY, { findId: "f1", kind: "remembered", state: "new" }), ev("find_state", T0 - DAY, { findId: "f1", kind: "remembered", state: "go" }), ev("find_state", T0 - DAY, { findId: "f2", kind: "loose_end", state: "new" }));
    return out;
  };

  test("counts mornings, offers a morning and what was taken up", () => {
    const w = offersWeek(week(2, 7, 7), T0);
    expect(w.offers).toBe(14);
    expect(w.mornings).toBe(7);
    expect(w.perMorning).toBe(2);
    expect(w.taken).toBe(2);
    expect(w.wider).toEqual({ next_step: 0, remembered: 1, loose_end: 1 });
  });

  test("a week at one or two a morning, taken up 1 in 20 or better, passes", async () => {
    expect((await runCheck(checkNamed("offers-week")!, fakeEnv({ events: week(2, 7, 7) }))).outcome).toBe("pass");
  });
  test("three days is not yet a week", async () => {
    expect((await runCheck(checkNamed("offers-week")!, fakeEnv({ events: week(2, 3, 2) }))).outcome).toBe("not-yet");
  });
  test("five a morning is too many; none taken up misses the bar", async () => {
    expect((await runCheck(checkNamed("offers-week")!, fakeEnv({ events: week(5, 7, 2) }))).outcome).toBe("fail");
    expect((await runCheck(checkNamed("offers-week")!, fakeEnv({ events: week(2, 7, 1000) }))).outcome).toBe("fail");
  });
  test("no Log here says where to run it", async () => {
    const r = await runCheck(checkNamed("offers-week")!, fakeEnv());
    expect(r.outcome).toBe("fail");
    expect(r.steps[0]!.note).toContain("run it on the home");
  });
});

describe("limit-hit (D435, D297)", () => {
  const held = (at: number, until: number, resetKnown = true) => ev("partner_session", at, { event: "brain_held", harness: "claude-code", held: { why: "quota", until: new Date(until).toISOString(), resetKnown, since: new Date(at).toISOString() } }, "partner");
  const back = (at: number) => ev("partner_session", at, { event: "brain_back", harness: "claude-code" }, "partner");

  test("each hold judged against its reset", () => {
    const r = T0 - 5 * 3_600_000;
    const hs = holdsOf([held(r - 3_600_000, r), held(r - 3_600_000, r), back(r + 2 * MIN)]);
    expect(hs).toHaveLength(1);
    expect(holdVerdict(hs[0]!, T0)).toBe("ok");
    expect(holdVerdict({ ...hs[0]!, back: r - 10 * MIN }, T0)).toBe("early");
    expect(holdVerdict({ ...hs[0]!, back: r + 45 * MIN }, T0)).toBe("late");
    expect(holdVerdict({ ...hs[0]!, back: undefined }, T0)).toBe("stuck");
    expect(holdVerdict({ ...hs[0]!, back: undefined, until: T0 + MIN }, T0)).toBe("waiting");
  });

  test("a hold back at its reset passes; one back early fails; none is not yet", async () => {
    const r = T0 - DAY;
    expect((await runCheck(checkNamed("limit-hit")!, fakeEnv({ events: [held(r - 3_600_000, r), back(r + MIN)] }))).outcome).toBe("pass");
    expect((await runCheck(checkNamed("limit-hit")!, fakeEnv({ events: [held(r - 3_600_000, r), back(r - 30 * MIN)] }))).outcome).toBe("fail");
    expect((await runCheck(checkNamed("limit-hit")!, fakeEnv({ events: [] }))).outcome).toBe("not-yet");
  });

  test("a task still resting an hour past its reset fails", async () => {
    const r = T0 - 3 * 3_600_000;
    const events = [held(r - 3_600_000, r), back(r + MIN), ev("waiter", r - 3_600_000, { waiterId: "w1", taskId: "t1", limit: { harness: "codex", resetKnown: true }, at: new Date(r).toISOString(), reason: "limit", state: "armed" })];
    const res = await runCheck(checkNamed("limit-hit")!, fakeEnv({ events }));
    expect(res.steps[1]!.outcome).toBe("fail");
  });
});

describe("loops (D427, D429)", () => {
  const loop = (taskId: string, at: number, extra: any = {}) => ev("task_loop", at, { taskId, state: "on", reason: "every hour", since: "", by: "brief", ...extra });
  const wait = (taskId: string, at: number, state: string) => ev("waiter", at, { waiterId: `w-${taskId}-${at}`, taskId, reason: "next round", state });

  test("an on-loop with its next wait armed passes, and backs are counted", async () => {
    const events = [loop("t1", T0 - DAY), wait("t1", T0 - DAY, "armed"), wait("t1", T0 - 2 * 3_600_000, "fired"), loop("t1", T0 - 2 * 3_600_000, { back: { at: "x", from: "done" } }), wait("t1", T0 - 3_600_000, "armed")];
    const l = loopsOf(events);
    expect(l).toMatchObject({ loops: 1, on: 1, unarmed: 0, backs: { done: 1 } });
    expect((await runCheck(checkNamed("loops")!, fakeEnv({ events }))).outcome).toBe("pass");
  });

  test("an on-loop whose wait fired and nothing re-armed fails; an end by no one fails", async () => {
    expect((await runCheck(checkNamed("loops")!, fakeEnv({ events: [loop("t1", T0 - DAY), wait("t1", T0 - DAY, "fired")] }))).outcome).toBe("fail");
    expect(loopsOf([loop("t2", T0, { state: "ended" })]).endedByNoOne).toBe(1);
    expect(loopsOf([loop("t2", T0, { state: "ended", endedBy: "user" })]).endedByNoOne).toBe(0);
  });

  test("a replaced waiter: the new one armed, then the old one cancelled with replacedBy, still reads armed", async () => {
    // As hel logged it: the successor armed at seq N, the predecessor's cancel 4 ms later.
    const events = [
      loop("t3", T0 - DAY),
      ev("waiter", T0 - DAY, { waiterId: "w-old", taskId: "t3", reason: "next round", state: "armed" }),
      ev("waiter", T0 - 3_600_000, { waiterId: "w-new", taskId: "t3", reason: "next round", state: "armed" }),
      ev("waiter", T0 - 3_600_000 + 4, { waiterId: "w-old", taskId: "t3", reason: "next round", state: "cancelled", replacedBy: "w-new" }),
    ];
    expect(loopsOf(events)).toMatchObject({ on: 1, unarmed: 0 });
    expect((await runCheck(checkNamed("loops")!, fakeEnv({ events }))).outcome).toBe("pass");
    // A cancel with no successor armed still leaves the loop unarmed.
    expect(loopsOf([...events, ev("waiter", T0 - MIN, { waiterId: "w-new", taskId: "t3", reason: "next round", state: "cancelled" })]).unarmed).toBe(1);
  });

  test("no loop this week is not yet", async () => {
    expect((await runCheck(checkNamed("loops")!, fakeEnv({ events: [] }))).outcome).toBe("not-yet");
  });
});

describe("first-answer (D440)", () => {
  test("the home's greeting is not the answer", () => {
    const e = [ev("ai_msg", T0, { text: "hi", first: {} }), ev("user_msg", T0 + 1000, { text: "q" }), ev("ai_msg", T0 + 13_400, { text: "a" })];
    expect(firstAnswer(e, T0)).toEqual({ asked: true, seconds: 12.4 });
    expect(firstAnswer(e.slice(0, 2), T0)).toEqual({ asked: true });
    expect(firstAnswer([], T0)).toEqual({ asked: false });
  });

  test("a bare account: key pasted, pi in the tools folder, answered", async () => {
    const env = fakeEnv({
      answers: ["", "", "y"],
      exists: (p) => p === "/Users/anna/.ducter/tools/node/bin/pi",
      frames: (f) => (f.t === "devices" ? ({ t: "devices", devices: [{ id: "local", name: "Mac", kind: "laptop", home: true, state: "awake", harnesses: [], abilities: [] }], reach: {} } as any) : undefined),
      events: (kinds, since) => {
        const asked = env.clock.now > T0 + 10_000;
        const all = asked ? [ev("ai_msg", T0 - 1000, { text: "hi", first: {} }), ev("user_msg", T0 + 1000, { text: "q" }), ev("ai_msg", T0 + 9000, { text: "a" })] : [];
        return all.filter((e) => kinds.includes(e.kind) && Date.parse(e.ts) >= since);
      },
    });
    const r = await runCheck(checkNamed("first-answer")!, env);
    expect(r.steps.map((s) => [s.id, s.outcome])).toEqual([["bare", "pass"], ["home", "pass"], ["key", "pass"], ["pi", "pass"], ["ask", "pass"], ["answer", "pass"], ["right", "pass"]]);
    expect(r.steps.find((s) => s.id === "pi")!.observed.where).toBe("tools/node/bin");
  });

  test("Node on the PATH is not a bare account", async () => {
    const r = await runCheck(checkNamed("first-answer")!, fakeEnv({ which: (c) => (c === "node" ? "/usr/local/bin/node" : undefined) }));
    expect(r.steps[0]).toMatchObject({ outcome: "fail", observed: { found: ["node"] } });
  });
});

describe("errand-checkout (D436)", () => {
  const card = (at: number) => ev("decision", at, { decisionId: "d1", taskId: "t1", question: "", goLabel: "付好了", defaultOption: "hold", reversible: false, checkout: { site: "Shop", url: "https://shop.example/checkout/pay", what: "3 things", total: "73.00", currency: "CNY", items: ["a", "b", "c"], media: [{ id: "m" }] } });
  const frames = (f: any) =>
    f.t === "devices" ? ({ t: "devices", devices: [{ id: "local", name: "hel", kind: "server", home: true, state: "awake", harnesses: [], abilities: [] }], reach: {} } as any) : f.t === "browser_sites" ? ({ t: "browser_sites", ready: true, sites: [{ site: "shop.example" }] } as any) : undefined;

  test("the card read off the Log: host, total, items, picture; settled by the person; refusals counted", () => {
    const e = [card(T0 + MIN), ev("task_event", T0 + 30_000, { text: "That press pays or places the order, and paying is the user's own tap: Ducter never presses it." }, "t1"), ev("decision_resolved", T0 + 5 * MIN, { decisionId: "d1", option: "go", by: "user" })];
    const ck = checkoutOf(e, T0)!;
    expect(ck.observed).toEqual({ host: "shop.example", total: true, currency: "CNY", items: 3, picture: true });
    expect(ck.settled).toEqual({ option: "go", by: "user" });
    expect(ck.refused).toBe(1);
  });

  test("walked through with the person: pass", async () => {
    const events = [card(T0 + MIN), ev("decision_resolved", T0 + 5 * MIN, { decisionId: "d1", option: "go", by: "user" })];
    const r = await runCheck(checkNamed("errand-checkout")!, fakeEnv({ answers: ["", "y", "y", ""], frames, events }));
    expect(r.outcome).toBe("pass");
    expect(r.steps.find((s) => s.id === "settled")!.observed).toEqual({ option: "go", by: "user", payPressesRefused: 0 });
  });

  test("settled by a default fails; a browser signed in nowhere stops at once", async () => {
    const events = [card(T0 + MIN), ev("decision_resolved", T0 + 5 * MIN, { decisionId: "d1", option: "hold", by: "default" })];
    expect((await runCheck(checkNamed("errand-checkout")!, fakeEnv({ answers: ["", "y", "y", ""], frames, events }))).outcome).toBe("fail");
    const none = (f: any) => (f.t === "browser_sites" ? ({ t: "browser_sites", ready: true, sites: [] } as any) : frames(f));
    const r = await runCheck(checkNamed("errand-checkout")!, fakeEnv({ answers: [], frames: none, events }));
    expect(r.steps[1]!.note).toContain("sign Ducter's browser in");
    expect(r.steps.slice(2).every((s) => s.outcome === "skip")).toBe(true);
  });

  test("a no from the person carries what they saw", async () => {
    const events = [card(T0 + MIN), ev("decision_resolved", T0 + 5 * MIN, { decisionId: "d1", option: "go", by: "user" })];
    const r = await runCheck(checkNamed("errand-checkout")!, fakeEnv({ answers: ["", "n", "the total was 70", "y", ""], frames, events }));
    expect(r.steps.find((s) => s.id === "matches")).toMatchObject({ outcome: "fail", note: "the total was 70" });
  });
});

describe("pay-words (D436, D446): a saved page read as the gate reads it", () => {
  const page = `<html><head><script>var label = "Pay now";</script></head><body>
    <a href="/cart">去结算</a>
    <button type="button">Add to cart</button>
    <form action="/checkout/place-order"><button>Continue</button></form>
    <form action="/pay/step"><input name="cardnumber"><button type="submit"><svg><title>Pay</title></svg></button></form>
    <form action="/next"><input autocomplete="cc-csc"><button aria-label="Next"></button></form>
    <button>提交订单</button>
    <input type="submit" value="Place order">
    <div role="button" aria-label="Pay with Apple Pay"></div>
  </body></html>`;

  test("each control named by every name it has", async () => {
    const cs = await controlsIn(page);
    expect(cs.find((c) => c.label === "提交订单")).toBeTruthy();
    expect(cs.find((c) => c.pay.words?.includes("Pay"))?.pay).toMatchObject({ submit: true, action: "/pay/step", cardForm: true });
    expect(cs.some((c) => c.pay.words?.some((w) => w.includes("var label")))).toBe(false);
  });

  test("the gate refuses the pays and lets the next-page buttons be", async () => {
    const r = await payControls(page);
    // A wallet's button pays too ("… Apple Pay" ends on the word).
    expect(r.pays).toEqual(["Continue", "Pay", "Next", "提交订单", "Place order", "Pay with Apple Pay"]);
    expect(r.pays).not.toContain("去结算");
    expect(r.pays).not.toContain("Add to cart");
  });

  test("fewer than five pages is not yet; a page the gate missed fails", async () => {
    const files: Record<string, string> = { "/s/a.html": page, "/s/b.html": "<button>Buy</button>" };
    const env = (answers: string[]) => fakeEnv({ answers, readText: (p) => files[p] });
    const opts = { page: ["/s/a.html", "/s/b.html"] };
    expect((await runCheck(checkNamed("pay-words")!, env(["y", "y"]), opts)).outcome).toBe("not-yet");
    const r = await runCheck(checkNamed("pay-words")!, env(["y", "n"]), opts);
    expect(r.steps[1]).toMatchObject({ outcome: "fail", observed: { missed: ["b.html"] } });
    expect((await runCheck(checkNamed("pay-words")!, env([]), {})).steps[0]!.note).toContain("--page");
  });
});

describe("mem-shapes (D433, D444, D458)", () => {
  const contacts = { contacts: [{ contact: "c1", agent: "claude-code", agent_id: "a1", mailbox_available: true, member: { id: "m1" }, space_id: "s1" }, { contact: "c2", agent: "codex", mailbox_available: false, unavailable: true }] };
  const conns = { connections: [{ connection_id: "k1", client_label: "Ducter on hel", state: "active", agent_id: "a1", activity: { last_seen_at_ms: T0 - MIN } }] };
  const nmemOut: Record<string, { code: number; out: string; err: string }> = {
    "--version": { code: 0, out: "nmem 0.10.121\n", err: "" },
    "--agent-context ducter-hel bridge contacts": { code: 0, out: JSON.stringify(contacts), err: "" },
    "bridge connections list --help": { code: 0, out: "  --include-activity  show activity", err: "" },
    "bridge connections list --space-id s1 --agent-id a1 --include-activity": { code: 0, out: JSON.stringify(conns), err: "" },
    "m search -n 5 -- decided": { code: 0, out: JSON.stringify({ memories: [{ id: "m", title: "Use bun", source: "agent", unit_type: "decision" }] }), err: "" },
    "resources get -- nowledgemem://memory/abc": { code: 0, out: JSON.stringify({ resource: { title: "Plan", body: "words" } }), err: "" },
  };
  const env = (over: Record<string, any> = {}) =>
    fakeEnv({
      which: (c) => (c === "nmem" ? "/opt/bin/nmem" : undefined),
      readText: (p) => (p.endsWith("bridge-connection.json") ? JSON.stringify({ spaceId: "s1", agentId: "a1", context: "ducter-hel" }) : p === "/s/msg.json" ? JSON.stringify({ message: { body: "see nowledgemem://memory/abc", knowledge_references: [{ uri: "nowledgemem://threads/t1", purpose: "context" }] } }) : undefined),
      run: async (argv) => {
        expect(argv[0]).toBe("/opt/bin/nmem");
        const key = (argv[1] === "--json" ? argv.slice(2) : argv.slice(1)).join(" ");
        return over[key] ?? nmemOut[key];
      },
    });

  test("the shapes Ducter reads, field names and counts only", () => {
    expect(contactShapes(contacts)).toMatchObject({ list: "contacts", cards: 2, mailboxField: true, unavailableField: true, memberField: true, ownTools: [], usable: 1 });
    expect(activityShapes(conns)).toMatchObject({ connections: 1, activityFields: ["last_seen_at_ms"], seenRead: 1 });
  });

  test("every read verb answered in the shapes Ducter reads: pass", async () => {
    const r = await runCheck(checkNamed("mem-shapes")!, env(), { uri: ["nowledgemem://memory/abc"], message: ["/s/msg.json"] });
    expect(r.steps.map((s) => [s.id, s.outcome])).toEqual([["nmem", "pass"], ["contacts", "pass"], ["activity", "pass"], ["search", "pass"], ["resource", "pass"], ["references", "pass"]]);
    expect(r.outcome).toBe("pass");
    expect(r.steps[5]!.observed).toMatchObject({ refs: 2, where: ["message.knowledge_references"] });
    expect(JSON.stringify(r)).not.toContain("Use bun"); // a memory's title never lands in the result
  });

  test("cards without mailbox_available fail; the extras skip without failing", async () => {
    const r = await runCheck(checkNamed("mem-shapes")!, env({ "--agent-context ducter-hel bridge contacts": { code: 0, out: JSON.stringify({ cards: [{ contact: "c1" }] }), err: "" } }));
    expect(r.steps[1]).toMatchObject({ outcome: "fail", note: "no card carries mailbox_available" });
    expect(r.steps[4]!.outcome).toBe("skip");
    expect(r.outcome).toBe("fail");
  });

  test("activity offered but read nowhere fails", async () => {
    const r = await runCheck(checkNamed("mem-shapes")!, env({ "bridge connections list --space-id s1 --agent-id a1 --include-activity": { code: 0, out: JSON.stringify({ connections: [{ connection_id: "k1", seen: 5 }] }), err: "" } }));
    expect(r.steps[2]!.outcome).toBe("fail");
  });

  const actKey = "bridge connections list --space-id s1 --agent-id a1 --include-activity";
  const act = (j: any) => ({ [actKey]: { code: 0, out: JSON.stringify(j), err: "" } });

  test("Mem's answer on hel: activity_available on the list, last_seen_at_ms null: not yet, not a fail", async () => {
    const j = { schema_version: 2, activity_available: true, connections: [{ connection_id: "k1", created_at_ms: T0 - DAY, last_seen_at_ms: null, home_id: null, device_label: null }] };
    expect(activityShapes(j)).toMatchObject({ connections: 1, listActivity: true, seenRead: 0, seenNotYet: 1, seenMissing: 0 });
    const r = await runCheck(checkNamed("mem-shapes")!, env(act(j)));
    expect(r.steps[2]!.outcome).toBe("not-yet");
    // The time present on the list's own shape: read.
    const seen = { ...j, connections: [{ ...j.connections[0], last_seen_at_ms: T0 - MIN }] };
    expect((await runCheck(checkNamed("mem-shapes")!, env(act(seen)))).steps[2]!.outcome).toBe("pass");
  });

  test("the list says no activity: Ducter reads none, a pass; the field missing under activity: a fail", async () => {
    const off = { activity_available: false, connections: [{ connection_id: "k1" }] };
    expect(activityShapes(off)).toMatchObject({ saysNoActivity: 1, seenMissing: 0 });
    expect((await runCheck(checkNamed("mem-shapes")!, env(act(off)))).steps[2]!.outcome).toBe("pass");
    const r = await runCheck(checkNamed("mem-shapes")!, env(act({ activity_available: true, connections: [{ connection_id: "k1" }] })));
    expect(r.steps[2]).toMatchObject({ outcome: "fail", observed: { seenMissing: 1 } });
  });

  test("bridge contacts is read under the home's Agent Context; without a connection, no cards is said plainly", async () => {
    const seen: string[][] = [];
    const base = env();
    const r = await runCheck(checkNamed("mem-shapes")!, { ...base, readText: () => undefined, run: async (argv) => (seen.push(argv), argv.includes("contacts") ? { code: 0, out: '{"cards":[]}', err: "" } : base.run(argv)) });
    expect(seen.find((a) => a.includes("contacts"))).toEqual(["/opt/bin/nmem", "--json", "bridge", "contacts"]);
    expect(r.steps[1]).toMatchObject({ outcome: "not-yet", observed: { context: false } });
    expect(r.steps[1]!.note).toContain("no Agent Context");
  });

  test("nmem off PATH is found in ~/.local/bin, as core finds it", async () => {
    const e = fakeEnv({ exists: (p) => p === "/Users/anna/.local/bin/nmem", run: async (argv) => (argv[1] === "--version" ? { code: 0, out: "nmem 0.10.121", err: "" } : undefined) });
    const r = await runCheck(checkNamed("mem-shapes")!, e);
    expect(r.steps[0]).toMatchObject({ outcome: "pass", observed: { version: "0.10.121" } });
  });

  test("no nmem stops at once", async () => {
    const r = await runCheck(checkNamed("mem-shapes")!, fakeEnv());
    expect(r.steps[0]!.note).toBe("nmem isn't on this computer");
    expect(r.steps.slice(1).every((s) => s.outcome === "skip")).toBe(true);
  });
});

describe("free-key-429 (D449)", () => {
  const reset = T0 + 6 * 3_600_000;
  const orBody = JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day. ", code: 429, metadata: { headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(reset) } } } });
  const gBody = JSON.stringify({ error: { code: 429, message: "You exceeded your current quota. Please retry in 37s.", status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { retryDelay: "37s" }] } });

  test("OpenRouter's day cap: read from the body, its reset the provider's own", () => {
    const s = limitShapes("openrouter", 429, { "x-ratelimit-reset": String(reset) }, orBody, T0);
    expect(s).toMatchObject({ ok: true, metadataHeaders: true, readProvider: "openrouter", readScope: "day", readSource: "header", agreesWithHeader: true });
  });
  test("Gemini's minute cap with its retry delay", () => {
    expect(limitShapes("google", 429, {}, gBody, T0)).toMatchObject({ ok: true, quotaId: true, readProvider: "google", readScope: "minute", readSource: "header" });
  });
  test("a 429 Ducter can't read fails", () => {
    expect(limitShapes("openrouter", 429, {}, '{"error":"slow down"}', T0).ok).toBe(false);
  });

  test("spent with the person's yes, read, and the key never written", async () => {
    let calls = 0;
    const env = fakeEnv({
      answers: ["openrouter", "yes", "s"],
      secret: async () => "fake-throwaway-not-a-real-key",
      fetch: async (url, init) => {
        expect(url).toContain("openrouter.ai");
        expect(JSON.stringify(init.headers)).toContain("fake-throwaway-not-a-real-key");
        return ++calls < 3 ? new Response('{"choices":[]}', { status: 200 }) : new Response(orBody, { status: 429, headers: { "X-RateLimit-Reset": String(reset) } });
      },
    });
    const r = await runCheck(checkNamed("free-key-429")!, env);
    expect(r.steps.map((s) => s.outcome)).toEqual(["pass", "pass", "pass", "skip"]);
    expect(r.steps[1]!.observed.sent).toBe(3);
    expect(env.clock.now - T0).toBe(2 * 3200); // paced under the minute's cap
    const dir = tmp();
    const text = readFileSync(writeResult(dir, r, "/Users/anna"), "utf8");
    expect(text).not.toContain("fake-throwaway");
    expect(r.outcome).toBe("pass");
  });

  test("without the person's yes nothing is sent", async () => {
    const env = fakeEnv({ answers: ["google", "no"], fetch: async () => Promise.reject(new Error("must not fetch")) });
    const r = await runCheck(checkNamed("free-key-429")!, env);
    expect(r.steps[0]!.note).toBe("not agreed");
    expect(r.outcome).toBe("incomplete");
  });
});

describe("add-folder (D455)", () => {
  const devices = (workerState: string) => ({ t: "devices", devices: [{ id: "local", name: "hel", kind: "server", home: true, state: "awake", harnesses: [], abilities: [] }, { id: "w1", name: "MacBook", kind: "laptop", home: false, state: workerState, harnesses: [], abilities: [] }], reach: {} });
  const frames = (workerState: string) => (f: any) => {
    if (f.t === "devices") return devices(workerState) as any;
    if (f.t === "folder_browse" && f.path === "/") return { t: "folder_browse_result", ok: false, reason: "outside", clientId: f.clientId } as any;
    if (f.t === "folder_browse") return { t: "folder_browse_result", ok: true, clientId: f.clientId, device: f.device, folders: [{ name: "ducter", path: "/x/ducter", repo: true, remote: "github.com/x/ducter" }, { name: "notes", path: "/x/notes" }], roots: ["/home/x"] } as any;
    return undefined;
  };
  test("the home's folders, the outside refused, the worker's folders: pass", async () => {
    const r = await runCheck(checkNamed("add-folder")!, fakeEnv({ frames: frames("awake") }));
    expect(r.outcome).toBe("pass");
    expect(r.steps[1]!.observed).toMatchObject({ folders: 2, repos: 1, withOrigin: 1 });
  });
  test("a worker asleep is not yet", async () => {
    expect((await runCheck(checkNamed("add-folder")!, fakeEnv({ frames: frames("asleep") }))).outcome).toBe("not-yet");
  });
  test("no home answering stops at once", async () => {
    const r = await runCheck(checkNamed("add-folder")!, fakeEnv());
    expect(r.steps[0]!.note).toContain("ducter up");
  });
});

describe("pkg-line (D445), poppler (D439), talk-mic (D442)", () => {
  test("the package manager os-release names", () => {
    expect(expectedManager('NAME="Fedora Linux"\nID=fedora\n')).toBe("dnf");
    expect(expectedManager("ID=arch\n")).toBe("pacman");
    expect(expectedManager('ID=pop\nID_LIKE="ubuntu debian"\n')).toBe("apt");
    expect(expectedManager("ID=nixos\n")).toBeUndefined();
  });
  test("on Fedora the line says dnf; on a Mac it's not yet", async () => {
    const fedora = fakeEnv({ platform: "linux", which: (c) => (c === "dnf" ? "/usr/bin/dnf" : undefined), readText: (p) => (p === "/etc/os-release" ? "ID=fedora\n" : undefined) });
    expect((await runCheck(checkNamed("pkg-line")!, fedora)).outcome).toBe("pass");
    expect((await runCheck(checkNamed("pkg-line")!, fakeEnv())).outcome).toBe("not-yet");
  });
  test("Poppler present passes", async () => {
    expect((await runCheck(checkNamed("poppler")!, fakeEnv({ which: (c) => (c.startsWith("pdf") ? `/usr/bin/${c}` : undefined) }))).outcome).toBe("pass");
  });
  test("a talk answered yes throughout passes; one no fails with what was seen", async () => {
    const yes = await runCheck(checkNamed("talk-mic")!, fakeEnv({ answers: ["y", "y", "y", "y", "s", "y", "y", "s"] }), { platform: ["safari-iphone"] });
    expect(yes.outcome).toBe("pass");
    const no = await runCheck(checkNamed("talk-mic")!, fakeEnv({ answers: ["y", "y", "y", "n", "it stopped listening while speaking", "y", "y", "y", "y"] }), { platform: ["safari-iphone"] });
    expect(no.steps.find((s) => s.id === "over")).toMatchObject({ outcome: "fail", note: "it stopped listening while speaking" });
  });
});

// ---------- the command and the real env's read-only edges ----------

describe("ducter check", () => {
  test("list, run, report against a temp folder", async () => {
    const dir = tmp();
    const out: string[] = [];
    const env = fakeEnv({ vars: { DUCTER_CHECKS_DIR: dir }, which: (c) => (c.startsWith("pdf") ? "/usr/bin/x" : undefined) });
    expect(await checkMain(["list"], { env, out: (s) => void out.push(s) })).toBe(0);
    expect(out.join("\n")).toContain("poppler");
    expect(await checkMain(["run", "poppler"], { env, out: (s) => void out.push(s) })).toBe(0);
    expect(readdirSync(dir)).toEqual(["2026-11-22-poppler.json"]);
    out.length = 0;
    expect(await checkMain(["report", "--json"], { env, out: (s) => void out.push(s) })).toBe(0);
    const rep = JSON.parse(out[0]!);
    expect(rep.find((x: any) => x.name === "poppler")).toMatchObject({ outcome: "pass", file: "2026-11-22-poppler.json" });
    expect(await checkMain(["run", "nope"], { env, out: () => {} })).toBe(2);
    expect(await checkMain(["run", "loops"], { env, out: () => {} })).toBe(1); // no Log here: a fail
  });

  test("the real env reads the Log read-only and refuses a frame that changes something", async () => {
    const dataDir = tmp();
    const db = new Database(join(dataDir, "ducter.db"));
    db.exec("CREATE TABLE events (seq INTEGER PRIMARY KEY, ts TEXT NOT NULL, persona TEXT NOT NULL, stream TEXT NOT NULL, origin TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, supersedes INTEGER)");
    const add = db.prepare("INSERT INTO events (ts, persona, stream, origin, kind, body) VALUES (?, 'p', ?, 'system', ?, ?)");
    add.run(new Date(T0 - 2 * DAY).toISOString(), "channel", "user_msg", '{"text":"old"}');
    add.run(new Date(T0).toISOString(), "channel", "user_msg", '{"text":"new"}');
    add.run(new Date(T0).toISOString(), "partner", "partner_session", '{"event":"brain_back","harness":"codex"}');
    db.close();
    const env = realCheckEnv({ dataDir, port: 1, version: "test" });
    const got = env.events(["user_msg"], T0 - DAY)!;
    expect(got.map((e) => e.body.text)).toEqual(["new"]);
    expect(realCheckEnv({ dataDir: tmp(), port: 1, version: "test" }).events(["user_msg"], 0)).toBeUndefined();
    await expect(env.homeAsk({ t: "say", text: "x" } as any, () => true)).rejects.toThrow("not a read-only frame");
  });
});
