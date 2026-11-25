// D469: Settings in On hand's language. The list's brief says what needs you first (no agent to think
// with, a source that can't be reached, Mem's asks, a newer Mem plugin, updates), its lead counts them,
// and every pushed page's head is the partner saying that page's state. The Mac's
// settings_home_test.go checks the same.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

const agent = (harness: string, extra: Record<string, unknown> = {}) => ({ harness, installed: true, loggedIn: true, canBePartner: true, ...extra });
const home = (harnesses: unknown[]) => ({ id: "local", name: "Hetzner Server", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses, abilities: [] });
const oomol = (state = "ok") => ({
  id: "c1",
  name: "OOMOL",
  url: "",
  source: "oo",
  addedAt: "",
  via: "oo",
  state,
  look: {
    watching: true,
    apps: [
      { service: "gmail", title: "Gmail", account: "a@x.ai", watch: true },
      { service: "googlecalendar", title: "Google Calendar", account: "a@x.ai", watch: true },
      { service: "slack", title: "Slack", account: "Labs", watch: true },
      { service: "discord_bot", title: "Discord bot", account: "Community", watch: false },
    ],
  },
});

async function setup(lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  const h = await import("../src/settings-home.tsx");
  A.L = strings(lang);
  A.send = () => {};
  A.S.welcomed = true;
  A.S.personaName = "Ducter";
  A.settings = { name: "Ducter", memory: true } as any;
  A.agents = [agent("codex")] as any;
  A.devices = [home([agent("codex")])] as any;
  A.connections = [oomol()] as any;
  A.mem = undefined;
  A.bridge = undefined;
  A.updateAll = undefined;
  A.brainNow = { harness: "codex", model: "gpt-6.2-sol", models: [{ id: "gpt-6.2-sol", label: "GPT-6.2-Sol", default: true }] } as any;
  return { A, h };
}

describe("Settings' brief (D469)", () => {
  test("all well: the warm lead, the labelled lines, nothing needing you", async () => {
    const { h } = await setup();
    expect(h.setNeeds()).toEqual([]);
    expect(h.homeLead([])).toBe("都好好的，我在这儿。");
    const lines = h.homeLines();
    expect(lines.map((l) => l.key)).toEqual(["lives", "thinks", "reads", "mem"]);
    expect(lines[0]!.text).toBe("Hetzner Server，一直开着");
    expect(lines[1]!.text).toBe("Codex 的 GPT-6.2-Sol");
    expect(lines[2]!.text).toBe("Gmail、日历、Slack 等 4 个账号，发出去、花钱的先问你");
    expect(lines.map((l) => l.page)).toEqual(["devices", "partner", "accounts", "memory"]);
  });

  test("needs in the Mac's order, each to the page with its fix", async () => {
    const { A, h } = await setup();
    A.agents = [agent("codex", { loggedIn: false })] as any;
    A.connections = [oomol("unreachable")] as any;
    A.mem = { state: "connected", noted: [], check: { asks: [{ id: "a" }, { id: "b" }], rules: [] } } as any;
    A.devices = [home([agent("claude-code", { mem: { state: "update" } })])] as any;
    A.updateAll = { offer: [{ key: "x" }, { key: "y" }], notNow: [] } as any;
    const needs = h.setNeeds();
    expect(needs.map((n) => n.page)).toEqual(["partner", "accounts", "memory", "memory", "devices"]);
    expect(needs.map((n) => n.text)).toEqual([
      "我还没有能想事情的 AI agent。",
      "OOMOL 连不上了，它连着的账号我先看不到。",
      "Nowledge Mem 有 2 处想请你确认。",
      "Claude Code 里的 Nowledge Mem 有新版本。",
      "有 2 项更新可以装。",
    ]);
    expect(h.homeLead(needs)).toBe("还差一步，我就能想事情了。");
    A.agents = [agent("codex")] as any;
    expect(h.homeLead(h.setNeeds())).toBe("有 4 处要你看一眼。");
    expect(h.needsOf("memory").length).toBe(2);
  });

  test("Mem's asks need you only while memory is on; an update under way isn't asked", async () => {
    const { A, h } = await setup();
    A.mem = { state: "connected", noted: [], check: { asks: [{ id: "a" }], rules: [] } } as any;
    expect(h.setNeeds().map((n) => n.text)).toEqual(["Nowledge Mem 有一处想请你确认。"]);
    A.settings = { name: "Ducter", memory: false } as any;
    expect(h.setNeeds()).toEqual([]);
    A.updateAll = { offer: [{ key: "x" }], notNow: [], plan: { items: [], finishedAt: "" } } as any;
    expect(h.setNeeds()).toEqual([]);
  });

  test("each page's head says what is true there, in the partner's voice", async () => {
    const { A, h } = await setup();
    expect(h.paneSay("accounts")).toBe("我在留意 3 个账号：读和起草我自己来，发出去、花钱的先问你。");
    A.connections = [];
    expect(h.paneSay("accounts")).toBe("连上邮箱和日历，我就替你留意；发出去、花钱的都先问你。");
    expect(h.paneSay("devices")).toBe("我在 Hetzner Server 上运行，一直开着；这个窗口是你看我的地方。");
    expect(h.paneSay("memory")).toBe("我还记不住你：接上 Nowledge Mem，你说过的偏好、定下的事，我都记得。");
    A.mem = { state: "connected", noted: [] } as any;
    expect(h.paneSay("memory")).toBe("你说过的偏好、定下的事，我都记在 Nowledge Mem 里；随时能看，也能让我忘掉。");
    expect(h.paneSay("partner")).toBe("");
    A.L = strings("en");
    // D475: the state, not the page's purpose (notifications off here).
    expect(h.paneSay("notify")).toBe("Notifications are off: what needs you waits in On hand.");
  });

  test("the computers say what each is to the partner", async () => {
    const { A, h } = await setup("en");
    expect(h.placeRole({ id: "local", home: true, state: "awake", kind: "server", harnesses: [] } as any)).toBe("I run here");
    expect(h.placeRole({ id: "m", home: false, state: "awake", kind: "laptop", harnesses: [agent("codex")] } as any)).toBe("Does tasks for you");
    expect(h.placeRole({ id: "m", home: false, state: "unreachable", kind: "laptop", harnesses: [] } as any)).toBe("Out of reach now");
    void A;
  });

  test("the list's head is the brief and the map; the panes' own ledes are the head's now", () => {
    const v = src("views.tsx");
    expect(v).toContain("<SetBrief go={go} />");
    expect(v).toContain("<PlacesMap go={go} />");
    expect(v).not.toContain('class="set-hero"');
    for (const f of ["todos.tsx", "channels.tsx", "autofill.tsx"]) expect(src(f)).not.toContain('class="af-lede"');
    expect(src("memory.tsx")).not.toContain('t("mem.first.title"');
  });
});

