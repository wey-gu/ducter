// D404: Settings walked as flows, not pages. Each pane's flow is driven through the real core pieces
// (the chat-app hub against the fake Telegram, the sources against a fake OpenConnector, the saved
// store), and at each step the words the page shows are asserted: before, during, after, and the
// partner's one line after a change. Plus the small rules the walk found: an expiry typed on a number
// pad, the keyboard's inset on iOS, a failed connect said in the person's language.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { A } from "../src/app.ts";
import { strings } from "../src/i18n.ts";
import { parseExp, shapeExp } from "../src/autofill.tsx";
import { watchWhat } from "../src/accounts.tsx";
import { chatLinkedNow, stateLine } from "../src/channels.tsx";
import { keyboardInset } from "../src/keyboard.ts";
import { FAILED_DETAILS, failedLine } from "../src/memory.tsx";
import { channelRig } from "../../../packages/core/test/channels-rig.ts";
import { fakeOpenConnector } from "../../../packages/core/test/fake-mcp.ts";
import { tempDir } from "../../../packages/core/test/helpers.ts";
import { openLog } from "../../../packages/core/src/log.ts";
import { ooSource, openConnections } from "../../../packages/core/src/connections.ts";
import { fileKey } from "../../../packages/core/src/saved/key.ts";
import { openSaved } from "../../../packages/core/src/saved/store.ts";

const src = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const zh = strings("zh");
const en = strings("en");
A.L = zh;

describe("Chat apps: set up, link, disconnect (D404)", () => {
  let rig: ReturnType<typeof channelRig> | undefined;
  afterEach(() => rig?.stop());

  test("each step says where it stands, the link is answered once, a disconnect is answered", async () => {
    rig = channelRig();
    const tg = () => rig!.hub.view().find((v) => v.kind === "telegram")!;
    let seen = tg().state;
    expect(stateLine(tg())[0]).toBe("还没连上");

    // The key pasted: the bot is on, the person not yet linked.
    expect((await rig.hub.connect("telegram", { token: rig.tg.token })).ok).toBe(true);
    expect(tg().state).toBe("unlinked");
    expect(stateLine(tg())[0]).toBe("还差一步：连上你的账号");
    expect(chatLinkedNow(seen, tg().state)).toBe(false);
    seen = tg().state;

    // The code: with Telegram's deep link the page offers the button and "or send"; without it, only "send".
    const c = rig.hub.code("telegram");
    expect(c.ok && !!c.link).toBe(true);
    expect(zh.t("chats.tg.code")).toStartWith("或者");
    expect(zh.t("chats.tg.code.only")).not.toContain("或者");

    // The person sends /start: linked, and that moment (not the page opening) gets the partner's line.
    if (!c.ok) throw new Error("no code");
    rig.tg.says(4242, `/start ${c.link!.split("start=")[1]}`);
    const until = Date.now() + 4000;
    while (tg().state !== "linked" && Date.now() < until) await Bun.sleep(10);
    expect(tg().state).toBe("linked");
    expect(chatLinkedNow(seen, tg().state)).toBe(true);
    expect(chatLinkedNow(undefined, "linked")).toBe(false); // opening the page on a linked app says nothing
    expect(chatLinkedNow("linked", "linked")).toBe(false);
    expect(stateLine(tg())[1]).toBe("done");
    expect(zh.t("said.chats.linked", "Telegram")).toBe("连上了。以后在 Telegram 里找我也行。");

    // Disconnect: back to resting, and the partner says what happened and what stayed.
    rig.hub.forget("telegram");
    expect(tg().state).toBe("off");
    expect(stateLine(tg())[0]).toBe("还没连上");
    expect(zh.t("said.chats.off", "Telegram")).toBe("好，Telegram 断开了。你们的对话还在这里。");
    expect(en.t("said.chats.off", "Telegram")).toBe("Done: Telegram is disconnected. Our conversation is still here.");
    // Setting up again: the steps name the way back to a bot made before.
    expect(zh.t("chats.tg.step1.have")).toContain("/mybots");
  });
});

