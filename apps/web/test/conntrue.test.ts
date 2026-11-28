// D666 (research/247 Brief D): a connection says what is true. Table-driven checks for the
// three faults the brief names: a calling connection that is not ok is not ready (no today count,
// one action), every linked chat kind is named from one table (Feishu / Lark included), and a
// source that cannot be read has Try again while a removal is a line under the sources, never a
// toast. Source checks as settings-polish.test.ts does, plus the pure tables at runtime.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const phone = src("../src/phone.tsx");
const imports = src("../src/imports.tsx");
const channels = src("../src/channels.tsx");

async function setup(lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  A.L = strings(lang);
  A.send = () => {};
  return A;
}

describe("one readiness table for calls", () => {
  test("every ConnectionView.state: only ok can call; unauthorized asks to sign in; the rest asks again", async () => {
    const { phoneReady } = await import("../src/phone.tsx");
    const table = [
      ["ok", "ready"],
      ["unauthorized", "signed_out"],
      ["unreachable", "down"],
      ["unknown", "checking"],
    ] as const;
    for (const [state, want] of table) expect(phoneReady(state), state).toBe(want);
    // Any state a newer home adds is not a ready card either.
    expect(phoneReady("maintenance" as never)).toBe("down");
  });

  test("the card uses the table: today's count only when ready, one action otherwise", () => {
    expect(phone).toContain("const ready = phoneReady(c.state);");
    expect(phone).toContain('{ready === "ready" && <span class="g-state">{today}</span>}');
    expect(phone).toContain('{ready === "signed_out" && <Btn kind="secondary" size="sm" label={t("call.card.signin")}');
    expect(phone).toContain('{ready === "down" && <Btn kind="secondary" size="sm" label={t("acct.retry")}');
    expect(phone).toContain('t("call.card.down", p.provider)');
    // The old single-state test is gone: no future state can fall into the ready branch.
    expect(phone).not.toContain('const out = c.state === "unauthorized"');
  });

  test("the words are in both languages", () => {
    const words = src("../src/i18n-phone.ts");
    expect(words).toContain('"call.card.down": "现在连不上 %s"');
    expect(words).toContain('"call.card.down": "Can\'t reach %s right now"');
  });
});

describe("one table of chat apps", () => {
  test("every kind is named; Feishu / Lark is a kind, not a special case in a switch", async () => {
    await setup("zh");
    const { chatName, linkedChatNames } = await import("../src/channels.tsx");
    for (const kind of ["wechat", "telegram", "slack", "feishu"] as const) expect(chatName(kind)).not.toBe("");
    expect(chatName("feishu")).toContain("飞书");
    expect(chatName("unknown" as never)).toBe("");
    const linked = linkedChatNames([
      { kind: "telegram", state: "linked" },
      { kind: "feishu", state: "linked" },
      { kind: "slack", state: "off" },
    ] as never);
    expect(linked).toEqual(["Telegram", "飞书 / Lark"]);
  });

  test("the Mac reads the same single table instead of its own switch", () => {
    const mac = src("../../desktop/internal/views/settings_home.go");
    expect(mac).toContain("if name := a.chatName(ch.Kind); name != \"\"");
    expect(mac).not.toMatch(/case "feishu":\s*\n\s*names = append\(names, a\.L\.T\("chats\.feishu"\)\)/);
  });
});

describe("Import says it where it happened", () => {
  test("a removal is a line under the sources; no toast", async () => {
    expect(imports).not.toContain("A.toast(");
    expect(imports).toContain('IM.notice = t("imports.removed");');
    expect(imports).toContain('{IM.notice && (');
    expect(imports).toContain('class="small muted import-notice" role="status"');
    const A = await setup("zh");
    const { IM } = await import("../src/imports.tsx");
    await Promise.resolve();
    A.onImportsFrame?.({ t: "import_answer", id: "lody", op: "remove", ok: true, removed: 2 } as never);
    expect(IM.notice).toBe("删掉了。它带进来的对话藏起来了。");
    // A newer run is newer than the removal: its line no longer stands.
    A.onImportsFrame?.({ t: "import_answer", id: "lody", op: "run", ok: true, threads: 1 } as never);
    expect(IM.notice).toBeUndefined();
  });

  test("every source that is not ready has Try again, not only a failed read", () => {
    expect(imports).toContain('{r.state !== "ready" && r.state !== "looking" && <Btn kind="secondary" size="sm" label={t("imports.retry")}');
  });

  test("the Mac's reading and retry are the same table", () => {
    const mac = src("../../desktop/internal/views/imports.go");
    expect(mac).toContain("} else if s.State != \"looking\" {");
    expect(mac).not.toContain('} else if s.State == "failed" {');
    expect(src("../../desktop/internal/views/settings_home.go")).toMatch(/case TabImport:[\s\S]{0,160}return a\.importsSay\(\)/);
  });

  test("the line's own style is on the sources' edge", () => {
    expect(css).toContain(".import-notice { margin: 0 var(--s5) var(--s4);");
  });
});

describe("a thumb reaches the quiet links (44 at 390)", () => {
  test("用地址和密钥添加, 怎么连 and the device rename get their 44 box under coarse", () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?\.accounts > \.qlink,[\s\S]*?\.acct-form > \.qlink \{ display: inline-flex; align-items: center; min-height: 44px; \}/);
    expect(css).toMatch(/\.dc-name \.dev-name \{ display: inline-flex; align-items: center; justify-content: center; min-height: 44px; \}/);
  });
});
