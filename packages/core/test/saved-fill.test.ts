// D191: fill by reference through the real core (decisions, Log, MCP, the clients' socket), with a
// fake browser seam: a sign-in only on its own site and after the first OK, a card only after a Go
// that names the merchant, amount and last four, the security code from that Go, every use in the
// history, and no secret anywhere in the Log, a tool's answer or a client frame.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import type { FillSeam } from "../src/saved/fill.ts";
import { tempDir } from "./helpers.ts";

const PAN = "4242424242424242";
const PASSWORD = "correct-horse-battery-staple-9";
const CVC = "737";

let core: Core;
let td: ReturnType<typeof tempDir>;
let page = { url: "https://github.com/login", host: "github.com" };
const typed: { ref: number; value: string }[] = [];
const ctx = { role: "task" as const, taskId: "t1" };
const call = (name: string, args: object = {}) => core.mcp.call(ctx, name, args) as Promise<string>;
const answers: string[] = [];

const seam: FillSeam = {
  where: async () => page,
  fill: async (_t, ref, value) => void typed.push({ ref, value }),
};

const decisionsOpen = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]);
const lastDecision = () => decisionsOpen().at(-1)!;

async function socket() {
  const ws = new WebSocket(core.url);
  const frames: ServerFrame[] = [];
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ t: "hello" }));
  const wait = async (pred: (f: ServerFrame) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const f = frames.find(pred);
      if (f) return f;
      await Bun.sleep(10);
    }
    throw new Error("no frame");
  };
  return { ws, frames, wait, send: (f: object) => ws.send(JSON.stringify(f)) };
}

beforeEach(() => {
  td = tempDir();
  typed.length = 0;
  answers.length = 0;
  core = startCore({ dataDir: td.dir, port: 0, push: false, browser: false });
  core.autofill.attachBrowser({ task: (id: string) => (id === "t1" ? ({} as never) : undefined) } as never, seam);
  core.log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "Book the Kyoto hotel", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "Book it." } });
  const s = core.autofill.store;
  s.put({ kind: "signin", site: "github.com", username: "ada@example.com", password: PASSWORD });
  s.put({ kind: "card", name: "Ada Lovelace", number: PAN, expMonth: 8, expYear: 2029 });
  s.put({ kind: "detail", values: { name: "Ada Lovelace", passport_number: "E12345678", seat: "window" } });
});
afterEach(async () => {
  await core.stop();
  td.cleanup();
});

function noSecretAnywhere(extra: string[] = []) {
  const all = JSON.stringify(core.log.read({ fromSeq: 0, limit: 100_000 })) + answers.join("\n") + extra.join("\n");
  for (const s of [PAN, PASSWORD, CVC, "E12345678"]) expect(all).not.toContain(s);
}

describe("listing", () => {
  test("saved_list: handles and names, never a value; for the partner too", async () => {
    const out = await call("saved_list");
    answers.push(out);
    expect(out).toContain("signin:github.com");
    expect(out).toContain("card:visa-4242: Visa ••4242");
    expect(out).toContain("me.seat = window");
    expect(out).toContain("me.passport_number (kept; fill only");
    const p = (await core.mcp.call({ role: "partner" }, "saved_list", {})) as string;
    expect(p).toContain("card:visa-4242");
    expect(core.mcp.tools("partner")).toContain("saved_list");
    noSecretAnywhere([p]);
  });

  test("a brief that names a saved handle asks for Ducter's own browser", () => {
    expect(core.autofill.wants({ brief: "Book it; pay with card:visa-4242." })).toBe(true);
    expect(core.autofill.wants({ brief: "Sign in with signin:github.com then star it" })).toBe(true);
    expect(core.autofill.wants({ brief: "Fill me.passport_number on the form" })).toBe(true);
    expect(core.autofill.wants({ brief: "pay with card:visa-1111" })).toBe(false);
    expect(core.autofill.wants({ brief: "Look up the weather" })).toBe(false);
  });

  test("a task with no browser of Ducter's sees none of it", async () => {
    await expect(core.mcp.call({ role: "task", taskId: "other" }, "browser_fill", { ref: 1, use: "signin:github.com" })).rejects.toThrow();
  });
});

