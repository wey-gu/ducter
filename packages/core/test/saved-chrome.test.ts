// D191 against a real headless Chrome: a fake checkout page, driven by the task's browser tools,
// paid with a saved test card after a Go. Proves fill by reference: the merchant gets the number,
// the model never does, even from a page that echoes what was typed into its own text, and the
// filled fields are drawn as dots (so a screenshot shows none). The model-bound context here is
// every tool answer the task got; the Log is read whole.
//
// Needs a Chrome for Testing: DUCTER_TEST_CHROME=<its executable> (never the user's own Chrome;
// a throwaway profile under a temp data dir). Skipped without it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

const CHROME = process.env.DUCTER_TEST_CHROME;
const run = CHROME && existsSync(CHROME) ? describe : describe.skip;

const PAN = "4242424242424242"; // Stripe's test Visa, never a real card
const CVC = "737";
const PASSWORD = "correct-horse-battery-staple-9";

// A checkout that echoes every keystroke into its own text, as a hostile or sloppy page might.
const CHECKOUT = `<!doctype html><meta charset="utf-8"><title>Checkout · Hotel Okura (test)</title>
<h1>Checkout</h1><p>1 night, Nov 20 · Total ¥38,400</p>
<form method="post" action="/pay">
<label for="name">Name on card</label><input id="name" name="name" autocomplete="cc-name">
<label for="num">Card number</label><input id="num" name="cardnumber" autocomplete="cc-number" inputmode="numeric">
<label for="exp">Expiry (MM/YY)</label><input id="exp" name="exp" autocomplete="cc-exp">
<label for="cvc">Security code</label><input id="cvc" name="cvc" autocomplete="cc-csc">
<button type="submit">Pay ¥38,400</button></form>
<div id="echo"></div>
<script>for (const el of document.querySelectorAll("input")) el.addEventListener("input", () => { document.getElementById("echo").textContent = "You typed: " + [...document.querySelectorAll("input")].map((i) => i.value).join(" | "); });</script>`;

