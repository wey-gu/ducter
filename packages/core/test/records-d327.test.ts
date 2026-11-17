// D327: the person's own agents' records, read only as far as the moment needs. Synthetic sessions
// in a scratch home (never a real person's): keys hidden before anything sees a title, another
// account's files never read, a folder left out of both readers, the first words' answer to a look
// forgotten by folder, Past tasks empty with looking off, and the file-times-only check.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { HIDDEN } from "@ducter/protocol/src/redact.ts";
import { startCore } from "../src/core.ts";
import { firstWords, forgetFirstWords, lookWords, recentFolders } from "../src/first-words.ts";
import { createLocalAgents } from "../src/local-agents/index.ts";
import { createOutside } from "../src/outside.ts";
import { writeSession } from "./fixtures-agents.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const NOW = Date.now();
const ADA = "/Users/ada";
const ago = (h: number) => new Date(NOW - h * 3600_000);

function scratch() {
  const t = tempDir();
  stops.push(t.cleanup);
  const home = join(t.dir, "home");
  const data = join(t.dir, "data");
  const hawdb = "/Users/ada/src/hawdb";
  const billing = "/Users/ada/work/billing-api";
  mkdirSync(data, { recursive: true });
  writeSession(home, { agent: "claude-code", id: "aaaaaaaa-0000-4000-8000-000000000001", cwd: hawdb, title: "Raft snapshot stuck in apply", turns: [["why does the snapshot hang", "the apply loop waits on a lock"]], startedAt: ago(30), updatedAt: ago(26) });
  // A key pasted into the very first words: the session's title is those words.
  writeSession(home, { agent: "codex", id: "bbbbbbbb-0000-4000-8000-000000000002", cwd: billing, turns: [["use token=ghp_1234567890abcdefABCDEF1234 to read the billing repo", "Reading it."]], startedAt: ago(80), updatedAt: ago(72) });
  return { t, home, data, hawdb, billing };
}

test("a key in a prompt is hidden before any title is made, and a title that had one is never offered", () => {
  const { home, data, billing } = scratch();
  const reader = createLocalAgents({ home, env: {} });
  const s = reader.sessions().find((x) => x.cwd === billing)!;
  expect(s.firstPrompt).toContain(HIDDEN);
  expect(s.firstPrompt).not.toContain("1234567890abcdef");
  const projects = recentFolders(reader, { exclude: [data], home: ADA });
  const out = lookWords({ lang: "en", now: new Date(NOW), projects, agents: ["claude-code", "codex"], computer: "Ada’s MacBook Air", home: ADA });
  const billingOffer = out.first.starts.find((x) => x.path === "~/work/billing-api")!;
  // The folder alone: the bare offer, no words from the prompt.
  expect(billingOffer.words).toMatch(/you used Codex in billing-api/);
  expect(billingOffer.words + billingOffer.draft).not.toContain(HIDDEN);
  expect(out.text).toBe("I had a look at what your Claude Code and Codex worked on lately on Ada’s MacBook Air. Want to pick one of these up?");
  expect(out.first).toMatchObject({ look: true, computer: "Ada’s MacBook Air", looked: ["claude-code", "codex"] });
});

test("another account's files on the same computer are never read", () => {
  const { home } = scratch();
  expect(createLocalAgents({ home, env: {}, uid: 1 }).sessions()).toEqual([]);
  expect(createLocalAgents({ home, env: {} }).sessions().length).toBe(2);
});

test("whether there is anything to offer is told by file times alone; Ducter's own and old sessions don't count", () => {
  const { home, data } = scratch();
  writeSession(home, { agent: "pi", id: "cccccccc-0000-4000-8000-000000000003", cwd: join(data, "partner"), turns: [["You are Ducter", "ok"]], startedAt: ago(2), updatedAt: ago(1) });
  const reader = createLocalAgents({ home, env: {} });
  expect(reader.active({ since: NOW - 14 * 86_400_000, skip: [data] })).toEqual(["claude-code", "codex"]);
  expect(reader.active({ since: NOW - 3600_000, skip: [data] })).toEqual([]);
});