describe("sign-ins", () => {
  test("only on its own site: a look-alike page gets nothing", async () => {
    page = { url: "https://github.com.login-verify.io/", host: "github.com.login-verify.io" };
    await expect(call("browser_fill", { ref: 2, use: "signin:github.com", part: "password" })).rejects.toThrow(/look-alike|only on their own site/);
    expect(typed).toEqual([]);
  });

  test("never on a page that isn't https", async () => {
    page = { url: "http://github.com/login", host: "github.com" };
    await expect(call("browser_fill", { ref: 2, use: "signin:github.com", part: "password" })).rejects.toThrow(/secure/);
  });

  test("the first use asks; after OK it fills, and later fills don't ask", async () => {
    page = { url: "https://github.com/login", host: "github.com" };
    const first = await call("browser_fill", { ref: 2, use: "signin:github.com", part: "password" });
    answers.push(first);
    expect(first).toMatch(/first time/);
    expect(typed).toEqual([]);
    const d = lastDecision();
    expect(d.fill).toMatchObject({ site: "github.com", handle: "signin:github.com", kind: "signin" });
    core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: d.decisionId, option: "go", by: "user" } });
    await Bun.sleep(10);
    answers.push(await call("browser_fill", { ref: 1, use: "signin:github.com", part: "username" }));
    answers.push(await call("browser_fill", { ref: 2, use: "signin:github.com", part: "password" }));
    expect(typed).toEqual([
      { ref: 1, value: "ada@example.com" },
      { ref: 2, value: PASSWORD },
    ]);
    expect(decisionsOpen().length).toBe(1);
    const uses = core.autofill.store.view().uses;
    expect(uses.map((u) => u.what)).toEqual(["filled", "ok"]);
    expect(uses[0]).toMatchObject({ site: "github.com", taskId: "t1", task: "Book the Kyoto hotel" });
    noSecretAnywhere();
  });
});

