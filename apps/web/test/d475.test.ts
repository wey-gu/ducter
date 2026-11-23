// D475: Settings, pane by pane. Every pushed page's head says what is true there now (never what the
// page is for); a source that can't be reached says so once, with Try again, its rows quiet; the
// Notifications preview follows 发现了就说; the words are the Mac's (settings_d475.go), key for key.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

async function setup(lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  const h = await import("../src/settings-home.tsx");
  const todos = await import("../src/todos.tsx");
  A.L = strings(lang);
  A.send = () => {};
  A.S.welcomed = true;
  A.S.personaName = "Ducter";
  A.settings = { name: "Ducter", memory: true, notify: true, quiet: { start: "23:00", end: "08:00" }, defaultAfterMin: 30 } as any;
  A.connections = [];
  A.devices = [];
  A.saved = undefined;
  todos.TS.frame = undefined;
  return { A, h, todos };
}

describe("every head says the state (D475)", () => {
  test("Notifications: on with quiet hours, on, off", async () => {
    const { A, h } = await setup();
    expect(h.paneSay("notify")).toBe("有事要你定，我就发通知；免打扰的时段里不吵你。");
    A.settings = { ...A.settings!, quiet: undefined } as any;
    expect(h.paneSay("notify")).toBe("有事要你定，我就发通知给你。");
    A.settings = { ...A.settings!, notify: false } as any;
    expect(h.paneSay("notify")).toBe("通知关着：要你定的事，我放在「手头的事」里等你。");
  });

  test("To-do sources: what is open where, only once it was read", async () => {
    const { h, todos } = await setup();
    expect(h.paneSay("todos")).toBe(strings("zh").t("say.todos"));
    todos.TS.frame = {
      t: "sources",
      sources: [
        { id: "s1", kind: "github", state: "ok", checkedAt: "2026-11-22T08:00:00Z", open: 558 },
        { id: "s2", kind: "obsidian", state: "ok", checkedAt: "2026-11-22T08:00:00Z", open: 3 },
        { id: "s3", kind: "obsidian", state: "ok", open: 9 }, // never read: never counted
      ],
    } as any;
    expect(h.paneSay("todos")).toBe("GitHub 有 558 个没做完，Obsidian 有 3 个没做完；哪个想交给我，说一声就行。");
  });

  test("Passwords & cards: what it keeps, counted by kind, one and many", async () => {
    const { A, h } = await setup("en");
    A.saved = { t: "saved", items: [{ kind: "signin" }, { kind: "signin" }, { kind: "card" }], details: [], uses: [], keys: [{ id: "k" }], keptIn: "file" } as any;
    expect(h.paneSay("autofill")).toBe("I keep 2 sign-ins, 1 card, 1 key locked for you; I fill them without seeing them, and every payment asks you first.");
  });

  test("Accounts: a source down is said by its need alone, never a count", async () => {
    const { A, h } = await setup();
    A.connections = [{ id: "c1", name: "OOMOL", source: "oomol", state: "unreachable", look: { watching: true, apps: [{ service: "gmail", title: "Gmail", account: "a@x.ai", watch: true }] } }] as any;
    expect(h.paneSay("accounts")).toBe("");
    expect(h.needsOf("accounts").map((n) => n.text)).toEqual(["OOMOL 连不上了，它连着的账号我先看不到。"]);
  });
});

describe("a source down says so once, with its fix (D475)", () => {
  const acc = src("accounts.tsx");
  test("its first row carries Try again, which asks the home to read its connections again", () => {
    expect(acc).toContain('c.state === "unreachable" && <Btn kind="secondary" size="sm" label={t("acct.retry")} about={name} onClick={() => (A.send({ t: "connections" }),');
    expect(acc).toContain('say(`src:${c.id}`, t("said.retry", name))');
  });
  test("its rows are quiet and their marks faded", () => {
    expect(acc).toContain('w.excluded ? t("svc.excluded") : srcDown ? ""');
    expect(acc).toContain("faded={srcDown}");
  });
});

describe("Notifications' preview follows 发现了就说 (D475)", () => {
  test("a second card for the urgent one or the morning's note; none, and a line, for off", () => {
    const d = src("settings-delight.tsx");
    expect(d).toContain('find && find !== "off"');
    expect(d).toContain("t(`notify.pv.find.${find}`)");
    expect(d).toContain('if (find === "off") under += t("notify.pv.join") + t("notify.pv.find.off")');
  });
  test("发现了就说 in Settings is a row with its title, as on the Mac", () => {
    expect(src("accounts.tsx")).toMatch(/class="chat-row pro-row"[\s\S]{0,80}<b>\{t\("proactive\.title"\)\}<\/b>/);
  });
});

describe("the phone and the tiles (D475)", () => {
  test("a choice under its words takes the card's whole width on a phone", () => {
    expect(css).toMatch(/@media \(max-width: 520px\) \{\s*\.chat-row:not\(\.tiled\) > \.seg,\s*\.set-page\.pushed \.set-card > div\.chat-row:not\(\.tiled\) > \.seg \{ flex: 1 1 calc\(100% \+ var\(--chat-col\)\); margin-left: calc\(-1 \* var\(--chat-col\)\); \}/);
  });
  test("a saved card keeps the 40 tile column", () => {
    expect(css).toContain(".set-row .af-card { width: 40px; height: 28px;");
  });
});

// The words equal the Mac's, key for key: words.test.ts checks every mirrored table (D488).
