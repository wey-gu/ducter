// D655 (research/246 §3.10): a demo core for Settings › 导入 / Import's screenshots. A fake
// `lody` (the verified CLI shapes, never the real binary): one workspace, twelve conversations,
// 4,000-message history not needed here. The pane shows what it sees; the consent card, a real
// run and removal are clicked in the browser.
//   DUCTER_PORT=7531 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-import2.ts
// Then http://127.0.0.1:7531/app#settings=import.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || `${process.env.TMPDIR ?? "/tmp"}/ducter-demo-import2-${Date.now()}`;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const at = (days: number) => iso(now - days * 86_400_000);

const sessions = [
  { id: "S-8f2a", title: w("WAL 尾部损坏时怎么回放", "Replaying the WAL with a torn tail"), repoFullName: "acme/hawdb", createdAt: at(4), lastMessageAt: now - 2 * 86_400_000 },
  { id: "S-91c0", title: w("京都酒店和机票一起看", "Kyoto hotel and flights together"), repoFullName: "acme/travel", createdAt: at(7), lastMessageAt: now - 4 * 86_400_000 },
  { id: "S-77aa", title: w("试一下旧的 parser", "Try the old parser"), repoFullName: "acme/old-thing", createdAt: at(9), lastMessageAt: now - 9 * 86_400_000 },
  { id: "S-52bd", title: w("周末去哪儿", "Where to go this weekend"), createdAt: at(12), lastMessageAt: now - 12 * 86_400_000 },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `S-9${String(i).padStart(3, "0")}`,
    title: w(`第 ${i + 5} 段旧对话`, `Older conversation ${i + 5}`),
    repoFullName: i % 2 ? "acme/hawdb" : "acme/site",
    createdAt: at(20 + i),
    lastMessageAt: now - (20 + i) * 86_400_000,
  })),
];
const history = (id: string) => {
  const s = sessions.find((x) => x.id === id)!;
  return [
    { id: `${id}-m1`, role: "user", timestamp: s.createdAt, items: [{ type: "text", text: w("先看看现在是什么样，别改。", "Look at how it is now first; don't change anything.") }] },
    { id: `${id}-m2`, role: "assistant", timestamp: iso(Date.parse(s.createdAt) + 3_600_000), items: [{ type: "text", text: w("看了，问题在时序上；我先加一个能重复出来的测试。", "Looked. It's a timing problem; I'll add a test that reproduces it first.") }], finished: true },
    { id: `${id}-m3`, role: "user", timestamp: iso(Date.parse(s.createdAt) + 7_200_000), items: [{ type: "text", text: w("好，就照这个来。", "Good, go with that.") }, { type: "image" }] },
  ];
};

const run = async (args: string[]) => {
  const out = (o: unknown) => ({ code: 0, stdout: `${JSON.stringify(o)}\n`, stderr: "" });
  if (args[0] === "workspace" && args[1] === "list") return out({ ok: true, workspaces: [{ id: "w1", name: "Acme", slug: "acme" }] });
  if (args[0] === "session" && args[1] === "list") {
    const ci = args.indexOf("--cursor");
    const page = ci >= 0 ? Number((args[ci + 1] ?? "p:0").replace(/^p:/, "")) : 0;
    const size = 5;
    const items = sessions.slice(page, page + size).map(({ id, title, repoFullName, createdAt, lastMessageAt }) => ({ id, title, repoFullName, createdAt, lastMessageAt }));
    const more = page + size < sessions.length;
    return out({ ok: true, workspaceId: "w1", items, hasMore: more, ...(more ? { nextCursor: `p:${page + size}` } : {}) });
  }
  if (args[0] === "session" && args[1] === "history") {
    const id = args[2]!;
    return { code: 0, stdout: history(id).map((e) => JSON.stringify({ workspaceId: "w1", sessionId: id, ...e })).join("\n") + "\n", stderr: "" };
  }
  if (args[0] === "session" && args[1] === "show") {
    const id = args[2]!;
    const s = sessions.find((x) => x.id === id)!;
    return out({ ok: true, workspace: { id: "w1", name: "Acme", slug: "acme" }, session: { id, createdAt: s.createdAt, repoFullName: s.repoFullName, agentType: "codex" }, historyCount: 3, messageQueueCount: 0 });
  }
  return { code: 1, stdout: "", stderr: `fake lody: unknown ${args.join(" ")}` };
};

const core = startCore({ dataDir, push: false, persona: { id: "default", name: "Ducter", identity: "" }, ooSource: noOo, importsRun: run });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