describe("cards", () => {
  beforeEach(() => {
    page = { url: "https://checkout.hotel-okura.example/pay", host: "checkout.hotel-okura.example" };
  });

  test("no fill without a Go", async () => {
    await expect(call("browser_fill", { ref: 4, use: "card:visa-4242", part: "number" })).rejects.toThrow(/Go on a pay card/);
    expect(typed).toEqual([]);
  });

  test("the Go card names the merchant from the page, the amount and the last four; Go needs the code; then it fills", async () => {
    const asked = await call("browser_ask_to_pay", { use: "card:visa-4242", amount: "¥38,400", currency: "jpy", what: "1 night, Nov 20" });
    answers.push(asked);
    const d = lastDecision();
    expect(d.pay).toMatchObject({ site: "checkout.hotel-okura.example", amount: "38,400", currency: "JPY", last4: "4242", card: "Visa ••4242", needsCvc: true, firstHere: true, what: "1 night, Nov 20" });
    expect(d.reversible).toBe(false);
    expect(d.defaultAt).toBeUndefined();
    expect(d.goLabel).toBe("Pay");
    expect(d.question).toContain("checkout.hotel-okura.example");

    const c = await socket();
    // Go without the code is refused (nothing half-paid).
    c.send({ t: "decide", decisionId: d.decisionId, option: "go" });
    await c.wait((f) => f.t === "error");
    expect(core.decisions.isPending(d.decisionId)).toBe(true);
    c.send({ t: "decide", decisionId: d.decisionId, option: "go", cvc: CVC });
    for (let i = 0; i < 100 && core.decisions.isPending(d.decisionId); i++) await Bun.sleep(10);
    expect(core.decisions.isPending(d.decisionId)).toBe(false);
    c.ws.close();

    for (const part of ["number", "exp", "cvc", "name"]) answers.push(await call("browser_fill", { ref: 9, use: "card:visa-4242", part }));
    expect(typed.map((x) => x.value)).toEqual([PAN, "08/29", CVC, "Ada Lovelace"]);
    // Another site, or another card: refused even within the window.
    page = { url: "https://evil.example/pay", host: "evil.example" };
    await expect(call("browser_fill", { ref: 4, use: "card:visa-4242" })).rejects.toThrow(/Go on a pay card/);
    const uses = core.autofill.store.view().uses;
    expect(uses.find((u) => u.what === "approved")).toMatchObject({ amount: "JPY 38,400", site: "checkout.hotel-okura.example" });
    expect(core.autofill.store.paidOn("card:visa-4242", "checkout.hotel-okura.example")).toBe(true);
    // The task hears the Go in words, with the handle, never the code.
    const told = core.log.read({ stream: "task:t1", fromSeq: 0, limit: 1000 }).map((e) => JSON.stringify(e.body)).join("\n");
    expect(told).not.toContain(CVC);
    noSecretAnywhere();
  });

  test("Hold: nothing fills, and the history says declined", async () => {
    await call("browser_ask_to_pay", { use: "card:visa-4242", amount: "12.00", currency: "USD" });
    const d = lastDecision();
    core.decisions.decide(d.decisionId, "hold");
    await Bun.sleep(10);
    await expect(call("browser_fill", { ref: 4, use: "card:visa-4242" })).rejects.toThrow();
    expect(core.autofill.store.view().uses[0]!.what).toBe("declined");
  });

  test("never on a page that isn't https", async () => {
    page = { url: "http://shop.example/pay", host: "shop.example" };
    await expect(call("browser_ask_to_pay", { use: "card:visa-4242", amount: "1", currency: "USD" })).rejects.toThrow(/never pay here/);
  });
});

describe("details", () => {
  test("readable ones fill at once; a passport number asks the first time on each site", async () => {
    page = { url: "https://www.ana.co.jp/booking", host: "ana.co.jp" };
    answers.push(await call("browser_fill", { ref: 3, use: "me.name" }));
    expect(typed).toEqual([{ ref: 3, value: "Ada Lovelace" }]);
    const r = await call("browser_fill", { ref: 5, use: "me.passport_number" });
    expect(r).toMatch(/first time/);
    expect(lastDecision().fill).toMatchObject({ site: "ana.co.jp", kind: "detail", label: "Passport number" });
    core.decisions.decide(lastDecision().decisionId, "go");
    await Bun.sleep(10);
    answers.push(await call("browser_fill", { ref: 5, use: "me.passport_number" }));
    expect(typed.at(-1)).toEqual({ ref: 5, value: "E12345678" });
    noSecretAnywhere();
  });
});

describe("the clients' frames", () => {
  test("saved_put then saved: what comes back never holds the secret", async () => {
    const c = await socket();
    c.send({ t: "saved_put", item: { kind: "card", name: "Ada", number: "5555 5555 5555 4444", expMonth: 1, expYear: 30 } });
    const f = (await c.wait((x) => x.t === "saved" && x.ok === true)) as Extract<ServerFrame, { t: "saved" }>;
    expect(f.items.some((i) => i.last4 === "4444")).toBe(true);
    c.send({ t: "saved_put", item: { kind: "card", name: "Ada", number: "1234", expMonth: 1, expYear: 30 } });
    const bad = await c.wait((x) => x.t === "saved" && x.ok === false);
    expect(bad).toMatchObject({ reason: "invalid" });
    c.send({ t: "saved" });
    await Bun.sleep(50);
    c.ws.close();
    const wire = JSON.stringify(c.frames);
    for (const s of ["5555555555554444", "5555 5555 5555 4444", PAN, PASSWORD, "E12345678"]) expect(wire).not.toContain(s);
    expect(wire).toContain('"keptIn":"file"');
    noSecretAnywhere();
  });
});
