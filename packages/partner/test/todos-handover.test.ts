// D385: the partner's todos tool hands several over (design/handover.md §5): do=find pulls a subject
// out as a set card and returns its counts (never a list to recite); do=hand set= hands the set
// over with the person's words as its note, adds what they said ("#405 也加上"), and a later word
// about the same set ("这个也加进去") joins its group. Fake gh, fake model: never the real GitHub.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { startCore } from "../../core/src/core.ts";
import { fakeGh } from "../../core/test/fake-gh-issues.ts";
import { createPartner } from "../src/partner.ts";
import { fakeRunner } from "./fakes.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const TITLES: [number, string][] = [
  [412, "Distillation: fall back to a smaller result instead of failing"],
  [398, "Automatic distillation: the error says nothing useful"],
  [405, "Retry a failed automatic distillation once?"],
  [366, "长对话的自动提炼总是失败"],
  [12, "Login redirect drops the return path"],
];

async function boot() {
  const d = mkdtempSync(join(tmpdir(), "ducter-todos-ho-"));
  const gh = fakeGh(TITLES.map(([number, title]) => ({ repo: "acme/mem", number, title })));
  const ask = async (prompt: string) => {
    if (prompt.includes("<logins>")) return { text: "{}", tokens: 1 };
    const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string }[];
    if (prompt.includes("<about>")) return { text: JSON.stringify({ found: rows.filter((r) => /istill|提炼/.test(r.title)).map((r) => ({ id: r.id, sure: "high" })) }), tokens: 1 };
    return { text: JSON.stringify(rows.map((r) => (/\?$/.test(r.title) ? { id: r.id, group: "decide", why: "要你定", ask: "重试吗？", pick: "hand", subject: "记忆提炼" } : /长对话/.test(r.title) ? { id: r.id, group: "later", why: "改动大", subject: "记忆提炼" } : { id: r.id, group: "do", why: "说得清楚", size: "small", subject: /istill/.test(r.title) ? "记忆提炼" : "登录" }))), tokens: 1 };
  };
  const core = startCore({ dataDir: d, port: 0, push: false, platform: "darwin", taskSources: { ghRun: gh.run, ghEnv: {}, home: join(d, "no-home"), pollMs: 3_600_000, ask }, deviceProbes: { harnesses: async () => [{ harness: "claude-code", loggedIn: true, installed: true }] as never } });
  const fr = fakeRunner(() => {});
  core.setRunner(fr.runner as never);
  const p = createPartner(core as never, fr.runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
  stops.push(() => rmSync(d, { recursive: true, force: true }), () => core.stop(), () => p.close());
  expect((await core.taskSources.add("github")).ok).toBe(true);
  await core.taskSources.look();
  await core.taskSources.pile.sort("daily");
  const call = (args: Record<string, unknown>) => core.mcp.call({ role: "partner" } as never, "todos", args) as Promise<Record<string, unknown>>;
  return { core, call };
}

test("do=find: a set card in the conversation, its counts back (do ticked, the decide one named), nothing started", async () => {
  const { core, call } = await boot();
  const r = await call({ do: "find", query: "memory distill" });
  // D428: the subject is their words; how they were read comes back too.
  expect(r).toMatchObject({ ok: true, found: 4, subject: "memory distill", readAs: ["about memory distill"], ticked: 2, groups: { do: 2, decide: 1, later: 1, close: 0 }, decide: ["#405"] });
  expect(String(r.set)).toMatch(/^set_/);
  const sets = core.log.read({ stream: "channel", kinds: ["todo_set"], limit: 5 });
  expect(sets.length).toBe(1);
  expect(core.tasks.list().length).toBe(0);
});

test("do=hand set= with #405 and the note: one group, plan first, the note kept; then 这个也加进去 joins that group", async () => {
  const { core, call } = await boot();
  const f = await call({ do: "find", query: "memory distill" });
  const r = await call({ do: "hand", set: f.set, note: "#405 也加上。先别动数据库迁移，验证都去 haswell 上跑。" });
  expect(r).toMatchObject({ ok: true, handed: 3, shape: "plan", group: "memory distill" });
  // Nothing was said before the call: code says the plan-first line, before any card the hand-over raises.
  const after = core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 20 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(after.filter((t) => t === "好，我先看一遍，出个方案给你，你点头再做。").length).toBe(1);
  await core.taskSources.handover?.idle(); // D638: the group fills after Go's reply
  const g = core.taskGroups.list().find((x) => x.name === "memory distill")!;
  expect(g.hand!.items.map((i) => i.ref).sort()).toEqual(["acme/mem#398", "acme/mem#405", "acme/mem#412"]);
  expect(g.hand!.note).toBe("#405 也加上。先别动数据库迁移，验证都去 haswell 上跑。");
  // A later word about the same set: its group, not a new task.
  const add = await call({ do: "hand", set: f.set, refs: ["acme/mem#366"] });
  expect(add).toMatchObject({ ok: true, handed: 1, group: "memory distill" });
  expect(core.taskGroups.get(g.id)!.hand!.items.length).toBe(4);
  // By the group's name too.
  const set = core.log.read({ stream: "channel", kinds: ["todo_set"], limit: 5 }).at(-1)!.body as Bodies["todo_set"];
  expect(set.groupId).toBe(g.id);
  expect((await call({ do: "hand", group: "没有这组", refs: ["acme/mem#12"] })).ok).toBe(false);
});