test("the Mac says the same words under the same keys (D469)", async () => {
  const { settingsHome } = await import("../src/i18n-settings.ts");
  // Every table of the Mac's (partner.say may live beside the Partner page's other words).
  const dir = join(import.meta.dir, "../../desktop/internal/i18n");
  const mac = readdirSync(dir)
    .filter((f) => f.endsWith(".go") && !f.endsWith("_test.go"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  for (const lang of ["zh", "en"] as const)
    for (const [k, v] of Object.entries(settingsHome[lang])) {
      if (k === "say.phone" || k === "say.phone.auto") continue; // the web's own page (这台手机 / 这台电脑)
      expect(mac).toContain(`"${k}":`);
      expect(mac).toContain(JSON.stringify(v));
    }
});

describe("Settings' Overview, round 2 (D469)", () => {
  // These tests set the app's shared state; give it back so other files read their own.
  const keys = ["reach", "send", "devices", "connections", "updateAll", "settings", "mem", "bridge", "agents", "brainNow", "L"] as const;
  let kept: Record<string, unknown> = {};
  let tasks: unknown;
  beforeAll(async () => {
    const { A } = await import("../src/app.ts");
    kept = Object.fromEntries(keys.map((k) => [k, (A as any)[k]]));
    tasks = A.S.tasks;
    (A.S as any).tasks = new Map(); // tasks other files left at work would count on these computers
  });
  afterAll(async () => {
    const { A } = await import("../src/app.ts");
    for (const k of keys) (A as any)[k] = kept[k];
    (A.S as any).tasks = tasks;
  });
  test("a plugin behind is fixed in place with the page's own ask; Update all is Devices' one tap", async () => {
    const { A, h } = await setup();
    A.devices = [home([agent("claude-code", { mem: { state: "update", version: "0.7.34", available: "0.7.37" } })])] as any;
    A.updateAll = { offer: [{ key: "x" }], notNow: [] } as any;
    const sent: any[] = [];
    A.send = (f: any) => void sent.push(f);
    const needs = h.setNeeds();
    const memp = needs.find((n) => n.key.startsWith("memp:"))!;
    expect(memp.go).toBe("更新");
    expect(memp.fix?.kind).toBe("memp");
    const upd = needs.find((n) => n.key === "update")!;
    expect(upd.fix).toEqual({ kind: "update", label: upd.go });
    // The tap only opens the ask; the frame goes when the ask's own OK is pressed (MemAsk, as the pane).
    const s = src("settings-home.tsx");
    const at = s.indexOf("const press = () => {");
    const press = s.slice(at, s.indexOf("return (", at));
    expect(press).toContain("setAsking(true)");
    expect(press).not.toContain("installMem");
    expect(src("mem-plugin.tsx")).toMatch(/label=\{w\.ok\}[^\n]*A\.installMem/);
    expect(sent).toEqual([]);
    // A computer that is asleep keeps the way to the page.
    A.devices = [{ ...home([agent("claude-code", { mem: { state: "update" } })]), state: "asleep" }] as any;
    const away = h.setNeeds().find((n) => n.key.startsWith("memp:"))!;
    expect(away.fix).toBeUndefined();
    expect(away.go).toBe("去更新");
  });

  test("D552: two computers' notices say which; a tap reads 更新中 at once, sends once; it clears when the check says updated", async () => {
    const { A, h } = await setup();
    const upd = { state: "update", version: "0.7.34", available: "0.7.38" };
    A.devices = [home([agent("claude-code", { mem: upd })]), { id: "w1", name: "haswell", kind: "server", home: false, state: "awake", harnesses: [agent("claude-code", { mem: upd })], abilities: [] }] as any;
    A.updateAll = undefined as any;
    const sent: any[] = [];
    A.send = (f: any) => void sent.push(f);
    const texts = h.setNeeds().filter((n) => n.key.startsWith("memp:")).map((n) => n.text);
    expect(texts).toEqual(["Hetzner Server 上 Claude Code 里的 Nowledge Mem 有新版本。", "haswell 上 Claude Code 里的 Nowledge Mem 有新版本。"]);
    // Four taps in a row: one frame, and the fix is the busy button from the first.
    for (let i = 0; i < 4; i++) A.installMem("w1", "claude-code");
    expect(sent.filter((f) => f.t === "mem_plugin_install")).toHaveLength(1);
    const busy = h.setNeeds().find((n) => n.key === "memp:w1:claude-code")!;
    expect(busy).toMatchObject({ go: "更新中…", busy: true });
    A.memSent.delete("w1:claude-code");
    // Updated: the notice goes; the row on Settings › 记忆 says the version it reached.
    A.devices = [home([agent("claude-code", { mem: { state: "installed", version: "0.7.38", updated: true } })])] as any;
    expect(h.setNeeds().filter((n) => n.key.startsWith("memp:"))).toEqual([]);
    const { memPluginRows } = await import("../src/mem-plugin.tsx");
    expect(memPluginRows(A.devices).map(({ h }) => h.mem?.version)).toEqual(["0.7.38"]);
  });

  test("the whole world: computers with what they do now, the handhelds, the accounts at their place", async () => {
    const { A, h } = await setup();
    A.devices = [home([agent("codex")]), { id: "w1", name: "haswell", kind: "server", home: false, state: "asleep", harnesses: [agent("codex")], abilities: [] }] as any;
    A.reach = {
      clients: [
        { id: "c1", name: "iPhone", platform: "ios-app", connected: true },
        { id: "c2", name: "Pixel Fold", platform: "android-app", connected: false, lastSeen: new Date(Date.now() - 2 * 3600_000).toISOString(), handset: { added: true, able: true, linked: false } },
        { id: "c3", name: "haswell", platform: "linux-x64", connected: true, form: "cli", computer: "haswell" },
      ],
    } as any;
    const ps = h.mapPlaces();
    expect(ps.map((p) => p.name)).toEqual(["Hetzner Server", "haswell", "iPhone", "Pixel Fold"]);
    expect(ps.map((p) => p.role)).toEqual(["我在这台上运行", "帮你做事", "随时找我", "借给任务用"]);
    expect(ps.map((p) => p.now)).toEqual(["", "睡着了", "现在连着", "2 小时前来过"]);
    A.connections = [oomol(), { id: "t", name: "Tuwa", source: "mcp", state: "ok", phone: { provider: "Tuwa" } }] as any;
    const ac = h.accountPlaces();
    expect(ac.map((a) => [a.name, a.calls, a.marks])).toEqual([
      ["oo 里的账号", false, ["gmail", "googlecalendar", "slack", "discord"]],
      ["Tuwa", true, []],
    ]);
    A.connections = [oomol("unreachable")] as any;
    expect(h.accountPlaces()[0]!.down).toBe("连不上");
    // No account marks painted on the home any more: they live on their source.
    expect(src("settings-home.tsx")).not.toMatch(/p\.home[^\n]*marks\.slice/);
  });

  test("quiet hours are half-hour pills, 24-hour; the partner's page head is in its own voice", async () => {
    expect(src("views.tsx")).not.toContain('type="time" aria-label={t("partner.quiet")}');
    // D468's pills (kept over D469's copy): every half hour, 24-hour; an odd time set elsewhere stays listed.
    const { halfHours } = await import("../src/views.tsx");
    expect(halfHours("23:00")).toHaveLength(48);
    expect(halfHours("22:15").map((o) => o.v)).toContain("22:15");
    expect(strings("zh").t("partner.say", "Hetzner Server", "Codex 的 GPT-6.2-Sol")).toBe("我在 Hetzner Server 上运行，用 Codex 的 GPT-6.2-Sol 想事情。");
    expect(strings("en").t("partner.say", "hel", "GPT-6.2-Sol in Codex")).toBe("I run on hel and think with GPT-6.2-Sol in Codex.");
  });
});