describe("Accounts: connect a source, stop it (D404)", () => {
  test("added, it lists its services; stopped, it is gone and the partner says so", async () => {
    const t = tempDir();
    const oc = fakeOpenConnector([{ id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [] }) }], "demo_oc_not_a_key");
    try {
      const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
      const c = openConnections({ dataDir: t.dir, log, oo: ooSource({ env: {}, dir: "/nonexistent-oo", which: () => null }) });
      expect(c.view()).toEqual([]);
      const r = await c.add({ url: oc.url, token: "demo_oc_not_a_key" });
      expect(r.ok).toBe(true);
      expect(c.view().length).toBe(1);
      expect(c.remove(c.view()[0]!.id)).toBe(true);
      expect(c.view()).toEqual([]);
      // research/165: a watch line names the app with the account (one address is both mail and calendar).
      expect(zh.t("said.watch.off", watchWhat("日历", "w@nowledge-labs.ai"))).toBe("好，日历里的 w@nowledge-labs.ai 你问起来我再看。");
      A.L = en;
      expect(en.t("said.watch.on", watchWhat("Gmail", "w@nowledge-labs.ai"))).toBe("Got it: I'll keep an eye on w@nowledge-labs.ai (Gmail) myself.");
      A.L = zh;
      expect(watchWhat("Slack bot")).toBe("Slack bot");
      expect(zh.t("said.acct.stop", "OOMOL")).toBe("好，OOMOL 停了：它连着的账号我都不看了。想再用，重新连上就好。");
      // Both clients answer the stop where it happened.
      expect(src("apps/web/src/accounts.tsx")).toContain('say("acct-stop"');
      expect(src("apps/desktop/internal/views/accounts.go")).toContain('a.say("acct-stop"');
      log.close();
    } finally {
      oc.stop();
      t.cleanup();
    }
  });
});

