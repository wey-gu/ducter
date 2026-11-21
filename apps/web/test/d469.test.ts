// D469: Settings in On hand's language. The list's brief says what needs you first (no agent to think
// with, a source that can't be reached, Mem's asks, a newer Mem plugin, updates), its lead counts them,
// and every pushed page's head is the partner saying that page's state. The Mac's
// settings_home_test.go checks the same.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
    expect(h.paneSay("notify")).toBe("How I reach you when something needs you, and when I leave you be.");
  });

  test("the computers say what each is to the partner", async () => {
    const { A, h } = await setup("en");
    expect(h.placeRole({ id: "local", home: true, state: "awake", kind: "server", harnesses: [] } as any)).toBe("Ducter runs here");
    expect(h.placeRole({ id: "m", home: false, state: "awake", kind: "laptop", harnesses: [agent("codex")] } as any)).toBe("Does tasks for Ducter");
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
  const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/settings_home.go"), "utf8");
  for (const lang of ["zh", "en"] as const)
    for (const [k, v] of Object.entries(settingsHome[lang])) {
      if (k === "say.phone") continue; // the web's own page (这台手机 / 这台电脑)
      expect(mac).toContain(`"${k}":`);
      expect(mac).toContain(JSON.stringify(v));
    }
});