test("the first words offer to look instead of looking, and say nothing of the records", () => {
  const out = firstWords({ name: "小满", lang: "zh", now: new Date(NOW), projects: [], everyday: [{ zh: "帮我写一封请假邮件", en: "x" }, { zh: "查查明天的天气", en: "y" }, { zh: "c", en: "z" }], canLook: ["claude-code"] });
  expect(out.first.starts.map((s) => s.from)).toEqual(["look", "everyday", "everyday"]);
  expect(out.first.starts[0]!.words).toBe("接着我最近在 Claude Code 里做的事");
  expect(out.first.looked).toBeUndefined();
  expect(out.text).toContain("有什么想做的");
});

test("a folder left out goes from Past tasks and the offers, and its offer is forgotten; the rest stay", () => {
  const { home, data, hawdb, billing } = scratch();
  const reader = createLocalAgents({ home, env: {} });
  const log = { read: () => [], subscribe: () => () => {} } as never;
  const tasks = { list: () => [] } as never;
  const o = createOutside({ reader, dataDir: data, log, tasks, home: ADA });
  expect(o.list({}).items.map((x) => x.project).sort()).toEqual(["billing-api", "hawdb"]);
  o.hideFolder("~/work", true);
  expect(o.hiddenFolders()).toEqual(["/Users/ada/work"]);
  expect(o.leftOut(billing)).toBe(true);
  expect(o.leftOut(hawdb)).toBe(false);
  expect(o.list({}).items.map((x) => x.project)).toEqual(["hawdb"]);
  expect(JSON.parse(readFileSync(join(data, "outside.json"), "utf8")).folders).toEqual(["/Users/ada/work"]);
  expect(recentFolders(reader, { exclude: [data], home: ADA, leftOut: o.leftOut }).map((f) => f.name)).toEqual(["hawdb"]);
  // Never the whole home folder: that is 别再看了.
  o.hideFolder("~", true);
  expect(o.hiddenFolders().length).toBe(1);
  // The answer already given forgets only that folder's offer.
  const said = lookWords({ lang: "zh", now: new Date(NOW), projects: recentFolders(reader, { exclude: [data], home: ADA }), agents: ["claude-code", "codex"], home: ADA });
  const next = forgetFirstWords(said, { folder: "~/work", home: ADA })!;
  expect(next.first.starts.map((s) => s.path)).toEqual(["~/src/hawdb"]);
  expect(next.first.forgot).toBeUndefined();
  expect(next.text).toBe(said.text);
  // Both folders out: the answer says it forgot.
  const none = forgetFirstWords(next, { folder: "~/src", home: ADA })!;
  expect(none.first.starts).toEqual([]);
  expect(none.text).toBe("从 Claude Code 和 Codex 的记录里看到的几件事，按你说的忘掉了。");
  // Looking off: Past tasks lists nothing at all.
  const off = createOutside({ reader, dataDir: data, log, tasks, home: ADA, looks: () => false });
  expect(off.list({})).toEqual({ items: [], sources: [] });
});

test("over the socket: 这个文件夹别看了 is kept, every first screen names it, and 再显示 brings it back", async () => {
  const { home, data } = scratch();
  const core = startCore({ dataDir: data, port: 0, batchMs: 5, localAgents: createLocalAgents({ home, env: {} }), firstWords: { home, env: {} }, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" } });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const open = async (then?: (ws: WebSocket) => void) => {
    const frames: ServerFrame[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    ws.send(JSON.stringify({ t: "hello", locale: "en", client: "web" }));
    for (let i = 0; i < 200 && !frames.some((f) => f.t === "first_screen"); i++) await Bun.sleep(10);
    then?.(ws);
    await Bun.sleep(80);
    ws.close();
    return frames.filter((f) => f.t === "first_screen") as Extract<ServerFrame, { t: "first_screen" }>[];
  };
  const first = await open();
  expect(first.at(-1)!.first.computer).toBeTruthy();
  const hid = await open((ws) => ws.send(JSON.stringify({ t: "outside_folder", path: "~/work/billing-api", hidden: true })));
  expect(hid.at(-1)!.first.outsideFolders).toEqual(["~/work/billing-api"]);
  const back = await open((ws) => ws.send(JSON.stringify({ t: "outside_folder", path: "~/work/billing-api", hidden: false })));
  expect(back.at(-1)!.first.outsideFolders).toBeUndefined();
});