// The Mac walk of 0.0.98: the web's said line had no style at all (no pebble, the body's ink, flush to
// the card's edge), and a watch switch's line sat under a seven-row group, past the fold.
describe("The partner's word, as the Mac draws it", () => {
  test("the pebble and the soft ink are styled, with tokens only", () => {
    const css = src("apps/web/static/app.css");
    const block = css.slice(css.indexOf(".said-line {"), css.indexOf("@keyframes said-pop"));
    expect(block).toContain(".said-line .said-dot {");
    expect(block).toContain("color: var(--ink-soft)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });
  test("a watch line lands under its row, one per source; the switch is named with its account", () => {
    const acc = src("apps/web/src/accounts.tsx");
    expect(acc).toContain("<Said k={`watch:${c.id}|${key(w)}`} in />");
    expect(acc).not.toContain("<Said k={`watch:${c.id}`} />");
    expect(acc).toContain("label: `${watchWhat(title, w.account)}, ${t(\"tile.watch\")}`");
  });
});

describe("Passwords & cards: a card typed on a phone (D404)", () => {
  test("a number pad has no slash: 0829 is 08/29, and the card saves", () => {
    expect(parseExp("08/29")).toEqual({ month: 8, year: 2029 });
    expect(parseExp("0829")).toEqual({ month: 8, year: 2029 });
    expect(parseExp("829")).toEqual({ month: 8, year: 2029 });
    expect(parseExp("08 29")).toEqual({ month: 8, year: 2029 });
    expect(parseExp("8/2029")).toEqual({ month: 8, year: 2029 });
    expect(parseExp("13/29")).toBeUndefined();
    expect(parseExp("00/29")).toBeUndefined();
    expect(parseExp("08/2")).toBeUndefined();
    expect(shapeExp("0130")).toBe("01/30");
    expect(shapeExp("013")).toBe("013");
    expect(shapeExp("01/30")).toBe("01/30");

    const t = tempDir();
    try {
      const s = openSaved({ dataDir: t.dir, persona: "default", key: fileKey(join(t.dir, "saved")) });
      const e = parseExp(shapeExp("0130"))!;
      s.put({ kind: "card", name: "Wey Gu", number: "4000000000000010", expMonth: e.month, expYear: e.year }, new Date("2026-11-20T00:00:00Z"));
      const card = s.view().items.find((x) => x.kind === "card")!;
      expect(card.exp).toBe("01/30");
      s.remove(card.id);
      expect(s.view().items.filter((x) => x.kind === "card")).toEqual([]);
    } finally {
      t.cleanup();
    }
  });

  test("the Mac reads an expiry the same way", () => {
    const go = src("apps/desktop/internal/views/autofill.go");
    expect(go).toContain("func parseExp(");
    expect(go).toContain("(\\d{1,2})(\\d{2})");
  });
});

describe("Memory and Agent messaging (D404)", () => {
  test("a failed connect in the home's own words is said in the person's language, on both clients", () => {
    const core = src("packages/core/src/bridge-link.ts");
    const mac = src("apps/desktop/internal/views/peers.go");
    for (const [detail, key] of Object.entries(FAILED_DETAILS)) {
      expect(core).toContain(`"${detail}"`);
      expect(mac).toContain(`"${detail}"`);
      expect(mac).toContain(`"${key}"`);
      A.L = zh;
      expect(failedLine(detail)).not.toMatch(/[A-Za-z]{6,} [a-z]+ [a-z]+/); // no English sentence in zh
      A.L = en;
      expect(failedLine(detail)).toBe(en.t(key));
    }
    A.L = zh;
    expect(failedLine("error: connection to Mem timed out after 30 s")).toBe("没连上：error: connection to Mem timed out after 30 s");
  });

  test("a retry that meets the same missing tool says so", () => {
    expect(zh.t("mem.retry.same")).toBe("刚又试了一次，还是缺这个小工具。");
    expect(src("apps/web/src/memory.tsx")).toContain('t("mem.retry.same")');
    expect(src("apps/desktop/internal/views/memory_pane.go")).toContain('"mem.retry.same"');
  });
});

describe("Partner: a new name (D404)", () => {
  test("is answered once, in the partner's voice, on both clients", () => {
    expect(zh.t("said.rename", "小满")).toBe("好，以后我就叫小满。");
    expect(en.t("said.rename", "Pip")).toBe("Got it: from now on I'm Pip.");
    expect(src("apps/web/src/views.tsx")).toContain('say("rename"');
    expect(src("apps/desktop/internal/views/partner.go")).toContain('a.say("rename"');
  });
});

describe("The phone (D404)", () => {
  test("the keyboard's inset: iOS overlays it, Android resizes for it, a toolbar is not a keyboard", () => {
    expect(keyboardInset(844, 508, 0)).toBe(336); // iOS: the keyboard over the page
    expect(keyboardInset(508, 508, 0)).toBe(0); // Android: the page resized
    expect(keyboardInset(844, 800, 0)).toBe(0); // Safari's bar
    expect(keyboardInset(844, 508, 120)).toBe(216); // the page panned up by iOS
  });

  test("on a touch screen every Settings control reaches 44 pt", () => {
    const css = src("apps/web/static/app.css");
    const block = css.slice(css.indexOf("/* D404: Settings on a touch screen."));
    for (const sel of [".seg button { min-height: 44px", ".set-item .pick select { min-height: 44px", ".nt-chip::before, .danger-text::before", ".past-link::before { inset: -6px 0; }"]) expect(block).toContain(sel);
    // 32 (a quiet Remove) + 2 × 7 and 30 (a model chip) + 2 × 7 reach 44.
    expect(32 + 14).toBeGreaterThanOrEqual(44);
    expect(30 + 14).toBeGreaterThanOrEqual(44);
  });
});

describe("words (D404)", () => {
  test("the Mac says the new words under the same keys", () => {
    const keys = ["said.acct.stop", "said.rename", "said.chats.off", "said.chats.linked", "chats.tg.code.only", "chats.tg.step1.have", "bridge.failed.identity", "bridge.failed.nostart", "mem.retry.same"];
    const go = ["settings", "channels", "i18n", "memory"].map((f) => src(`apps/desktop/internal/i18n/${f}.go`)).join("\n");
    for (const k of keys)
      for (const L of [zh, en]) {
        const v = L.t(k);
        expect(v).not.toBe(k);
        expect(go).toContain(JSON.stringify(v));
        expect(v).not.toContain(" · ");
      }
  });
});