run("Fill by reference on a real Chrome (D191)", () => {
  let site: ReturnType<typeof Bun.serve>;
  let core: Core;
  let td: ReturnType<typeof tempDir>;
  let base = "";
  let received: Record<string, string> | undefined;
  const said: string[] = []; // everything the model was told
  const ctx = { role: "task" as const, taskId: "t1" };
  const call = async (name: string, args: object = {}) => {
    const out = String(await core.mcp.call(ctx, name, args));
    said.push(out);
    return out;
  };
  const refOf = (read: string, label: string) => Number(read.split("\n").find((l) => l.includes(`"${label}"`))!.match(/^\[(\d+)\]/)![1]);

  beforeAll(() => {
    site = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/pay" && req.method === "POST") {
          received = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
          return new Response(`<!doctype html><title>Booked</title><h1>Booked: order OK-2026-1120</h1>`, { headers: { "content-type": "text/html" } });
        }
        return new Response(CHECKOUT, { headers: { "content-type": "text/html" } });
      },
    });
    base = `http://127.0.0.1:${site.port}`;
    td = tempDir();
    core = startCore({ dataDir: td.dir, port: 0, push: false, browser: { find: () => ({ path: CHROME!, version: "test" }), idleMs: 60_000 } });
    core.log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "Book the Kyoto hotel", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "Book one night." } });
    core.ducterBrowser!.port.attach("t1", { profile: "default", evidenceDir: join(td.dir, "evidence", "t1"), downloads: join(td.dir, "scratch", "t1") });
    core.autofill.store.put({ kind: "card", name: "Ada Lovelace", number: PAN, expMonth: 8, expYear: 2029 });
    core.autofill.store.put({ kind: "signin", site: "github.com", username: "ada@example.com", password: PASSWORD });
  });

  afterAll(async () => {
    await core?.stop();
    site?.stop(true);
    td?.cleanup();
  });

  test("the card fields refuse typing; the Go names this page's host; the fill reaches the merchant, never the model", async () => {
    const opened = await call("browser_open", { url: `${base}/checkout` });
    expect(opened).toContain('card number field "Card number" (only from a saved card');
    const num = refOf(opened, "Card number");
    await expect(core.mcp.call(ctx, "browser_type", { ref: num, text: PAN })).rejects.toThrow(/card field/);
    await expect(call("browser_fill", { ref: num, use: "card:visa-4242" })).rejects.toThrow(/Go on a pay card/);

    await call("browser_ask_to_pay", { use: "card:visa-4242", amount: "38,400", currency: "JPY", what: "1 night, Nov 20" });
    const d = core.log.read({ fromSeq: 0, limit: 1000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).at(-1)!;
    expect(d.pay).toMatchObject({ site: "127.0.0.1", amount: "38,400", currency: "JPY", last4: "4242" });
    const ws = new WebSocket(core.url);
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ t: "hello" }));
    ws.send(JSON.stringify({ t: "decide", decisionId: d.decisionId, option: "go", cvc: CVC }));
    for (let i = 0; i < 100 && core.decisions.isPending(d.decisionId); i++) await Bun.sleep(10);
    ws.close();
    expect(core.decisions.isPending(d.decisionId)).toBe(false);

    const read = await call("browser_read");
    await call("browser_fill", { ref: refOf(read, "Name on card"), use: "card:visa-4242", part: "name" });
    await call("browser_fill", { ref: refOf(read, "Card number"), use: "card:visa-4242", part: "number" });
    await call("browser_fill", { ref: refOf(read, "Expiry (MM/YY)"), use: "card:visa-4242", part: "exp" });
    await call("browser_fill", { ref: refOf(read, "Security code"), use: "card:visa-4242", part: "cvc" });

    // The page echoed the number into its own text: the read hides it anyway.
    const after = await call("browser_read");
    expect(after).toContain("(filled from saved; hidden)");
    expect(after).toContain("You typed:");
    // Drawn as dots: what a screenshot would show.
    const { b, sessionId } = await core.ducterBrowser!.host.tab("t1");
    const dots = await b.cdp.send("Runtime.evaluate", { expression: `getComputedStyle(document.getElementById("num")).webkitTextSecurity`, returnByValue: true }, sessionId);
    expect(dots.result.value).toBe("disc");
    const shot = await call("browser_screenshot", { name: "checkout" });
    expect(existsSync(shot)).toBe(true);

    await call("browser_click", { ref: refOf(after, "Pay ¥38,400") });
    expect(received).toMatchObject({ cardnumber: PAN, cvc: CVC, exp: "08/29", name: "Ada Lovelace" });
    expect(await call("browser_read")).toContain("order OK-2026-1120");

    // The proof: nothing the model was told, and nothing in the Log, holds the number, the code or the password.
    const everything = said.join("\n") + JSON.stringify(core.log.read({ fromSeq: 0, limit: 100_000 }));
    for (const secret of [PAN, "4242 4242 4242 4242", CVC, PASSWORD]) expect(everything).not.toContain(secret);
    expect(core.autofill.store.view().uses.map((u) => u.what)).toEqual(["filled", "approved"]);
  }, 60_000);

  test("a field the page re-rendered into another one since the read gets nothing", async () => {
    core.autofill.store.put({ kind: "detail", values: { email: "ada@example.com" } });
    const read = await call("browser_open", { url: `${base}/checkout` });
    const ref = refOf(read, "Name on card");
    // A re-render that reuses the node for another field (Stripe's billing block does this).
    const { b, sessionId } = await core.ducterBrowser!.host.tab("t1");
    await b.cdp.send("Runtime.evaluate", { expression: `(() => { const el = document.getElementById("name"); el.name = "addressLine1"; el.autocomplete = "address-line1"; })()` }, sessionId);
    await expect(call("browser_fill", { ref, use: "me.email" })).rejects.toThrow(/page changed under field/);
    const again = await call("browser_read");
    await call("browser_fill", { ref: refOf(again, "Name on card"), use: "me.email" });
  }, 30_000);

  test("a saved sign-in never fills on another site", async () => {
    await call("browser_open", { url: `${base}/checkout` });
    await expect(call("browser_fill", { ref: 1, use: "signin:github.com", part: "password" })).rejects.toThrow(/only on their own site/);
  }, 30_000);
});
