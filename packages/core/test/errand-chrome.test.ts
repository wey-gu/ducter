// D436 against a real headless Chrome: one errand to the checkout on a local fixture shop. The
// task's own browser tools do the legwork (search, three products into the cart, the checkout, the
// buyer's details by handle), a "confirm it's you" step goes to the person in the live view, every
// press that would pay is refused by code, and browser_at_checkout puts one 去付款 card. The person
// pays in the live view with their own click; 付好了 answers the card; Done for you lists it.
//
// Needs a Chrome for Testing: DUCTER_TEST_CHROME=<its executable> (never the user's own Chrome;
// a throwaway profile under a temp data dir). Skipped without it. No real shop is visited.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { createDid } from "../src/did.ts";
import { tempDir } from "./helpers.ts";
import { startFixtureShop, type FixtureShop } from "./fixture-shop.ts";

const CHROME = process.env.DUCTER_TEST_CHROME;
const run = CHROME && existsSync(CHROME) ? describe : describe.skip;

run("An errand to the checkout on a fixture shop (D436)", () => {
  let shop: FixtureShop;
  let core: Core;
  let td: ReturnType<typeof tempDir>;
  const ctx = { role: "task" as const, taskId: "t_buy" };
  const said: string[] = [];
  const call = async (name: string, args: object = {}) => {
    const out = String(await core.mcp.call(ctx, name, args));
    said.push(out);
    return out;
  };
  /** The [n] of the first line that holds these words. */
  const refOf = (read: string, words: string) => {
    const line = read.split("\n").find((l) => /^\[\d+\]/.test(l) && l.includes(words));
    if (!line) throw new Error(`no [n] with "${words}" in:\n${read}`);
    return Number(line.match(/^\[(\d+)\]/)![1]);
  };
  const decisions = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]);
  const frames: ServerFrame[] = [];
  const sink = { send: (f: ServerFrame) => void frames.push(f) };
  /** The person's own click at an element of the tab they hold, through the live view's input. */
  const personClicks = async (viewId: string, selector: string) => {
    const { b, sessionId } = await core.ducterBrowser!.host.tab("t_buy");
    const at = (await b.cdp.send("Runtime.evaluate", { expression: `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; })()`, returnByValue: true }, sessionId)).result.value as { x: number; y: number };
    const live = core.ducterBrowser!.live;
    await live.input(sink, viewId, { kind: "mouse", type: "down", x: at.x, y: at.y, button: "left", clicks: 1 });
    await live.input(sink, viewId, { kind: "mouse", type: "up", x: at.x, y: at.y, button: "left", clicks: 1 });
    await Bun.sleep(600);
  };

  beforeAll(() => {
    shop = startFixtureShop({ lang: "zh", verify: true });
    td = tempDir();
    core = startCore({ dataDir: td.dir, port: 0, push: false, browser: { find: () => ({ path: CHROME!, version: "test" }), idleMs: 60_000 } });
    core.log.append({ stream: "task:t_buy", origin: "partner", kind: "task_open", body: { taskId: "t_buy", title: "把购物车里那三样买了", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "「帮我把购物车里那三样买了」", needs: { buy: true, browse: true } } });
    core.ducterBrowser!.port.attach("t_buy", { profile: "default", evidenceDir: join(td.dir, "evidence", "t_buy"), downloads: join(td.dir, "scratch", "t_buy") });
    core.autofill.store.put({ kind: "detail", values: { name: "林小满", phone: "13800138000" } });
  });

  afterAll(async () => {
    await core?.stop();
    shop?.stop();
    td?.cleanup();
  });

  test("the errand runs on Ducter's own browser (needs.buy)", () => {
    expect(core.ducterBrowser!.port.wants!("t_buy")).toBe(true);
    expect(core.ducterBrowser!.port.wants!("other", "look up the weather", { buy: true })).toBe(true);
  });

  test("legwork to the checkout, a step handed over, every pay press refused, one card, the person pays", async () => {
    // Search, product, add: three times.
    for (const [q, name] of [["数据线", "USB-C 数据线"], ["咖啡", "云南小粒咖啡豆"], ["笔记本", "A5 方格笔记本"]] as const) {
      const found = await call("browser_open", { url: `${shop.url}/search?q=${encodeURIComponent(q)}` });
      await call("browser_click", { ref: refOf(found, name) });
      await call("browser_click", { ref: refOf(await call("browser_read"), "加入购物车") });
    }
    expect(shop.cart).toEqual(["cable", "beans", "notebook"]);
    const cart = await call("browser_open", { url: `${shop.url}/cart` });
    expect(cart).toContain("¥154.70");
    await call("browser_click", { ref: refOf(cart, "去结算") });

    // "Are you a person": the person's step, in the same tab.
    const verify = await call("browser_read");
    expect(verify).toContain("请先完成安全验证");
    await call("browser_ask_sign_in", { url: `${shop.url}/verify`, step: "点一下「我不是机器人」" });
    const step = decisions().find((d) => d.signIn?.step)!;
    expect(step.signIn).toMatchObject({ site: "127.0.0.1", step: "点一下「我不是机器人」" });
    await expect(core.mcp.call(ctx, "browser_read", {})).resolves.toBeDefined(); // no view yet: still the task's turn
    const v1 = (await core.ducterBrowser!.live.open(sink, step.decisionId, { width: 1000, height: 760 }))!;
    expect(v1).toBeTruthy();
    await expect(core.mcp.call(ctx, "browser_read", {})).rejects.toThrow(/user's turn/); // blind in the person's turn
    await personClicks(v1, "form[action='/verify'] button");
    await core.ducterBrowser!.live.close(sink, v1, true);
    expect(core.decisions.isPending(step.decisionId)).toBe(false);
    expect(shop.verified).toBe(true);

    // The checkout: the buyer's details by handle (readable details: no first-use card).
    const co = await call("browser_read");
    expect(co).toContain("立即支付 ¥154.70");
    await call("browser_fill", { ref: refOf(co, "收货人"), use: "me.name" });
    await call("browser_fill", { ref: refOf(co, "手机号"), use: "me.phone" });

    // The floor, in code: a click, Enter on the focused pay button, a submit from a field.
    const after = await call("browser_read");
    const pay = refOf(after, "立即支付");
    await expect(core.mcp.call(ctx, "browser_click", { ref: pay })).rejects.toThrow(/paying is the user's own tap/);
    const { b, sessionId } = await core.ducterBrowser!.host.tab("t_buy");
    await b.cdp.send("Runtime.evaluate", { expression: `document.querySelector("form[action='/pay'] button").focus()` }, sessionId);
    await expect(core.mcp.call(ctx, "browser_press", { key: "Enter" })).rejects.toThrow(/paying is the user's own tap/);
    await expect(core.mcp.call(ctx, "browser_type", { ref: refOf(after, "收货人"), text: "x", submit: true })).rejects.toThrow(/paying is the user's own tap/);
    await Bun.sleep(300);
    expect(shop.presses).toHaveLength(0);

    // The stop: one card with the page's host (code's word), the total, the items, a picture.
    await call("browser_at_checkout", { what: "购物车里的三样", total: "154.70", currency: "CNY", items: ["USB-C 数据线 1.8 米", "云南小粒咖啡豆 500 g", "A5 方格笔记本 3 本装"] });
    const card = decisions().find((d) => d.checkout)!;
    expect(card.checkout).toMatchObject({ site: "127.0.0.1", total: "154.70", currency: "CNY", what: "购物车里的三样" });
    expect(card.checkout!.items).toHaveLength(3);
    expect(card.checkout!.media?.[0]?.type).toBe("image/jpeg");
    expect(card).toMatchObject({ defaultOption: "hold", reversible: false });
    expect(card.defaultAt).toBeUndefined();
    expect(core.tasks.get("t_buy")?.attention).toBe("needs_you");

    // 去付款: the same tab, the person's turn; their own click pays; 付好了 answers the card.
    const v2 = (await core.ducterBrowser!.live.open(sink, card.decisionId, { width: 1000, height: 760 }))!;
    expect(frames.some((f) => f.t === "live" && (f as { id?: string; state?: string }).id === v2 && (f as { state?: string }).state === "open")).toBe(true);
    await personClicks(v2, "form[action='/pay'] button");
    expect(shop.presses).toHaveLength(1);
    expect(shop.presses[0]).toMatchObject({ buyer: "林小满", tel: "13800138000" });
    await core.ducterBrowser!.live.close(sink, v2, true);
    expect(core.decisions.isPending(card.decisionId)).toBe(false);

    // The task reads the confirmation; Done for you lists what the person paid themselves.
    expect(await call("browser_read")).toContain("EM-20261121-0042");
    const items = createDid({ log: core.log, tasks: core.tasks, uses: () => core.autofill.store.view().uses }).query({}).items;
    const paid = items.find((i) => i.sub === "checkout")!;
    expect(paid).toMatchObject({ kind: "paid", to: "127.0.0.1", amount: "CNY 154.70", line: "购物车里的三样", go: { by: "paid" } });

    // The buyer's details never reached the model.
    for (const v of ["林小满", "13800138000"]) expect(said.join("\n")).not.toContain(v);
  }, 120_000);
});
